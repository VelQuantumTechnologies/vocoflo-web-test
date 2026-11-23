"use client";

import React, { useState } from "react";
import { ArrowRight, CheckCircle2, MessageSquare, Sparkles } from "lucide-react";
import {
  CHECK_IN_CONTEXT_CUE,
  CHECK_IN_ORIENTATION_CUE,
  CHECK_IN_PARTNER_OPENER,
  CHECK_IN_SAMPLES,
  buildCheckInDebriefPrompt,
  buildCheckInListeningPrompt,
  buildPartnerReplyPrompt,
  checkInShiftCue,
  sanitizeCocoOutput,
} from "@/lib/ai/coco-prompts";
import { callTrustedAiGateway } from "@/lib/ai/gateway-client";
import { blobToBase64, MAX_WEB_AUDIO_UPLOAD_BYTES } from "@/lib/audio/recorder";
import type { CoachVoiceState } from "@/lib/audio/useCoachVoice";
import type { MicRecordingState } from "@/lib/audio/useMicRecorder";
import type {
  EvidenceLogEntry,
  LocalAudioClip,
  RoleplayTurn,
  SpeechAttempt,
  SpeechEvent,
  SpeechEventReviewState,
  SpeechEventType,
  SpeechTermMode,
  VoiceRole,
} from "@/types/vocoflo";
import { AcousticMirrorPanel } from "./AcousticMirrorPanel";
import { CocoAudioPanel } from "./CocoAudioPanel";
import { MicSpeakingPanel } from "./MicSpeakingPanel";
import { ParkCafeSceneCard } from "./VocoFloBranding";

interface CheckInViewProps {
  uid: string;
  isGuestMode?: boolean;
  speechTermMode: SpeechTermMode;
  onChangeSpeechTermMode: (mode: SpeechTermMode) => void;
  initialGoals: string[];
  initialSituations: string[];
  attempts: SpeechAttempt[];
  events: SpeechEvent[];
  localClips: Record<string, LocalAudioClip>;
  voiceState: CoachVoiceState;
  onPlayAudio: (text: string, role: VoiceRole) => void;
  onPauseAudio: () => void;
  micState: MicRecordingState;
  audioConsentAuthorized: boolean;
  onRequestConsent: (onReady: () => void) => void;
  onBeforeStartMic: () => void;
  onStartMic: () => void;
  onStopMic: () => void;
  onResetMic: () => void;
  onSaveContext: (goals: string[], situations: string[]) => Promise<void>;
  onSaveAttemptClip: (attempt: SpeechAttempt, blob?: Blob, mimeType?: string) => Promise<void>;
  onUpdateAttemptEffort: (attemptId: string, effort: number | null) => Promise<void>;
  onRunSpeechAnalysis: (
    attempt: SpeechAttempt,
    blob: Blob,
    mimeType: string,
    purpose: "assessment_analysis" | "requested_inspection"
  ) => Promise<{
    ok: boolean;
    transcript: string | null;
    summaryObservation: string | null;
    events: SpeechEvent[];
    error: string | null;
  }>;
  onUpdateEventReview: (
    eventId: string,
    reviewState: SpeechEventReviewState,
    eventType?: SpeechEventType,
    correctedLabel?: string,
    correctionNote?: string
  ) => void;
  onAddUserMoment: (
    attemptId: string,
    startSeconds: number,
    wordOrSound: string,
    note: string
  ) => void;
  onCompleteCheckIn: (debriefText: string) => Promise<void>;
  onLogEvidence: (entry: Omit<EvidenceLogEntry, "id" | "timestampIso">) => void;
  onStageChange: (stageLabel: string, completedTitles: string[], unreachedTitles: string[]) => void;
  onGoToP01: () => void;
}

const SITUATION_OPTIONS = [
  "Work meetings & team updates",
  "Introducing myself",
  "Phone or video calls",
  "Ordering at cafes / shops",
  "Conversations with friends or family",
];

const GOAL_OPTIONS = [
  "Speak with less tension and self-monitoring",
  "Stay with my message even if a word catches",
  "Participate more in meetings or groups",
  "Understand my own speaking patterns calmly",
];

