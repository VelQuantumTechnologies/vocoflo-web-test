"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight, Award, CheckCircle2, ShieldAlert } from "lucide-react";
import p01Content from "@/content/p01.json";
import {
  buildP01AttemptResponsePrompt,
  buildP01FollowUpClosingPrompt,
  buildP01LabelReflectionPrompt,
  buildP01MirrorOpening,
  buildP01MirrorResponsePrompt,
  buildProvisionalRoadmap,
  getP01SectionsForBeat,
  sanitizeCocoOutput,
} from "@/lib/ai/coco-prompts";
import { callTrustedAiGateway } from "@/lib/ai/gateway-client";
import { blobToBase64, MAX_WEB_AUDIO_UPLOAD_BYTES } from "@/lib/audio/recorder";
import type { CoachVoiceState } from "@/lib/audio/useCoachVoice";
import type { MicRecordingState } from "@/lib/audio/useMicRecorder";
import type {
  CoachMemoryItem,
  EvidenceLogEntry,
  LearnerProfile,
  LessonProgress,
  LocalAudioClip,
  P01BeatId,
  P01MirrorChoice,
  P01ShiftFeeling,
  SpeechAttempt,
  SpeechEvent,
  SpeechEventReviewState,
  SpeechEventType,
  SpeechTermMode,
  TransferPlan,
  VoiceRole,
} from "@/types/vocoflo";
import { AcousticMirrorPanel } from "./AcousticMirrorPanel";
import { CocoAudioPanel } from "./CocoAudioPanel";
import { MicSpeakingPanel } from "./MicSpeakingPanel";