export function CheckInView({
  uid,
  isGuestMode = false,
  speechTermMode,
  onChangeSpeechTermMode,
  initialGoals,
  initialSituations,
  attempts,
  events,
  localClips,
  voiceState,
  onPlayAudio,
  onPauseAudio,
  micState,
  audioConsentAuthorized,
  onRequestConsent,
  onBeforeStartMic,
  onStartMic,
  onStopMic,
  onResetMic,
  onSaveContext,
  onSaveAttemptClip,
  onUpdateAttemptEffort,
  onRunSpeechAnalysis,
  onUpdateEventReview,
  onAddUserMoment,
  onCompleteCheckIn,
  onLogEvidence,
  onStageChange,
  onGoToP01,
}: CheckInViewProps) {
  const [stage, setStage] = useState<
    "orientation" | "context" | "samples" | "shift" | "debrief"
  >("orientation");
  const [selectedSituations, setSelectedSituations] = useState<string[]>(initialSituations);
  const [selectedGoals, setSelectedGoals] = useState<string[]>(initialGoals);
  const [customSituation, setCustomSituation] = useState("");
  const [customGoal, setCustomGoal] = useState("");

  const [sampleIndex, setSampleIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [sampleCocoReplies, setSampleCocoReplies] = useState<Record<number, string>>({});
  const [sampleAttemptIds, setSampleAttemptIds] = useState<Record<number, string>>({});

  // Sample 4 Live Conversation state (up to 6 turns)
  const [conversationActive, setConversationActive] = useState(false);
  const [conversationTurns, setConversationTurns] = useState<RoleplayTurn[]>([]);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [conversationAttemptId, setConversationAttemptId] = useState<string | null>(null);

  // Stage 3 Shift experiment state
  const [shiftAttemptId, setShiftAttemptId] = useState<string | null>(null);
  const [shiftFeeling, setShiftFeeling] = useState<string>("");
  const [shiftNote, setShiftNote] = useState<string>("");

  // Stage 4 Debrief state
  const [debriefText, setDebriefText] = useState<string>("");
  const [debriefVisited, setDebriefVisited] = useState(false);

  const updateJourneyStage = (
    nextStage: typeof stage,
    nextSampleIdx = sampleIndex
  ) => {
    const allTitles = [
      "Check-In Orientation",
      "Context & Situations",
      "Sample 1: Personal Sharing",
      "Sample 2: Scene Description",
      "Sample 3: Short Reading",
      "Sample 4: Live Conversation",
      "Purpose-Shift Experiment",
      "Coco Check-In Debrief",
    ];
    let doneCount = 0;
    if (nextStage === "context") doneCount = 1;
    if (nextStage === "samples") doneCount = 2 + nextSampleIdx;
    if (nextStage === "shift") doneCount = 6;
    if (nextStage === "debrief") doneCount = debriefText ? 8 : 7;

    onStageChange(
      `Free Check-In • ${allTitles[Math.min(doneCount, allTitles.length - 1)]}`,
      allTitles.slice(0, doneCount),
      allTitles.slice(doneCount)
    );
  };

  const toggleChip = (list: string[], value: string, setter: (v: string[]) => void) => {
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  };

  const handleSampleSubmission = async (
    blob: Blob | null,
    durationSeconds: number,
    mimeType: string | null,
    runAnalysis: boolean,
    typedText: string | null
  ) => {
    const spec = CHECK_IN_SAMPLES[sampleIndex];
    setBusy(true);
    setErrorBanner(null);

    try {
      const attemptId = `att_ci_s${sampleIndex + 1}_${crypto.randomUUID().slice(0, 8)}`;
      const attempt: SpeechAttempt = {
        id: attemptId,
        userId: uid,
        sourceContext: spec.sourceContext,
        activityOrSectionId: `check_in_sample_${sampleIndex + 1}`,
        promptText: spec.cocoSpokenInvitation,
        durationSeconds: blob ? durationSeconds : 0,
        hasLocalAudio: Boolean(blob),
        analysisStatus: blob ? (runAnalysis ? "pending" : "not_requested") : "not_requested",
        disfluentTranscript: typedText,
        createdAtIso: new Date().toISOString(),
      };

      await onSaveAttemptClip(attempt, blob || undefined, mimeType || undefined);
      setSampleAttemptIds((prev) => ({ ...prev, [sampleIndex]: attemptId }));
      onResetMic();

      let transcriptForCoco = typedText;
      let summaryObs: string | null = null;
      let obsLines: string[] = [];

      if (blob && runAnalysis) {
        const analysis = await onRunSpeechAnalysis(
          attempt,
          blob,
          mimeType || "audio/webm",
          "assessment_analysis"
        );
        if (analysis.ok) {
          transcriptForCoco = analysis.transcript;
          summaryObs = analysis.summaryObservation;
          obsLines = analysis.events.map(
            (ev) => `${ev.startSeconds.toFixed(1)}s ${ev.eventType}${ev.wordOrSound ? ` (${ev.wordOrSound})` : ""}`
          );
        }
      }

      const prompt = buildCheckInListeningPrompt({
        sampleIndex,
        sampleTitle: spec.title,
        questionAsked:
          spec.pictureSceneContext
            ? `${spec.cocoSpokenInvitation}\nScene context: ${spec.pictureSceneContext}`
            : spec.readingPassage
              ? `${spec.cocoSpokenInvitation}\nPassage: "${spec.readingPassage}"`
              : spec.cocoSpokenInvitation,
        learnerTranscript: transcriptForCoco,
        isReadingSample: spec.index === 2,
        summaryObservation: summaryObs,
        speechObservations: obsLines,
        speechTermMode,
      });

      const payload: Record<string, unknown> = { prompt };
      if (!transcriptForCoco && blob && blob.size <= MAX_WEB_AUDIO_UPLOAD_BYTES) {
        payload.audioBase64 = await blobToBase64(blob);
        payload.mimeType = mimeType || "audio/webm";
      }

      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coaching_debrief",
        attemptOrSessionId: attemptId,
        payload,
        guestMode: isGuestMode,
      });

      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Coco could not generate a reply.");
        onLogEvidence({
          kind: "error",
          stage: `Check-In Sample ${sampleIndex + 1}`,
          summary: "Coco listening response failed",
          httpStatus: res.httpStatus,
          errorMessage: res.errorMessage,
        });
        return;
      }

      const reply =
        sanitizeCocoOutput(res.text) ||
        "Thank you for sharing that sample with me. Whenever you're ready, we can move to the next part.";

      setSampleCocoReplies((prev) => ({ ...prev, [sampleIndex]: reply }));
      onLogEvidence({
        kind: "coco_response",
        stage: `Check-In Sample ${sampleIndex + 1}`,
        summary: `Coco responded to Check-In sample ${sampleIndex + 1}`,
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: reply,
        transcriptAttemptId: attemptId,
      });

      if (voiceState.audioDefaultEnabled) {
        onPlayAudio(reply, "COCO");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConversationTurn = async (
    blob: Blob | null,
    durationSeconds: number,
    mimeType: string | null,
    runAnalysis: boolean,
    typedText: string | null
  ) => {
    setBusy(true);
    setErrorBanner(null);

    try {
      const learnerTurnIndex = conversationTurns.filter((t) => t.speaker === "learner").length + 1;
      const isClosingTurn = learnerTurnIndex >= 6;
      const attemptId = `att_ci_conv_t${learnerTurnIndex}_${crypto.randomUUID().slice(0, 6)}`;

      const attempt: SpeechAttempt = {
        id: attemptId,
        userId: uid,
        sourceContext: "check_in_conversation",
        activityOrSectionId: `check_in_sample_4_turn_${learnerTurnIndex}`,
        promptText:
          conversationTurns[conversationTurns.length - 1]?.message || CHECK_IN_PARTNER_OPENER,
        durationSeconds: blob ? durationSeconds : 0,
        hasLocalAudio: Boolean(blob),
        analysisStatus: blob ? (runAnalysis ? "pending" : "not_requested") : "not_requested",
        disfluentTranscript: typedText,
        createdAtIso: new Date().toISOString(),
      };
      await onSaveAttemptClip(attempt, blob || undefined, mimeType || undefined);
      setConversationAttemptId(attemptId);
      onResetMic();

      if (blob && runAnalysis) {
        await onRunSpeechAnalysis(
          attempt,
          blob,
          mimeType || "audio/webm",
          "assessment_analysis"
        );
      }

      const prompt = buildPartnerReplyPrompt({
        scenario: "Casual catch-up chat with a friendly colleague about your week.",
        partnerRole: "Friendly colleague",
        communicationPurpose: "Have an ordinary unhurried back-and-forth catch-up.",
        history: conversationTurns,
        learnerTextInput: typedText,
        hasAudio: Boolean(blob),
        isClosingTurn,
      });

      const payload: Record<string, unknown> = { prompt };
      if (!typedText && blob && blob.size <= MAX_WEB_AUDIO_UPLOAD_BYTES) {
        payload.audioBase64 = await blobToBase64(blob);
        payload.mimeType = mimeType || "audio/webm";
      }

      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "responsive_roleplay",
        attemptOrSessionId: attemptId,
        payload,
        guestMode: isGuestMode,
      });

      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Conversation partner could not reply.");
        return;
      }

      let extractedTranscript = typedText;
      let partnerReply = res.text;
      const tMatch = /TRANSCRIPT:\s*([\s\S]*?)\nREPLY:\s*([\s\S]*)/i.exec(res.text);
      if (tMatch) {
        extractedTranscript = tMatch[1].trim() || typedText;
        partnerReply = tMatch[2].trim();
      }
      partnerReply = sanitizeCocoOutput(partnerReply) || "Thanks for sharing that—it was good catching up.";

      setConversationTurns((prev) => [
        ...prev,
        {
          speaker: "learner",
          message: extractedTranscript || "(Spoken voice turn)",
          learnerTranscript: extractedTranscript,
        },
        { speaker: "partner", message: partnerReply },
      ]);

      if (isClosingTurn) {
        setConversationEnded(true);
      }

      onLogEvidence({
        kind: "coco_response",
        stage: `Check-In Sample 4 Turn ${learnerTurnIndex}`,
        summary: `Partner (Orus) replied in live conversation turn ${learnerTurnIndex}`,
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: partnerReply,
        transcriptAttemptId: attemptId,
      });

      if (voiceState.audioDefaultEnabled) {
        onPlayAudio(partnerReply, "ROLEPLAY_PARTNER");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleShiftSubmission = async (
    blob: Blob | null,
    durationSeconds: number,
    mimeType: string | null,
    runAnalysis: boolean,
    typedText: string | null
  ) => {
    setBusy(true);
    setErrorBanner(null);
    try {
      const attemptId = `att_ci_shift_${crypto.randomUUID().slice(0, 8)}`;
      const attempt: SpeechAttempt = {
        id: attemptId,
        userId: uid,
        sourceContext: "check_in_shift_experiment",
        activityOrSectionId: "check_in_stage_4_shift",
        promptText: checkInShiftCue(speechTermMode),
        durationSeconds: blob ? durationSeconds : 0,
        hasLocalAudio: Boolean(blob),
        analysisStatus: blob ? (runAnalysis ? "pending" : "not_requested") : "not_requested",
        disfluentTranscript: typedText,
        createdAtIso: new Date().toISOString(),
      };
      await onSaveAttemptClip(attempt, blob || undefined, mimeType || undefined);
      setShiftAttemptId(attemptId);
      onResetMic();

      if (blob && runAnalysis) {
        await onRunSpeechAnalysis(
          attempt,
          blob,
          mimeType || "audio/webm",
          "assessment_analysis"
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const generateDebrief = async () => {
    setStage("debrief");
    updateJourneyStage("debrief");
    setBusy(true);
    setErrorBanner(null);
    setDebriefVisited(true);

    try {
      const prompt = buildCheckInDebriefPrompt({
        attempts,
        events,
        goals: selectedGoals,
        situations: selectedSituations,
        shiftNote: [shiftFeeling, shiftNote].filter(Boolean).join(" — "),
        speechTermMode,
      });

      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coaching_debrief",
        attemptOrSessionId: "check_in_debrief",
        payload: { prompt },
        guestMode: isGuestMode,
      });

      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Could not generate Check-In debrief.");
        return;
      }

      const clean =
        sanitizeCocoOutput(res.text) ||
        "Thank you for walking through these speaking samples today. A helpful next step is Module P01, Your Identity With Your Speech, where we look gently at single speaking moments versus broader labels.";
      setDebriefText(clean);
      await onCompleteCheckIn(clean);

      onLogEvidence({
        kind: "coco_response",
        stage: "Check-In Debrief",
        summary: "Coco generated Free Check-In debrief",
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: clean,
      });

      if (voiceState.audioDefaultEnabled) {
        onPlayAudio(clean, "COCO");
      }
    } finally {
      setBusy(false);
    }
  };

  const activeSample = CHECK_IN_SAMPLES[sampleIndex];
  const currentSampleAttemptId = sampleAttemptIds[sampleIndex];
  const currentSampleAttempt = attempts.find((a) => a.id === currentSampleAttemptId);
  const shiftAttempt = attempts.find((a) => a.id === shiftAttemptId);
  const convAttempt = attempts.find((a) => a.id === conversationAttemptId);

  const debriefSpeakingNow =
    Boolean(debriefText) &&
    voiceState.activeText === debriefText.trim() &&
    (voiceState.speaking || voiceState.synthesizing);
  const canProceedToP01 = debriefVisited && !busy && !debriefSpeakingNow;

  return (
    <div className="space-y-6">
      {/* Stage indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-mintAccent">
            Flow A • Free Speaking Check-In
          </p>
          <p className="text-sm font-medium text-creamInk">
            {stage === "orientation" && "Step 1 of 5 • Orientation"}
            {stage === "context" && "Step 2 of 5 • Your Speaking Context"}
            {stage === "samples" && `Step 3 of 5 • ${activeSample.title}`}
            {stage === "shift" && "Step 4 of 5 • Gentle Purpose-Shift Experiment"}
            {stage === "debrief" && "Step 5 of 5 • Coco's Grounded Debrief"}
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["orientation", "context", "samples", "shift", "debrief"] as const).map((s) => (
            <span
              key={s}
              className={`h-2 w-8 rounded-full ${
                stage === s ? "bg-mintAccent" : "bg-emeraldBorder"
              }`}
            />
          ))}
        </div>
      </div>

      {errorBanner ? (
        <div className="rounded-xl border border-softCoral/50 bg-coralContainer/70 p-3.5 text-xs text-coralOnContainer">
          {errorBanner}
        </div>
      ) : null}

      {/* Stage 0: Orientation */}
      {stage === "orientation" ? (
        <div className="space-y-4">
          <CocoAudioPanel
            title="Coco's Welcome to Free Check-In"
            badge="Pre-generated Sulafat"
            text={CHECK_IN_ORIENTATION_CUE}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />
          <div className="rounded-2xl border border-emeraldBorder bg-emeraldSurface p-5 text-sm text-softMintInk">
            <p className="font-semibold text-creamInk">What happens in this Check-In:</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-mutedSage">
              <li>Share the everyday speaking moments and goals that matter to you.</li>
              <li>Explore 4 speaking conditions (personal share, picture, reading, live conversation).</li>
              <li>Try one gentle shift in attention and review Coco&rsquo;s grounded debrief.</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => {
              onPauseAudio();
              setStage("context");
              updateJourneyStage("context");
              if (voiceState.audioDefaultEnabled) {
                onPlayAudio(CHECK_IN_CONTEXT_CUE, "COCO");
              }
            }}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
          >
            Continue to Speaking Context
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Stage 1: Context */}
      {stage === "context" ? (
        <div className="space-y-5">
          <CocoAudioPanel
            title="Where Speaking Shows Up in Your Week"
            badge="Pre-generated Sulafat"
            text={CHECK_IN_CONTEXT_CUE}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          <div className="space-y-4 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                Preferred Terminology
              </label>
              <div className="mt-2 flex gap-2">
                {(["stammering", "stuttering"] as const).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => onChangeSpeechTermMode(term)}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium capitalize ${
                      speechTermMode === term
                        ? "bg-sagePill font-semibold text-sageInk"
                        : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                    }`}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                Important Speaking Situations
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SITUATION_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleChip(selectedSituations, opt, setSelectedSituations)}
                    className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                      selectedSituations.includes(opt)
                        ? "bg-mintAccent font-semibold text-sageInk"
                        : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex gap-2">
                <input
                  type="text"
                  value={customSituation}
                  onChange={(e) => setCustomSituation(e.target.value)}
                  placeholder="Add your own situation (optional)…"
                  className="flex-1 rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = customSituation.trim();
                    if (!v) return;
                    if (!selectedSituations.includes(v)) {
                      setSelectedSituations((s) => [...s, v]);
                    }
                    setCustomSituation("");
                  }}
                  className="rounded-xl border border-emeraldStrongBorder px-3 py-2 text-xs text-mintAccent hover:bg-emeraldRaised"
                >
                  Add
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                What You Want to Carry Into Speaking
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {GOAL_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleChip(selectedGoals, opt, setSelectedGoals)}
                    className={`rounded-full px-3.5 py-1.5 text-xs transition ${
                      selectedGoals.includes(opt)
                        ? "bg-mintAccent font-semibold text-sageInk"
                        : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex gap-2">
                <input
                  type="text"
                  value={customGoal}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  placeholder="Add your own goal (optional)…"
                  className="flex-1 rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = customGoal.trim();
                    if (!v) return;
                    if (!selectedGoals.includes(v)) {
                      setSelectedGoals((g) => [...g, v]);
                    }
                    setCustomGoal("");
                  }}
                  className="rounded-xl border border-emeraldStrongBorder px-3 py-2 text-xs text-mintAccent hover:bg-emeraldRaised"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSaveContext(selectedGoals, selectedSituations);
                onPauseAudio();
                setStage("samples");
                setSampleIndex(0);
                updateJourneyStage("samples", 0);
                if (voiceState.audioDefaultEnabled) {
                  onPlayAudio(CHECK_IN_SAMPLES[0].cocoSpokenInvitation, "COCO");
                }
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90 disabled:opacity-50"
          >
            Save Context &amp; Start Sample 1
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Stage 2: 4 Samples */}
      {stage === "samples" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {CHECK_IN_SAMPLES.map((s, idx) => (
              <button
                key={s.title}
                type="button"
                onClick={() => {
                  onResetMic();
                  setSampleIndex(idx);
                  updateJourneyStage("samples", idx);
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
                  sampleIndex === idx
                    ? "bg-sagePill font-semibold text-sageInk"
                    : "border border-emeraldBorder text-mutedSage hover:text-creamInk"
                }`}
              >
                Sample {idx + 1}
              </button>
            ))}
          </div>

          <CocoAudioPanel
            title={activeSample.title}
            badge="Pre-generated Sulafat"
            text={activeSample.cocoSpokenInvitation}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          {activeSample.index === 1 ? <ParkCafeSceneCard /> : null}

          {activeSample.readingPassage ? (
            <div className="rounded-2xl border border-emeraldStrongBorder bg-emeraldField/70 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mintAccent">
                Reading Passage
              </p>
              <p className="mt-2 font-display text-lg leading-relaxed text-creamInk">
                &ldquo;{activeSample.readingPassage}&rdquo;
              </p>
            </div>
          ) : null}

          {/* Samples 1-3 */}
          {activeSample.index < 3 ? (
            <div className="space-y-4">
              <MicSpeakingPanel
                recordingState={micState}
                audioConsentAuthorized={audioConsentAuthorized}
                onRequestConsent={() => onRequestConsent(onStartMic)}
                onBeforeStart={onBeforeStartMic}
                onStartRecording={onStartMic}
                onStopRecording={onStopMic}
                onResetRecording={onResetMic}
                busy={busy}
                isGuestMode={isGuestMode}
                submitLabel="Submit Sample to Coco"
                onSubmitAudio={(blob, dur, mime, runAna) =>
                  handleSampleSubmission(blob, dur, mime, runAna, null)
                }
                onSubmitTypedFallback={(txt) =>
                  handleSampleSubmission(null, 0, null, false, txt)
                }
              />

              {sampleCocoReplies[sampleIndex] ? (
                <CocoAudioPanel
                  title="Coco's Reply"
                  badge={isGuestMode ? "Simulated (Guest Mode)" : "Live Sulafat"}
                  text={sampleCocoReplies[sampleIndex]}
                  voiceState={voiceState}
                  onPlay={onPlayAudio}
                  onPause={onPauseAudio}
                />
              ) : null}

              {currentSampleAttempt ? (
                <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-creamInk">
                      How effortful did that sample feel from the inside? (Optional)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => onUpdateAttemptEffort(currentSampleAttempt.id, n)}
                          className={`h-8 w-8 rounded-full text-xs font-semibold ${
                            currentSampleAttempt.selfReportEffort === n
                              ? "bg-mintAccent text-sageInk"
                              : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onUpdateAttemptEffort(currentSampleAttempt.id, null)}
                        className="rounded-full border border-emeraldBorder px-3 py-1 text-[11px] text-mutedSage"
                      >
                        Skip
                      </button>
                    </div>
                  </div>

                  <AcousticMirrorPanel
                    attempt={currentSampleAttempt}
                    events={events}
                    clip={localClips[currentSampleAttempt.id]}
                    onUpdateEventReview={onUpdateEventReview}
                    onAddUserMoment={onAddUserMoment}
                    onRequestInspection={async (att, clip) => {
                      const res = await fetch(clip.blobUrl);
                      const b = await res.blob();
                      await onRunSpeechAnalysis(att, b, clip.mimeType, "requested_inspection");
                    }}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetMic();
                    const nextIdx = sampleIndex + 1;
                    setSampleIndex(nextIdx);
                    updateJourneyStage("samples", nextIdx);
                    if (voiceState.audioDefaultEnabled) {
                      onPlayAudio(CHECK_IN_SAMPLES[nextIdx].cocoSpokenInvitation, "COCO");
                    }
                  }}
                  className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
                >
                  {sampleCocoReplies[sampleIndex] ? "Next Sample" : "Skip to Next Sample"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Sample 4: Live Two-Way Conversation */
            <div className="space-y-4">
              {!conversationActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setConversationActive(true);
                    setConversationTurns([{ speaker: "partner", message: CHECK_IN_PARTNER_OPENER }]);
                    if (voiceState.audioDefaultEnabled) {
                      onPlayAudio(CHECK_IN_PARTNER_OPENER, "ROLEPLAY_PARTNER");
                    }
                  }}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
                >
                  <MessageSquare className="h-4 w-4" />
                  Start Live Conversation (Partner: Orus)
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-warmGold">
                        Conversation History ({conversationTurns.filter((t) => t.speaker === "learner").length}/6 turns)
                      </p>
                      {!conversationEnded ? (
                        <button
                          type="button"
                          onClick={() => setConversationEnded(true)}
                          className="rounded-full border border-emeraldStrongBorder px-3 py-1 text-xs text-mutedSage hover:text-creamInk"
                        >
                          Wrap Up Early
                        </button>
                      ) : null}
                    </div>

                    <div className="space-y-2.5">
                      {conversationTurns.map((t, i) =>
                        t.speaker === "partner" ? (
                          <CocoAudioPanel
                            key={i}
                            title="Colleague (Orus)"
                            badge={
                              isGuestMode && i > 0 ? "Simulated Partner (Guest Mode)" : undefined
                            }
                            role="ROLEPLAY_PARTNER"
                            text={t.message}
                            voiceState={voiceState}
                            onPlay={onPlayAudio}
                            onPause={onPauseAudio}
                          />
                        ) : (
                          <div
                            key={i}
                            className="ml-8 rounded-2xl border border-emeraldStrongBorder bg-emeraldField px-4 py-2.5 text-sm text-creamInk"
                          >
                            <p className="text-[10px] font-semibold uppercase text-mintAccent">
                              You
                            </p>
                            <p className="mt-0.5">{t.message}</p>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {!conversationEnded ? (
                    <MicSpeakingPanel
                      recordingState={micState}
                      audioConsentAuthorized={audioConsentAuthorized}
                      onRequestConsent={() => onRequestConsent(onStartMic)}
                      onBeforeStart={onBeforeStartMic}
                      onStartRecording={onStartMic}
                      onStopRecording={onStopMic}
                      onResetRecording={onResetMic}
                      busy={busy}
                      isGuestMode={isGuestMode}
                      submitLabel="Send Reply to Colleague"
                      onSubmitAudio={(blob, dur, mime, runAna) =>
                        handleConversationTurn(blob, dur, mime, runAna, null)
                      }
                      onSubmitTypedFallback={(txt) =>
                        handleConversationTurn(null, 0, null, false, txt)
                      }
                    />
                  ) : null}

                  {convAttempt ? (
                    <AcousticMirrorPanel
                      attempt={convAttempt}
                      events={events}
                      clip={localClips[convAttempt.id]}
                      onUpdateEventReview={onUpdateEventReview}
                      onAddUserMoment={onAddUserMoment}
                      titleOverride="Optional Acoustic Mirror (Latest Conversation Turn)"
                    />
                  ) : null}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  onPauseAudio();
                  onResetMic();
                  setStage("shift");
                  updateJourneyStage("shift");
                  if (voiceState.audioDefaultEnabled) {
                    onPlayAudio(checkInShiftCue(speechTermMode), "COCO");
                  }
                }}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
              >
                Continue to Purpose-Shift Experiment
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Stage 3: Gentle Purpose-Shift Experiment */}
      {stage === "shift" ? (
        <div className="space-y-5">
          <CocoAudioPanel
            title="Gentle Purpose-Shift Experiment"
            badge="Pre-generated Sulafat"
            text={checkInShiftCue(speechTermMode)}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          <MicSpeakingPanel
            recordingState={micState}
            audioConsentAuthorized={audioConsentAuthorized}
            onRequestConsent={() => onRequestConsent(onStartMic)}
            onBeforeStart={onBeforeStartMic}
            onStartRecording={onStartMic}
            onStopRecording={onStopMic}
            onResetRecording={onResetMic}
            busy={busy}
            isGuestMode={isGuestMode}
            submitLabel="Save Experiment Clip"
            onSubmitAudio={(blob, dur, mime, runAna) =>
              handleShiftSubmission(blob, dur, mime, runAna, null)
            }
            onSubmitTypedFallback={(txt) =>
              handleShiftSubmission(null, 0, null, false, txt)
            }
          />

          {shiftAttempt ? (
            <AcousticMirrorPanel
              attempt={shiftAttempt}
              events={events}
              clip={localClips[shiftAttempt.id]}
              onUpdateEventReview={onUpdateEventReview}
              onAddUserMoment={onAddUserMoment}
            />
          ) : null}

          <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
            <p className="text-xs font-semibold text-creamInk">
              Did anything feel slightly lighter when focusing on your message?
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "Noticeably lighter",
                "Slightly lighter",
                "About the same",
                "Unsure / mixed",
              ].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setShiftFeeling(opt)}
                  className={`rounded-full px-3.5 py-1.5 text-xs ${
                    shiftFeeling === opt
                      ? "bg-mintAccent font-semibold text-sageInk"
                      : "border border-emeraldStrongBorder text-softMintInk"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={shiftNote}
              onChange={(e) => setShiftNote(e.target.value)}
              placeholder="Optional observation in your own words…"
              className="w-full rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
            />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={generateDebrief}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Generate Coco&rsquo;s Check-In Debrief
          </button>
        </div>
      ) : null}

      {/* Stage 4: Debrief */}
      {stage === "debrief" ? (
        <div className="space-y-5">
          {busy && !debriefText ? (
            <div className="rounded-2xl border border-warmGold/40 bg-emeraldSurface p-5 text-sm text-warmGold">
              Coco is reviewing your recorded check-in evidence and preparing a grounded debrief…
            </div>
          ) : null}

          {debriefText ? (
            <CocoAudioPanel
              title="Coco's Check-In Debrief"
              badge={isGuestMode ? "Simulated (Guest Mode)" : "Live Sulafat"}
              text={debriefText}
              voiceState={voiceState}
              onPlay={onPlayAudio}
              onPause={onPauseAudio}
            />
          ) : null}

          <div className="rounded-2xl border border-emeraldStrongBorder bg-emeraldField/60 p-4">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-mintAccent" />
              <div className="space-y-1 text-xs text-softMintInk">
                <p className="font-semibold text-creamInk">
                  Recommended Next Step: Module P01 — Your Identity With Your Speech
                </p>
                <p className="text-mutedSage">
                  {debriefSpeakingNow
                    ? "The Begin P01 button unlocks automatically when Coco finishes speaking the debrief (or press Pause above to read at your own pace)."
                    : isGuestMode
                      ? "Guest Check-In completed in local session memory (not written to Firestore). Ready for P01 whenever you choose."
                      : "Check-In saved to your isolated test profile. Ready for P01 whenever you choose."}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={!canProceedToP01}
              onClick={onGoToP01}
              className="mt-4 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {debriefSpeakingNow
                ? "Listening to Coco's Debrief…"
                : "Begin Module P01"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