interface P01ViewProps {
  uid: string;
  isGuestMode?: boolean;
  profile: LearnerProfile | null;
  initialProgress?: LessonProgress | null;
  memories: CoachMemoryItem[];
  attempts: SpeechAttempt[];
  events: SpeechEvent[];
  localClips: Record<string, LocalAudioClip>;
  speechTermMode: SpeechTermMode;
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
  onSaveAttemptClip: (attempt: SpeechAttempt, blob?: Blob, mimeType?: string) => Promise<void>;
  onRunSpeechAnalysis: (
    attempt: SpeechAttempt,
    blob: Blob,
    mimeType: string,
    purpose: "lesson_analysis" | "requested_inspection"
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
  onSaveP01Progress: (
    beatIndex: number,
    completedSteps: string[],
    skippedSteps: string[],
    sessionCompleted: boolean,
    reviewChoice?: string | null,
    understandingChoiceId?: string | null
  ) => Promise<void>;
  onSaveTransferPlanAndMemory: (plan: TransferPlan, saveMemory: boolean) => Promise<void>;
  onLogEvidence: (entry: Omit<EvidenceLogEntry, "id" | "timestampIso">) => void;
  onSyncScope: (
    activeBeat: P01BeatId,
    completedTitles: string[],
    unreachedTitles: string[]
  ) => void;
}

const BEAT_META: Array<{ id: P01BeatId; label: string; title: string }> = [
  { id: "p01_beat_1_mirror", label: "Beat 1", title: "The Mirror" },
  { id: "p01_beat_2_speak_first", label: "Beat 2", title: "Speak First (Attempt 1)" },
  { id: "p01_beat_3_one_idea", label: "Beat 3", title: "One Idea & Name-Badge" },
  { id: "p01_beat_4_live_shift", label: "Beat 4", title: "The Live Shift (Attempt 2)" },
  { id: "p01_beat_5_transfer", label: "Beat 5", title: "Transfer & Initial Focus" },
];

export function P01View({
  uid,
  isGuestMode = false,
  profile,
  initialProgress,
  memories,
  attempts,
  events,
  localClips,
  speechTermMode,
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
  onSaveAttemptClip,
  onRunSpeechAnalysis,
  onUpdateEventReview,
  onAddUserMoment,
  onSaveP01Progress,
  onSaveTransferPlanAndMemory,
  onLogEvidence,
  onSyncScope,
}: P01ViewProps) {
  const [beatIndex, setBeatIndex] = useState(
    Math.min(4, Math.max(0, initialProgress?.currentStepIndex ?? 0))
  );
  const [busy, setBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [completedBeats, setCompletedBeats] = useState<string[]>(
    initialProgress?.completedSteps ?? []
  );
  const [skippedBeats, setSkippedBeats] = useState<string[]>(
    initialProgress?.skippedSteps ?? []
  );

  // Beat 1
  const mirrorOpening = useMemo(
    () => buildP01MirrorOpening({ profile, memories, attempts, speechTermMode }),
    [profile, memories, attempts, speechTermMode]
  );
  const [mirrorChoice, setMirrorChoice] = useState<P01MirrorChoice | null>(null);
  const [mirrorNote, setMirrorNote] = useState("");
  const [mirrorReply, setMirrorReply] = useState<string | null>(null);

  // Beat 2 (Attempt 1)
  const [attempt1Id, setAttempt1Id] = useState<string | null>(null);
  const [attempt1Reply, setAttempt1Reply] = useState<string | null>(null);

  // Beat 3 (One Idea, Badge Visual, Understanding Check, Label Reflection)
  const [badgePutDown, setBadgePutDown] = useState(false);
  const [selectedQuizChoice, setSelectedQuizChoice] = useState<string | null>(
    initialProgress?.understandingChoiceId ?? null
  );
  const [familiarLabel, setFamiliarLabel] = useState("");
  const [labelReflectionReply, setLabelReflectionReply] = useState<string | null>(null);

  // Beat 4 (Attempt 2, Follow-Up, Side-by-side, Feeling)
  const [attempt2Id, setAttempt2Id] = useState<string | null>(null);
  const [attempt2Reply, setAttempt2Reply] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpClosing, setFollowUpClosing] = useState<string | null>(null);
  const [shiftFeeling, setShiftFeeling] = useState<P01ShiftFeeling | null>(null);

  // Beat 5 (Transfer + Provisional 4-Week Focus)
  const [planSituation, setPlanSituation] = useState(
    profile?.importantSituations?.[0] || "An ordinary team introduction or coffee chat this week"
  );
  const [planAction, setPlanAction] = useState(
    "Set down the confident-or-poor speaker badge for one moment and focus on sharing one useful point."
  );
  const [planObservation, setPlanObservation] = useState(
    "Note one specific event afterward without stretching it into a verdict."
  );
  const [planChoiceMade, setPlanChoiceMade] = useState<"saved" | "declined" | null>(null);
  const [sessionCompleted, setSessionCompleted] = useState(
    Boolean(initialProgress?.sessionCompleted)
  );
  const [nextStepChoice, setNextStepChoice] = useState<"continue" | "repeat" | "gentler" | null>(
    null
  );

  const p01PromptSection7 =
    p01Content.sections.find((s) => s.id === "P01-07")?.narration ||
    "Tell me about something you enjoy outside work. Speak in your usual way.";
  const p01PromptSection8 =
    p01Content.sections.find((s) => s.id === "P01-08")?.narration ||
    "For this next attempt, keep one clear purpose and share one interest.";
  const p01Understanding = p01Content.sections.find((s) => s.id === "P01-05");
  const p01MeaningNarration = [
    p01Content.sections.find((s) => s.id === "P01-04")?.narration,
    p01Content.sections.find((s) => s.id === "P01-02")?.narration,
    p01Content.sections.find((s) => s.id === "P01-03")?.narration,
  ]
    .filter(Boolean)
    .join("\n\n");

  const goToBeat = async (nextIdx: number, markedId?: string, wasSkipped = false) => {
    onPauseAudio();
    onResetMic();
    setErrorBanner(null);

    const nextCompleted =
      markedId && !wasSkipped && !completedBeats.includes(markedId)
        ? [...completedBeats, markedId]
        : completedBeats;
    const nextSkipped =
      markedId && wasSkipped && !skippedBeats.includes(markedId)
        ? [...skippedBeats, markedId]
        : skippedBeats;

    setCompletedBeats(nextCompleted);
    setSkippedBeats(nextSkipped);
    setBeatIndex(nextIdx);

    const beatMeta = BEAT_META[nextIdx];
    onSyncScope(
      beatMeta.id,
      BEAT_META.slice(0, nextIdx).map((b) => `${b.label}: ${b.title}`),
      BEAT_META.slice(nextIdx + 1).map((b) => `${b.label}: ${b.title}`)
    );
    await onSaveP01Progress(
      nextIdx,
      nextCompleted,
      nextSkipped,
      sessionCompleted,
      shiftFeeling,
      selectedQuizChoice
    );
  };

  const handleMirrorSubmit = async (choice: P01MirrorChoice, note?: string) => {
    setMirrorChoice(choice);
    setBusy(true);
    setErrorBanner(null);
    try {
      const prompt = buildP01MirrorResponsePrompt({
        choice,
        learnerNote: note,
        groundedContextLabel: mirrorOpening.groundedContextLabel,
        speechTermMode,
      });
      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coaching_debrief",
        attemptOrSessionId: "p01_beat_1_mirror",
        payload: { prompt },
        guestMode: isGuestMode,
      });
      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Coco could not reply to Beat 1.");
        return;
      }
      const clean =
        sanitizeCocoOutput(res.text) ||
        "Thank you for sharing how that shows up for you. Whenever you're ready, let's start with an ordinary speaking moment in Beat 2.";
      setMirrorReply(clean);
      onLogEvidence({
        kind: "coco_response",
        stage: "P01 Beat 1 (Mirror)",
        summary: `Coco responded to Mirror choice (${choice})`,
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

  const handleP01AttemptSubmit = async (
    isAttemptTwo: boolean,
    blob: Blob | null,
    durationSeconds: number,
    mimeType: string | null,
    runAnalysis: boolean,
    typedText: string | null
  ) => {
    setBusy(true);
    setErrorBanner(null);
    try {
      const sectionId = isAttemptTwo ? "P01-08" : "P01-07";
      const attemptId = `att_p01_${isAttemptTwo ? "a2" : "a1"}_${crypto.randomUUID().slice(0, 8)}`;
      const attempt: SpeechAttempt = {
        id: attemptId,
        userId: uid,
        sourceContext: "lesson_p01",
        activityOrSectionId: sectionId,
        promptText: isAttemptTwo ? p01PromptSection8 : p01PromptSection7,
        durationSeconds: blob ? durationSeconds : 0,
        hasLocalAudio: Boolean(blob),
        analysisStatus: blob ? (runAnalysis ? "pending" : "not_requested") : "not_requested",
        disfluentTranscript: typedText,
        createdAtIso: new Date().toISOString(),
      };

      await onSaveAttemptClip(attempt, blob || undefined, mimeType || undefined);
      if (isAttemptTwo) {
        setAttempt2Id(attemptId);
      } else {
        setAttempt1Id(attemptId);
      }
      onResetMic();

      let transcriptForCoco = typedText;
      let analysisErrorReason: string | null = null;

      if (blob && runAnalysis) {
        const analysis = await onRunSpeechAnalysis(
          attempt,
          blob,
          mimeType || "audio/webm",
          "lesson_analysis"
        );
        if (analysis.ok) {
          transcriptForCoco = analysis.transcript;
        } else {
          analysisErrorReason = analysis.error;
        }
      }

      const canAttachDirectAudio =
        !transcriptForCoco && Boolean(blob) && (blob?.size || 0) <= MAX_WEB_AUDIO_UPLOAD_BYTES;

      const prompt = buildP01AttemptResponsePrompt({
        isAttemptTwo,
        learnerTranscriptOrText: transcriptForCoco,
        hasDirectAudioAttachment: canAttachDirectAudio,
        analysisUnavailableReason: analysisErrorReason,
        speechTermMode,
      });

      const payload: Record<string, unknown> = { prompt };
      if (canAttachDirectAudio && blob) {
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
        setErrorBanner(res.errorMessage || "Coco could not reply to your P01 attempt.");
        onLogEvidence({
          kind: "error",
          stage: isAttemptTwo ? "P01 Beat 4" : "P01 Beat 2",
          summary: "Coco P01 attempt reply failed",
          httpStatus: res.httpStatus,
          errorMessage: res.errorMessage,
        });
        return;
      }

      const clean =
        sanitizeCocoOutput(res.text) ||
        "Thank you for sharing that. Whenever you're ready, we can look at the next idea together.";

      if (isAttemptTwo) {
        setAttempt2Reply(clean);
      } else {
        setAttempt1Reply(clean);
      }

      onLogEvidence({
        kind: "coco_response",
        stage: isAttemptTwo ? "P01 Beat 4 (Attempt 2)" : "P01 Beat 2 (Attempt 1)",
        summary: `Coco responded to P01 ${isAttemptTwo ? "Attempt 2" : "Attempt 1"}`,
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: clean,
        transcriptAttemptId: attemptId,
      });

      if (voiceState.audioDefaultEnabled) {
        onPlayAudio(clean, "COCO");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLabelReflection = async () => {
    const clean = familiarLabel.trim();
    if (!clean) return;
    setBusy(true);
    setErrorBanner(null);
    try {
      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coaching_debrief",
        attemptOrSessionId: "p01_beat_3_label",
        payload: { prompt: buildP01LabelReflectionPrompt(clean, speechTermMode) },
        guestMode: isGuestMode,
      });
      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Could not reflect on label.");
        return;
      }
      const reply = sanitizeCocoOutput(res.text);
      setLabelReflectionReply(reply);
      onLogEvidence({
        kind: "coco_response",
        stage: "P01 Beat 3 (Label Reflection)",
        summary: "Coco reflected on learner's speaking label",
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: reply,
      });
      if (voiceState.audioDefaultEnabled && reply) {
        onPlayAudio(reply, "COCO");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleBeat4FollowUp = async () => {
    const clean = followUpText.trim();
    if (!clean || !attempt2Reply) return;
    setBusy(true);
    setErrorBanner(null);
    try {
      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coaching_debrief",
        attemptOrSessionId: "p01_beat_4_followup",
        payload: {
          prompt: buildP01FollowUpClosingPrompt(attempt2Reply, clean, speechTermMode),
        },
        guestMode: isGuestMode,
      });
      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Coco could not close the follow-up.");
        return;
      }
      const reply = sanitizeCocoOutput(res.text);
      setFollowUpClosing(reply);
      onLogEvidence({
        kind: "coco_response",
        stage: "P01 Beat 4 (Follow-Up)",
        summary: "Coco closed P01 Beat 4 follow-up",
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: reply,
      });
      if (voiceState.audioDefaultEnabled && reply) {
        onPlayAudio(reply, "COCO");
      }
    } finally {
      setBusy(false);
    }
  };

  const attempt1 = attempts.find((a) => a.id === attempt1Id);
  const attempt2 = attempts.find((a) => a.id === attempt2Id);
  const provisionalPlan = useMemo(
    () =>
      buildProvisionalRoadmap({
        profile,
        memories,
        beat4Feeling: shiftFeeling,
      }),
    [profile, memories, shiftFeeling]
  );

  // Sync sections visible to Ask Coco
  void getP01SectionsForBeat(BEAT_META[beatIndex].id);

  return (
    <div className="space-y-6">
      {/* Beat Navigation Header */}
      <div className="rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mintAccent">
              Flow B • P01: Your Identity With Your Speech
            </p>
            <h2 className="font-display text-lg font-semibold text-creamInk">
              {BEAT_META[beatIndex].label} — {BEAT_META[beatIndex].title}
            </h2>
          </div>
          <span className="rounded-full border border-emeraldStrongBorder px-3 py-1 text-xs text-mutedSage">
            {beatIndex + 1} / 5 Beats
          </span>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {BEAT_META.map((b, idx) => (
            <button
              key={b.id}
              type="button"
              onClick={() => goToBeat(idx)}
              className={`rounded-lg px-2 py-1.5 text-center text-[11px] transition ${
                idx === beatIndex
                  ? "bg-sagePill font-semibold text-sageInk"
                  : completedBeats.includes(b.id)
                    ? "bg-emeraldField text-mintAccent"
                    : "border border-emeraldBorder text-mutedSage hover:text-creamInk"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {errorBanner ? (
        <div className="rounded-xl border border-softCoral/50 bg-coralContainer/70 p-3.5 text-xs text-coralOnContainer">
          {errorBanner}
        </div>
      ) : null}

      {/* BEAT 1: THE MIRROR */}
      {beatIndex === 0 ? (
        <div className="space-y-4">
          <CocoAudioPanel
            title="Coco's Mirror Opening"
            badge={mirrorOpening.hasGenuineMemory ? "Memory Grounded" : "Neutral Opening"}
            text={mirrorOpening.text}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
            <p className="text-xs font-semibold text-creamInk">
              When one sticky word happens, does it ever feel like it expands into a wider
              verdict about you?
            </p>
            <div className="flex flex-wrap gap-2">
              {(["often", "sometimes", "rarely", "skip"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  onClick={() => handleMirrorSubmit(c)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold capitalize ${
                    mirrorChoice === c
                      ? "bg-mintAccent text-sageInk"
                      : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={mirrorNote}
                onChange={(e) => setMirrorNote(e.target.value)}
                placeholder="Or reply to Coco in your own words…"
                className="flex-1 rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
              <button
                type="button"
                disabled={busy || !mirrorNote.trim()}
                onClick={() => handleMirrorSubmit("speak", mirrorNote.trim())}
                className="rounded-xl bg-sagePill px-4 py-2 text-xs font-semibold text-sageInk disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>

          {mirrorReply ? (
            <CocoAudioPanel
              title="Coco's Response"
              badge={isGuestMode ? "Simulated (Guest Mode)" : "Live Sulafat"}
              text={mirrorReply}
              voiceState={voiceState}
              onPlay={onPlayAudio}
              onPause={onPauseAudio}
            />
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              goToBeat(1, "p01_beat_1_mirror", mirrorChoice === "skip");
              if (voiceState.audioDefaultEnabled) {
                onPlayAudio(p01PromptSection7, "COCO");
              }
            }}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
          >
            Continue to Beat 2 (Speak First)
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* BEAT 2: SPEAK FIRST (ATTEMPT 1) */}
      {beatIndex === 1 ? (
        <div className="space-y-4">
          <CocoAudioPanel
            title="Speak First — Something You Enjoy Outside Work"
            badge="Pre-generated Sulafat"
            text={p01PromptSection7}
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
            submitLabel="Submit Attempt 1 to Coco"
            onSubmitAudio={(blob, dur, mime, runAna) =>
              handleP01AttemptSubmit(false, blob, dur, mime, runAna, null)
            }
            onSubmitTypedFallback={(txt) =>
              handleP01AttemptSubmit(false, null, 0, null, false, txt)
            }
          />

          {attempt1Reply ? (
            <CocoAudioPanel
              title="Coco's Response (Attempt 1)"
              badge={isGuestMode ? "Simulated (Guest Mode)" : "Live Sulafat"}
              text={attempt1Reply}
              voiceState={voiceState}
              onPlay={onPlayAudio}
              onPause={onPauseAudio}
            />
          ) : null}

          {attempt1 ? (
            <AcousticMirrorPanel
              attempt={attempt1}
              events={events}
              clip={localClips[attempt1.id]}
              onUpdateEventReview={onUpdateEventReview}
              onAddUserMoment={onAddUserMoment}
              onRequestInspection={async (att, clip) => {
                const res = await fetch(clip.blobUrl);
                const b = await res.blob();
                await onRunSpeechAnalysis(att, b, clip.mimeType, "requested_inspection");
              }}
            />
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              goToBeat(2, "p01_beat_2_speak_first", !attempt1);
              if (voiceState.audioDefaultEnabled && p01MeaningNarration) {
                onPlayAudio(p01MeaningNarration, "COCO");
              }
            }}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
          >
            {attempt1Reply ? "Continue to Beat 3 (One Idea)" : "Skip to Beat 3 (One Idea)"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* BEAT 3: ONE IDEA & NAME-BADGE METAPHOR */}
      {beatIndex === 2 ? (
        <div className="space-y-5">
          {/* Interactive Name-Badge Metaphor */}
          <div className="rounded-2xl border border-emeraldStrongBorder bg-emeraldSurface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                  Visual Metaphor • Name Badge vs Suit of Armour
                </p>
                <p className="mt-1 text-sm text-softMintInk">
                  {badgePutDown
                    ? "Badge set on the table for this conversation — your values and voice still have room."
                    : "When a description hardens into armour, every sentence feels like it has to defend it."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBadgePutDown((v) => !v)}
                className="rounded-full bg-sagePill px-4 py-2 text-xs font-semibold text-sageInk hover:opacity-90"
              >
                {badgePutDown ? "Pick Up Badge" : "Set Badge on the Table"}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div
                className={`rounded-xl border p-4 transition ${
                  !badgePutDown
                    ? "border-warmGold/70 bg-emeraldField"
                    : "border-emeraldBorder bg-emeraldCanvas/60 opacity-60"
                }`}
              >
                <div className="flex items-center gap-2 text-warmGold">
                  <ShieldAlert className="h-4 w-4" />
                  <p className="text-xs font-semibold">Held Tightly (Verdict / Rule)</p>
                </div>
                <p className="mt-1.5 text-xs text-softMintInk">
                  &ldquo;I am a poor speaker&rdquo; or &ldquo;I must always sound confident.&rdquo;
                </p>
              </div>
              <div
                className={`rounded-xl border p-4 transition ${
                  badgePutDown
                    ? "border-mintAccent bg-emeraldField"
                    : "border-emeraldBorder bg-emeraldCanvas/60 opacity-75"
                }`}
              >
                <div className="flex items-center gap-2 text-mintAccent">
                  <Award className="h-4 w-4" />
                  <p className="text-xs font-semibold">Flexible (Specific Event)</p>
                </div>
                <p className="mt-1.5 text-xs text-softMintInk">
                  &ldquo;One word caught during my introduction — I still have something worth saying.&rdquo;
                </p>
              </div>
            </div>
          </div>

          {p01MeaningNarration ? (
            <CocoAudioPanel
              title="Event vs. Verdict — Name-Badge Idea"
              badge="Pre-generated Sulafat"
              text={p01MeaningNarration}
              voiceState={voiceState}
              onPlay={onPlayAudio}
              onPause={onPauseAudio}
            />
          ) : null}

          {/* Understanding Check */}
          {p01Understanding?.exercise?.choices ? (
            <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                Quick Distinction Check
              </p>
              <p className="text-sm font-medium text-creamInk">
                {p01Understanding.exercise.prompt}
              </p>
              <div className="space-y-2">
                {p01Understanding.exercise.choices.map((ch) => {
                  const chosen = selectedQuizChoice === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setSelectedQuizChoice(ch.id);
                        onSaveP01Progress(
                          beatIndex,
                          completedBeats,
                          skippedBeats,
                          sessionCompleted,
                          shiftFeeling,
                          ch.id
                        );
                      }}
                      className={`w-full rounded-xl border p-3 text-left text-xs transition ${
                        chosen
                          ? ch.id === p01Understanding.exercise?.correctChoiceId
                            ? "border-mintAccent bg-emeraldField text-creamInk"
                            : "border-warmGold bg-emeraldRaised text-creamInk"
                          : "border-emeraldBorder bg-emeraldCanvas text-softMintInk hover:border-emeraldStrongBorder"
                      }`}
                    >
                      <span className="font-semibold">{ch.id}.</span> {ch.text}
                    </button>
                  );
                })}
              </div>
              {selectedQuizChoice ? (
                <p className="rounded-xl border border-emeraldStrongBorder bg-emeraldRaised p-3 text-xs text-mintHighlight">
                  {
                    p01Understanding.exercise.choices.find(
                      (c) => c.id === selectedQuizChoice
                    )?.feedback
                  }
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Optional Label Reflection */}
          <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-5">
            <p className="text-xs font-semibold text-creamInk">
              Optional: Name one familiar label or rule that sometimes shows up for you
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={familiarLabel}
                onChange={(e) => setFamiliarLabel(e.target.value)}
                placeholder="e.g. 'They'll think I'm unprepared if I hesitate'"
                className="flex-1 rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
              <button
                type="button"
                disabled={busy || !familiarLabel.trim()}
                onClick={handleLabelReflection}
                className="rounded-xl bg-sagePill px-4 py-2 text-xs font-semibold text-sageInk disabled:opacity-40"
              >
                Reflect with Coco
              </button>
            </div>
            {labelReflectionReply ? (
              <CocoAudioPanel
                title="Coco on Your Label"
                badge={isGuestMode ? "Simulated (Guest Mode)" : "Live Sulafat"}
                text={labelReflectionReply}
                voiceState={voiceState}
                onPlay={onPlayAudio}
                onPause={onPauseAudio}
              />
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              goToBeat(3, "p01_beat_3_one_idea", false);
              if (voiceState.audioDefaultEnabled) {
                onPlayAudio(p01PromptSection8, "COCO");
              }
            }}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
          >
            Continue to Beat 4 (The Live Shift)
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* BEAT 4: THE LIVE SHIFT (ATTEMPT 2 + COMPARISON) */}
      {beatIndex === 3 ? (
        <div className="space-y-5">
          <CocoAudioPanel
            title="Attempt 2 — Same Topic, One Clear Purpose"
            badge="Pre-generated Sulafat"
            text={p01PromptSection8}
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
            submitLabel="Submit Attempt 2 to Coco"
            onSubmitAudio={(blob, dur, mime, runAna) =>
              handleP01AttemptSubmit(true, blob, dur, mime, runAna, null)
            }
            onSubmitTypedFallback={(txt) =>
              handleP01AttemptSubmit(true, null, 0, null, false, txt)
            }
          />

          {attempt2Reply ? (
            <div className="space-y-3">
              <CocoAudioPanel
                title="Coco's Response & Follow-Up (Attempt 2)"
                badge={isGuestMode ? "Simulated (Guest Mode)" : "Live Sulafat"}
                text={attempt2Reply}
                voiceState={voiceState}
                onPlay={onPlayAudio}
                onPause={onPauseAudio}
              />
              {!followUpClosing ? (
                <div className="flex gap-2 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
                  <input
                    type="text"
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    placeholder="Reply briefly to Coco's follow-up question (optional)…"
                    className="flex-1 rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
                  />
                  <button
                    type="button"
                    disabled={busy || !followUpText.trim()}
                    onClick={handleBeat4FollowUp}
                    className="rounded-xl bg-sagePill px-4 py-2 text-xs font-semibold text-sageInk disabled:opacity-40"
                  >
                    Reply
                  </button>
                </div>
              ) : (
                <CocoAudioPanel
                  title="Coco's Closing Thought"
                  badge={isGuestMode ? "Simulated (Guest Mode)" : "Live Sulafat"}
                  text={followUpClosing}
                  voiceState={voiceState}
                  onPlay={onPlayAudio}
                  onPause={onPauseAudio}
                />
              )}
            </div>
          ) : null}

          {/* Side-by-side Attempt 1 vs Attempt 2 Acoustic Mirror */}
          {attempt1 || attempt2 ? (
            <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                  Optional Side-by-Side Playback (Attempt 1 vs Attempt 2)
                </p>
                <p className="mt-1 text-[11px] text-mutedSage">
                  Compare what you notice in your own voice. Neither audio clip or moment count is
                  ever used to score Attempt 2 as &ldquo;better&rdquo; or &ldquo;worse&rdquo;.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {attempt1 ? (
                  <AcousticMirrorPanel
                    titleOverride="Attempt 1 (Before Badge Metaphor)"
                    attempt={attempt1}
                    events={events}
                    clip={localClips[attempt1.id]}
                    onUpdateEventReview={onUpdateEventReview}
                    onAddUserMoment={onAddUserMoment}
                  />
                ) : null}
                {attempt2 ? (
                  <AcousticMirrorPanel
                    titleOverride="Attempt 2 (With One Clear Purpose)"
                    attempt={attempt2}
                    events={events}
                    clip={localClips[attempt2.id]}
                    onUpdateEventReview={onUpdateEventReview}
                    onAddUserMoment={onAddUserMoment}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Shift feeling */}
          <div className="space-y-2 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
            <p className="text-xs font-semibold text-creamInk">
              How did Attempt 2 feel compared to Attempt 1?
            </p>
            <div className="flex flex-wrap gap-2">
              {(["lighter", "similar", "harder", "unsure", "skip"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setShiftFeeling(f)}
                  className={`rounded-full px-3.5 py-1.5 text-xs capitalize ${
                    shiftFeeling === f
                      ? "bg-mintAccent font-semibold text-sageInk"
                      : "border border-emeraldStrongBorder text-softMintInk"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              goToBeat(4, "p01_beat_4_live_shift", !attempt2);
              const transferNarration =
                p01Content.sections.find((s) => s.id === "P01-11")?.narration || "";
              if (voiceState.audioDefaultEnabled && transferNarration) {
                onPlayAudio(transferNarration, "COCO");
              }
            }}
            className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
          >
            Continue to Beat 5 (Transfer &amp; Summary)
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* BEAT 5: TRANSFER & PROVISIONAL 4-WEEK FOCUS */}
      {beatIndex === 4 ? (
        <div className="space-y-5">
          <CocoAudioPanel
            title="Carrying P01 Into One Ordinary Conversation"
            text={p01Content.sections.find((s) => s.id === "P01-11")?.narration || ""}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
              Draft Transfer Plan (Requires Your Explicit Approval to Save)
            </p>
            <label className="block text-xs text-mutedSage">
              Situation this week
              <input
                type="text"
                value={planSituation}
                onChange={(e) => setPlanSituation(e.target.value)}
                className="mt-1 w-full rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
            </label>
            <label className="block text-xs text-mutedSage">
              Small action / purpose
              <input
                type="text"
                value={planAction}
                onChange={(e) => setPlanAction(e.target.value)}
                className="mt-1 w-full rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
            </label>
            <label className="block text-xs text-mutedSage">
              Specific observation to notice afterwards
              <input
                type="text"
                value={planObservation}
                onChange={(e) => setPlanObservation(e.target.value)}
                className="mt-1 w-full rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
            </label>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={busy || !planSituation.trim() || !planAction.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const plan: TransferPlan = {
                      id: `plan_p01_${crypto.randomUUID().slice(0, 8)}`,
                      userId: uid,
                      toolId: "P01",
                      situation: planSituation.trim(),
                      smallAction: planAction.trim(),
                      observationToNotice: planObservation.trim(),
                      planStatus: "active",
                    };
                    await onSaveTransferPlanAndMemory(plan, true);
                    setPlanChoiceMade("saved");
                    setSessionCompleted(true);
                    await onSaveP01Progress(
                      4,
                      Array.from(new Set([...completedBeats, "p01_beat_5_transfer"])),
                      skippedBeats,
                      true,
                      shiftFeeling,
                      selectedQuizChoice
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-sagePill px-5 py-2 text-xs font-semibold text-sageInk hover:opacity-90 disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                Approve &amp; Save Transfer Plan + Complete P01
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setPlanChoiceMade("declined");
                    setSessionCompleted(true);
                    await onSaveP01Progress(
                      4,
                      completedBeats,
                      Array.from(new Set([...skippedBeats, "p01_beat_5_transfer"])),
                      true,
                      shiftFeeling,
                      selectedQuizChoice
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className="min-h-[44px] rounded-full border border-emeraldStrongBorder px-4 py-2 text-xs text-softMintInk hover:bg-emeraldRaised"
              >
                Complete P01 Without Saving Plan
              </button>
            </div>

            {planChoiceMade ? (
              <p className="text-xs text-mintAccent">
                {planChoiceMade === "saved"
                  ? isGuestMode
                    ? "Transfer plan approved for this guest review session (local memory only; not written to Firestore)."
                    : "Transfer plan approved and saved to your isolated Firestore test profile."
                  : "Respected — P01 marked complete without writing a transfer memory."}
              </p>
            ) : null}
          </div>

          {sessionCompleted ? (
            <div className="space-y-4 rounded-2xl border border-mintAccent/60 bg-emeraldField/60 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                  Session Completed • Provisional Focus
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold text-creamInk">
                  {provisionalPlan.headline}
                </h3>
                <p className="mt-1 text-xs text-softMintInk">{provisionalPlan.groundedSummary}</p>
                <p className="mt-2 rounded-xl border border-emeraldBorder bg-emeraldSurface p-3 text-[11px] text-mutedSage">
                  {provisionalPlan.disclaimer}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {provisionalPlan.weeks.map((w) => (
                  <div
                    key={w.weekNumber}
                    className="rounded-xl border border-emeraldBorder bg-emeraldSurface p-3.5"
                  >
                    <p className="text-[11px] font-semibold uppercase text-mintAccent">
                      Week {w.weekNumber} • {w.suggestedToolIds.join(", ")}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-creamInk">{w.focusTitle}</p>
                    <p className="mt-1 text-xs text-mutedSage">{w.rationale}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-medium text-creamInk">Choose your pace:</span>
                {(
                  [
                    ["continue", "Continue"],
                    ["repeat", "Repeat P01"],
                    ["gentler", "Gentler Practice"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setNextStepChoice(k);
                      if (k === "repeat") {
                        goToBeat(0);
                      }
                    }}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                      nextStepChoice === k
                        ? "bg-mintAccent text-sageInk"
                        : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
