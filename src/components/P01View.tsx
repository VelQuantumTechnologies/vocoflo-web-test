"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  History,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import p01Content from "@/content/p01.json";
import {
  P01_BEAT_2_SPEAK_FIRST_NARRATION,
  P01_BEAT_3_CONCISE_TEACHING,
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
import type { MicErrorKind, MicRecordingState } from "@/lib/audio/useMicRecorder";
import type {
  CoachMemoryItem,
  ConversationTurn,
  EvidenceLogEntry,
  LearnerProfile,
  LessonProgress,
  LocalAudioClip,
  P01BeatId,
  P01MirrorChoice,
  P01ShiftFeeling,
  SpeakingParticipationStatus,
  SpeechAttempt,
  SpeechEvent,
  SpeechEventReviewState,
  SpeechEventType,
  SpeechTermMode,
  TransferPlan,
  VoiceRole,
} from "@/types/vocoflo";
import { AcousticMirrorPanel } from "./AcousticMirrorPanel";
import { CocoAudioPanel, CocoThinkingCard } from "./CocoAudioPanel";
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
  recentConversationTurns: ConversationTurn[];
  onAppendConversationTurn: (
    role: "learner" | "coach",
    text: string,
    stageLabel: string
  ) => void;
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
  onSaveAttemptClip: (
    attempt: SpeechAttempt,
    blob?: Blob,
    mimeType?: string
  ) => Promise<void>;
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
    humanStageLabel: string,
    completedTitles: string[],
    unreachedTitles: string[]
  ) => void;
  onReturnToHub?: () => void;
}

const BEAT_META: Array<{ id: P01BeatId; label: string; title: string }> = [
  { id: "p01_beat_1_mirror", label: "Beat 1", title: "The Mirror" },
  { id: "p01_beat_2_speak_first", label: "Beat 2", title: "Speak First (Attempt 1)" },
  { id: "p01_beat_3_one_idea", label: "Beat 3", title: "Event vs. Verdict & Name-Badge" },
  { id: "p01_beat_4_live_shift", label: "Beat 4", title: "The Live Shift (Attempt 2)" },
  { id: "p01_beat_5_transfer", label: "Beat 5", title: "Real-World Transfer" },
];

const PARTICIPATION_BADGE_LABELS: Record<SpeakingParticipationStatus, string> = {
  recorded: "Recorded audio in this session",
  spoken_unrecorded: "Spoken aloud without recording",
  typed_only: "Written note only (not a spoken recording)",
  skipped: "Skipped speaking turn",
  mic_unavailable: "Microphone unavailable",
};

function isConfirmedSpokenAloud(status: SpeakingParticipationStatus | null): boolean {
  return status === "recorded" || status === "spoken_unrecorded";
}

export function P01View({
  uid,
  isGuestMode = false,
  profile,
  initialProgress,
  memories,
  attempts,
  events,
  localClips,
  recentConversationTurns,
  onAppendConversationTurn,
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
  onReturnToHub,
}: P01ViewProps) {
  const [beatIndex, setBeatIndex] = useState(
    Math.min(4, Math.max(0, initialProgress?.currentStepIndex ?? 0))
  );
  const [busy, setBusy] = useState(false);
  const [thinkingStageLabel, setThinkingStageLabel] = useState<string | null>(null);
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
  const [mirrorSubmittedText, setMirrorSubmittedText] = useState<string | null>(null);
  const [mirrorReply, setMirrorReply] = useState<string | null>(null);

  // Beat 2 (Attempt 1 — occurs BEFORE Event vs. Verdict teaching)
  const [attempt1Id, setAttempt1Id] = useState<string | null>(null);
  const [attempt1Participation, setAttempt1Participation] =
    useState<SpeakingParticipationStatus | null>(null);
  const [attempt1SubmittedSummary, setAttempt1SubmittedSummary] = useState<string | null>(null);
  const [attempt1Reply, setAttempt1Reply] = useState<string | null>(null);
  const [showAttempt1RecorderAgain, setShowAttempt1RecorderAgain] = useState(false);

  // Beat 3 (One Idea, Badge Visual, Understanding Check, Label Reflection)
  const [badgePutDown, setBadgePutDown] = useState(false);
  const [selectedQuizChoice, setSelectedQuizChoice] = useState<string | null>(
    initialProgress?.understandingChoiceId ?? null
  );
  const [familiarLabel, setFamiliarLabel] = useState("");
  const [submittedFamiliarLabel, setSubmittedFamiliarLabel] = useState<string | null>(null);
  const [labelReflectionReply, setLabelReflectionReply] = useState<string | null>(null);

  // Beat 4 (Attempt 2, Follow-Up, Speaking-Attempt Integrity Confirmation, Side-by-side, Feeling)
  const [attempt2Id, setAttempt2Id] = useState<string | null>(null);
  const [attempt2Participation, setAttempt2Participation] =
    useState<SpeakingParticipationStatus | null>(null);
  const [attempt2SubmittedSummary, setAttempt2SubmittedSummary] = useState<string | null>(null);
  const [attempt2Reply, setAttempt2Reply] = useState<string | null>(null);
  const [showAttempt2RecorderAgain, setShowAttempt2RecorderAgain] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [submittedFollowUpText, setSubmittedFollowUpText] = useState<string | null>(null);
  const [followUpClosing, setFollowUpClosing] = useState<string | null>(null);
  const [bothAloudConfirmedByLearner, setBothAloudConfirmedByLearner] = useState<
    boolean | null
  >(null);
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
  const [nextStepChoice, setNextStepChoice] = useState<
    "continue" | "repeat" | "gentler" | null
  >(null);
  const [showHistoricalAttempts, setShowHistoricalAttempts] = useState(false);

  const p01PromptSection7 = P01_BEAT_2_SPEAK_FIRST_NARRATION;
  const p01PromptSection8 =
    p01Content.sections.find((s) => s.id === "P01-08")?.narration ||
    "For this next attempt, keep one clear purpose and share one interest.";
  const p01Understanding = p01Content.sections.find((s) => s.id === "P01-05");
  const p01MeaningNarration = P01_BEAT_3_CONCISE_TEACHING;

  // Always keep Ask Coco scope synchronized with the active beat (including initial mount)
  useEffect(() => {
    const beatMeta = BEAT_META[beatIndex];
    onSyncScope(
      beatMeta.id,
      `Module 1 • ${beatMeta.label}: ${beatMeta.title}`,
      BEAT_META.slice(0, beatIndex).map((b) => `${b.label}: ${b.title}`),
      BEAT_META.slice(beatIndex + 1).map((b) => `${b.label}: ${b.title}`)
    );
  }, [beatIndex, onSyncScope]);

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
    const cleanNote = note?.trim() || "";
    const learnerDisplay =
      choice === "speak" && cleanNote
        ? cleanNote
        : choice === "skip"
          ? "Skipped Beat 1 reflection question"
          : `Selected "${choice}"${cleanNote ? ` — "${cleanNote}"` : ""}`;

    // Priority 5: Display submitted learner message immediately & show Coco is thinking
    setMirrorChoice(choice);
    setMirrorSubmittedText(learnerDisplay);
    if (choice === "speak") {
      setMirrorNote("");
    }
    setMirrorReply(null);
    setBusy(true);
    setThinkingStageLabel("Coco is thinking about your reflection…");
    setErrorBanner(null);

    try {
      const prompt = buildP01MirrorResponsePrompt({
        choice,
        learnerNote: cleanNote || undefined,
        groundedContextLabel: mirrorOpening.groundedContextLabel,
        recentConversationTurns,
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
        "Thank you for sharing how that shows up for you. Whenever you're ready, let's start with a baseline speaking turn in Beat 2.";

      onAppendConversationTurn("learner", learnerDisplay, "Beat 1: The Mirror");
      onAppendConversationTurn("coach", clean, "Beat 1: The Mirror");

      if (voiceState.audioDefaultEnabled) {
        onPlayAudio(clean, "COCO");
      }
      setMirrorReply(clean);

      onLogEvidence({
        kind: "coco_response",
        stage: "P01 Beat 1 (Mirror)",
        summary: `Coco responded to Mirror choice (${choice})`,
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: clean,
      });
    } finally {
      setBusy(false);
      setThinkingStageLabel(null);
    }
  };

  const handleP01AttemptSubmit = async (params: {
    isAttemptTwo: boolean;
    participationMode: "recorded" | "spoken_unrecorded" | "typed_only";
    blob: Blob | null;
    durationSeconds: number;
    mimeType: string | null;
    runAnalysis: boolean;
    learnerText: string | null;
  }) => {
    const {
      isAttemptTwo,
      participationMode,
      blob,
      durationSeconds,
      mimeType,
      runAnalysis,
      learnerText,
    } = params;

    // Priority 5: Display learner's submitted turn immediately & show thinking indicator
    const immediateSummary =
      participationMode === "recorded"
        ? `Submitted ${durationSeconds.toFixed(1)}s recorded audio clip`
        : participationMode === "spoken_unrecorded"
          ? learnerText
            ? `Spoke aloud without recording: "${learnerText}"`
            : "Confirmed speaking the attempt aloud without recording audio"
          : `Written response (not a spoken recording): "${learnerText || ""}"`;

    if (isAttemptTwo) {
      setAttempt2Participation(participationMode);
      setAttempt2SubmittedSummary(immediateSummary);
      setAttempt2Reply(null);
      setShowAttempt2RecorderAgain(false);
      setBothAloudConfirmedByLearner(null);
    } else {
      setAttempt1Participation(participationMode);
      setAttempt1SubmittedSummary(immediateSummary);
      setAttempt1Reply(null);
      setShowAttempt1RecorderAgain(false);
    }

    setBusy(true);
    setThinkingStageLabel(
      participationMode === "recorded" && runAnalysis
        ? "Coco is listening to your recording and thinking…"
        : "Coco is thinking about what you shared…"
    );
    setErrorBanner(null);

    try {
      const sectionId = isAttemptTwo ? "P01-08" : "P01-07";
      const attemptId = `att_p01_${isAttemptTwo ? "a2" : "a1"}_${crypto.randomUUID().slice(0, 8)}`;

      let transcriptForCoco = learnerText;
      let analysisErrorReason: string | null = null;

      // Priority 3: Do NOT treat a typing fallback as a verified spoken recording.
      // Only create & persist a SpeechAttempt for actual spoken attempts ("recorded" or "spoken_unrecorded").
      if (participationMode === "recorded" || participationMode === "spoken_unrecorded") {
        const attempt: SpeechAttempt = {
          id: attemptId,
          userId: uid,
          sourceContext: "lesson_p01",
          activityOrSectionId: sectionId,
          promptText: isAttemptTwo ? p01PromptSection8 : p01PromptSection7,
          durationSeconds: blob ? durationSeconds : 0,
          hasLocalAudio: Boolean(blob),
          analysisStatus: blob ? (runAnalysis ? "pending" : "not_requested") : "not_requested",
          disfluentTranscript: learnerText,
          selfReportParticipationNote: participationMode,
          participationStatus: participationMode,
          isCurrentSession: true,
          createdAtIso: new Date().toISOString(),
        };

        await onSaveAttemptClip(attempt, blob || undefined, mimeType || undefined);
        if (isAttemptTwo) {
          setAttempt2Id(attemptId);
        } else {
          setAttempt1Id(attemptId);
        }
        onResetMic();

        if (blob && runAnalysis) {
          const analysis = await onRunSpeechAnalysis(
            attempt,
            blob,
            mimeType || "audio/webm",
            "lesson_analysis"
          );
          if (analysis.ok) {
            transcriptForCoco = analysis.transcript;
            if (analysis.transcript) {
              const updatedSummary = `Recorded clip (${durationSeconds.toFixed(1)}s): "${analysis.transcript}"`;
              if (isAttemptTwo) {
                setAttempt2SubmittedSummary(updatedSummary);
              } else {
                setAttempt1SubmittedSummary(updatedSummary);
              }
            }
          } else {
            analysisErrorReason = analysis.error;
          }
        }
      } else {
        // Typed fallback: clear current-session spoken attempt ID so it is never treated as a spoken recording
        if (isAttemptTwo) {
          setAttempt2Id(null);
        } else {
          setAttempt1Id(null);
        }
        onResetMic();
      }

      const canAttachDirectAudio =
        participationMode === "recorded" &&
        !transcriptForCoco &&
        Boolean(blob) &&
        (blob?.size || 0) <= MAX_WEB_AUDIO_UPLOAD_BYTES;

      const prompt = buildP01AttemptResponsePrompt({
        isAttemptTwo,
        learnerTranscriptOrText: transcriptForCoco,
        hasDirectAudioAttachment: canAttachDirectAudio,
        participationMode,
        analysisUnavailableReason: analysisErrorReason,
        recentConversationTurns,
        speechTermMode,
      });

      const payload: Record<string, unknown> = { prompt };
      if (canAttachDirectAudio && blob) {
        payload.audioBase64 = await blobToBase64(blob);
        payload.mimeType = mimeType || "audio/webm";
      }

      setThinkingStageLabel("Coco is thinking…");

      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coaching_debrief",
        attemptOrSessionId: attemptId,
        payload,
        guestMode: isGuestMode,
      });

      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Coco could not reply to your turn.");
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
        "Thank you for sharing that. Whenever you're ready, we can look at the next step together.";

      const stageName = isAttemptTwo ? "Beat 4: Attempt 2" : "Beat 2: Attempt 1";
      onAppendConversationTurn(
        "learner",
        transcriptForCoco || immediateSummary,
        stageName
      );
      onAppendConversationTurn("coach", clean, stageName);

      if (voiceState.audioDefaultEnabled) {
        onPlayAudio(clean, "COCO");
      }

      if (isAttemptTwo) {
        setAttempt2Reply(clean);
      } else {
        setAttempt1Reply(clean);
      }

      onLogEvidence({
        kind: "coco_response",
        stage: isAttemptTwo ? "P01 Beat 4 (Attempt 2)" : "P01 Beat 2 (Attempt 1)",
        summary: `Coco responded to P01 ${isAttemptTwo ? "Attempt 2" : "Attempt 1"} (${participationMode})`,
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: clean,
        ...(participationMode === "recorded" ? { transcriptAttemptId: attemptId } : {}),
      });
    } finally {
      setBusy(false);
      setThinkingStageLabel(null);
    }
  };

  const handleLabelReflection = async () => {
    const clean = familiarLabel.trim();
    if (!clean) return;
    setSubmittedFamiliarLabel(clean);
    setFamiliarLabel("");
    setLabelReflectionReply(null);
    setBusy(true);
    setThinkingStageLabel("Coco is thinking about the label you shared…");
    setErrorBanner(null);
    try {
      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coaching_debrief",
        attemptOrSessionId: "p01_beat_3_label",
        payload: {
          prompt: buildP01LabelReflectionPrompt(
            clean,
            speechTermMode,
            recentConversationTurns
          ),
        },
        guestMode: isGuestMode,
      });
      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Could not reflect on label.");
        return;
      }
      const reply = sanitizeCocoOutput(res.text);
      onAppendConversationTurn("learner", clean, "Beat 3: Label Reflection");
      onAppendConversationTurn("coach", reply, "Beat 3: Label Reflection");

      if (voiceState.audioDefaultEnabled && reply) {
        onPlayAudio(reply, "COCO");
      }
      setLabelReflectionReply(reply);

      onLogEvidence({
        kind: "coco_response",
        stage: "P01 Beat 3 (Label Reflection)",
        summary: "Coco reflected on learner's speaking label",
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: reply,
      });
    } finally {
      setBusy(false);
      setThinkingStageLabel(null);
    }
  };

  const handleBeat4FollowUp = async () => {
    const clean = followUpText.trim();
    if (!clean || !attempt2Reply) return;
    setSubmittedFollowUpText(clean);
    setFollowUpText("");
    setFollowUpClosing(null);
    setBusy(true);
    setThinkingStageLabel("Coco is thinking about your reply…");
    setErrorBanner(null);
    try {
      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coaching_debrief",
        attemptOrSessionId: "p01_beat_4_followup",
        payload: {
          prompt: buildP01FollowUpClosingPrompt(
            attempt2Reply,
            clean,
            speechTermMode,
            recentConversationTurns
          ),
        },
        guestMode: isGuestMode,
      });
      if (!res.ok) {
        setErrorBanner(res.errorMessage || "Coco could not close the follow-up.");
        return;
      }
      const reply = sanitizeCocoOutput(res.text);
      onAppendConversationTurn("learner", clean, "Beat 4: Follow-Up");
      onAppendConversationTurn("coach", reply, "Beat 4: Follow-Up");

      if (voiceState.audioDefaultEnabled && reply) {
        onPlayAudio(reply, "COCO");
      }
      setFollowUpClosing(reply);

      onLogEvidence({
        kind: "coco_response",
        stage: "P01 Beat 4 (Follow-Up)",
        summary: "Coco closed P01 Beat 4 follow-up",
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: reply,
      });
    } finally {
      setBusy(false);
      setThinkingStageLabel(null);
    }
  };

  const handleMicErrorObserved = (isAttemptTwo: boolean, _kind: MicErrorKind) => {
    void _kind;
    if (isAttemptTwo) {
      setAttempt2Participation((prev) => (prev === null ? "mic_unavailable" : prev));
    } else {
      setAttempt1Participation((prev) => (prev === null ? "mic_unavailable" : prev));
    }
  };

  // Priority 3: Strictly distinguish current-session attempts from historical attempts
  const attempt1 = attempts.find((a) => a.id === attempt1Id && a.isCurrentSession !== false);
  const attempt2 = attempts.find((a) => a.id === attempt2Id && a.isCurrentSession !== false);
  const historicalP01Attempts = useMemo(
    () =>
      attempts.filter(
        (a) => a.sourceContext === "lesson_p01" && a.isCurrentSession === false
      ),
    [attempts]
  );

  // Priority 3: Only invite Attempt 1 vs Attempt 2 comparison when both are confirmed spoken aloud
  const bothAutomaticallySpokenAloud =
    isConfirmedSpokenAloud(attempt1Participation) &&
    isConfirmedSpokenAloud(attempt2Participation);
  const canCompareAttemptsAloud =
    bothAutomaticallySpokenAloud || bothAloudConfirmedByLearner === true;
  const shouldAskBriefAloudConfirmation =
    !bothAutomaticallySpokenAloud &&
    bothAloudConfirmedByLearner === null &&
    (Boolean(attempt2Reply) || attempt2Participation !== null);

  const provisionalPlan = useMemo(
    () =>
      buildProvisionalRoadmap({
        profile,
        memories,
        beat4Feeling: canCompareAttemptsAloud ? shiftFeeling : null,
      }),
    [profile, memories, canCompareAttemptsAloud, shiftFeeling]
  );

  void getP01SectionsForBeat(BEAT_META[beatIndex].id);

  return (
    <div className="space-y-6">
      {/* Beat Navigation Header */}
      <div className="rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-mintAccent">
              Module 1 • Your Identity With Your Speech
            </p>
            <h2 className="font-display text-lg font-semibold text-creamInk">
              {BEAT_META[beatIndex].label} — {BEAT_META[beatIndex].title}
            </h2>
          </div>
          <span className="rounded-full border border-emeraldStrongBorder px-3 py-1 text-xs text-mutedSage">
            Step {beatIndex + 1} of 5
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
                  ? "border border-mintAccent bg-emeraldField font-semibold text-mintAccent"
                  : completedBeats.includes(b.id)
                    ? "bg-emeraldRaised text-softMintInk"
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
            badge={mirrorOpening.hasGenuineMemory ? "Remembered From Check-In" : undefined}
            text={mirrorOpening.text}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
            <p className="text-xs font-semibold text-creamInk">
              When a word catches or hesitates, does that single moment ever start to feel like
              a broader statement about who you are?
            </p>
            <div className="flex flex-wrap gap-2">
              {(["often", "sometimes", "rarely"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  onClick={() => handleMirrorSubmit(c)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold capitalize transition ${
                    mirrorChoice === c
                      ? "border border-mintAccent bg-emeraldField text-mintAccent"
                      : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <input
                type="text"
                value={mirrorNote}
                onChange={(e) => setMirrorNote(e.target.value)}
                disabled={busy}
                placeholder="Or reply to Coco in your own words…"
                className="flex-1 rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
              {!mirrorReply ? (
                <button
                  type="button"
                  disabled={busy || !mirrorNote.trim()}
                  onClick={() => handleMirrorSubmit("speak", mirrorNote.trim())}
                  className="rounded-full bg-sagePill px-4 py-2 text-xs font-semibold text-sageInk hover:opacity-90 disabled:opacity-40"
                >
                  Send Reply
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !mirrorNote.trim()}
                  onClick={() => handleMirrorSubmit("speak", mirrorNote.trim())}
                  className="rounded-full border border-emeraldStrongBorder px-4 py-2 text-xs font-semibold text-mintAccent hover:bg-emeraldRaised disabled:opacity-40"
                >
                  Update Reply
                </button>
              )}
            </div>

            {!mirrorReply && !busy ? (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    goToBeat(1, "p01_beat_1_mirror", true);
                    if (voiceState.audioDefaultEnabled) {
                      onPlayAudio(p01PromptSection7, "COCO");
                    }
                  }}
                  className="text-xs text-mutedSage underline hover:text-creamInk"
                >
                  Skip question and go to Beat 2 (Speak First)
                </button>
              </div>
            ) : null}
          </div>

          {mirrorSubmittedText ? (
            <div
              data-testid="learner-submitted-turn"
              className="ml-6 rounded-2xl border border-emeraldStrongBorder bg-emeraldField px-4 py-2.5 text-sm text-creamInk"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-mintAccent">
                You shared
              </p>
              <p className="mt-0.5">{mirrorSubmittedText}</p>
            </div>
          ) : null}

          {busy && thinkingStageLabel ? (
            <CocoThinkingCard label={thinkingStageLabel} />
          ) : null}

          {mirrorReply ? (
            <>
              <CocoAudioPanel
                title="Coco's Response"
                badge={isGuestMode ? "Simulated (Guest Mode)" : undefined}
                text={mirrorReply}
                voiceState={voiceState}
                onPlay={onPlayAudio}
                onPause={onPauseAudio}
              />

              {/* Single Primary Action once Beat 1 response is ready */}
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
            </>
          ) : null}
        </div>
      ) : null}

      {/* BEAT 2: SPEAK FIRST (BASELINE ATTEMPT 1 — BEFORE TEACHING) */}
      {beatIndex === 1 ? (
        <div className="space-y-4">
          <CocoAudioPanel
            title="Speak First — Something You Enjoy Outside Work"
            text={p01PromptSection7}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          {attempt1Participation ? (
            <div
              data-testid="attempt1-participation-badge"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emeraldStrongBorder bg-emeraldSurface px-3.5 py-2 text-xs"
            >
              <span className="text-mutedSage">
                Attempt 1 Status:{" "}
                <strong className="text-mintAccent">
                  {PARTICIPATION_BADGE_LABELS[attempt1Participation]}
                </strong>
              </span>
              {attempt1Reply && !showAttempt1RecorderAgain ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowAttempt1RecorderAgain(true)}
                  className="inline-flex items-center gap-1 text-xs text-mintAccent underline hover:opacity-90"
                >
                  <RotateCcw className="h-3 w-3" />
                  Try another take (optional)
                </button>
              ) : null}
            </div>
          ) : null}

          {!attempt1Reply || showAttempt1RecorderAgain ? (
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
              onMicErrorObserved={(kind) => handleMicErrorObserved(false, kind)}
              onSubmitAudio={(blob, dur, mime, runAna) =>
                handleP01AttemptSubmit({
                  isAttemptTwo: false,
                  participationMode: "recorded",
                  blob,
                  durationSeconds: dur,
                  mimeType: mime,
                  runAnalysis: runAna,
                  learnerText: null,
                })
              }
              onConfirmSpokenWithoutRecording={(note) =>
                handleP01AttemptSubmit({
                  isAttemptTwo: false,
                  participationMode: "spoken_unrecorded",
                  blob: null,
                  durationSeconds: 0,
                  mimeType: null,
                  runAnalysis: false,
                  learnerText: note || null,
                })
              }
              onSubmitTypedFallback={(txt) =>
                handleP01AttemptSubmit({
                  isAttemptTwo: false,
                  participationMode: "typed_only",
                  blob: null,
                  durationSeconds: 0,
                  mimeType: null,
                  runAnalysis: false,
                  learnerText: txt,
                })
              }
              secondarySkipAction={{
                label: "Skip speaking step and continue to Beat 3",
                onClick: () => {
                  setAttempt1Participation((prev) => prev ?? "skipped");
                  goToBeat(2, "p01_beat_2_speak_first", true);
                  if (voiceState.audioDefaultEnabled && p01MeaningNarration) {
                    onPlayAudio(p01MeaningNarration, "COCO");
                  }
                },
              }}
            />
          ) : null}

          {attempt1SubmittedSummary ? (
            <div
              data-testid="learner-submitted-turn"
              className="ml-6 rounded-2xl border border-emeraldStrongBorder bg-emeraldField px-4 py-2.5 text-sm text-creamInk"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-mintAccent">
                Your Attempt 1 Turn
              </p>
              <p className="mt-0.5">{attempt1SubmittedSummary}</p>
            </div>
          ) : null}

          {busy && thinkingStageLabel ? (
            <CocoThinkingCard label={thinkingStageLabel} />
          ) : null}

          {attempt1Reply ? (
            <CocoAudioPanel
              title="Coco's Response (Attempt 1)"
              badge={isGuestMode ? "Simulated (Guest Mode)" : undefined}
              text={attempt1Reply}
              voiceState={voiceState}
              onPlay={onPlayAudio}
              onPause={onPauseAudio}
            />
          ) : null}

          {attempt1 && attempt1.participationStatus === "recorded" ? (
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

          {attempt1Reply ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                goToBeat(2, "p01_beat_2_speak_first", !isConfirmedSpokenAloud(attempt1Participation));
                if (voiceState.audioDefaultEnabled && p01MeaningNarration) {
                  onPlayAudio(p01MeaningNarration, "COCO");
                }
              }}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
            >
              Continue to Beat 3 (Event vs. Verdict)
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* BEAT 3: ONE IDEA & NAME-BADGE METAPHOR */}
      {beatIndex === 2 ? (
        <div className="space-y-5">
          {p01MeaningNarration ? (
            <CocoAudioPanel
              title="Event vs. Verdict — The Meeting Introduction & Name-Badge Idea"
              text={p01MeaningNarration}
              voiceState={voiceState}
              onPlay={onPlayAudio}
              onPause={onPauseAudio}
            />
          ) : null}

          {/* Interactive Name-Badge Metaphor (Secondary action button so only 1 primary CTA exists) */}
          <div className="rounded-2xl border border-emeraldStrongBorder bg-emeraldSurface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                  Visual Metaphor • Name Badge vs. Suit of Armour
                </p>
                <p className="mt-1 text-sm text-softMintInk">
                  {badgePutDown
                    ? "Badge set on the table for this conversation — your values and voice have room."
                    : "When a description hardens into armour, every sentence feels like it has to defend it."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBadgePutDown((v) => !v)}
                className="rounded-full border border-mintAccent/70 bg-emeraldField px-4 py-2 text-xs font-semibold text-mintAccent hover:bg-emeraldRaised"
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
                  &ldquo;I repeated part of my name during this meeting introduction — I still have something useful to contribute.&rdquo;
                </p>
              </div>
            </div>
          </div>

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
                disabled={busy}
                placeholder="e.g. 'They'll think I'm unprepared if I hesitate'"
                className="flex-1 rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
              <button
                type="button"
                disabled={busy || !familiarLabel.trim()}
                onClick={handleLabelReflection}
                className="rounded-full border border-mintAccent/70 bg-emeraldField px-4 py-2 text-xs font-semibold text-mintAccent hover:bg-emeraldRaised disabled:opacity-40"
              >
                Reflect with Coco
              </button>
            </div>

            {submittedFamiliarLabel ? (
              <div
                data-testid="learner-submitted-turn"
                className="ml-6 rounded-2xl border border-emeraldStrongBorder bg-emeraldField px-4 py-2.5 text-sm text-creamInk"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-mintAccent">
                  Familiar label you shared
                </p>
                <p className="mt-0.5">&ldquo;{submittedFamiliarLabel}&rdquo;</p>
              </div>
            ) : null}

            {busy && thinkingStageLabel ? (
              <CocoThinkingCard label={thinkingStageLabel} />
            ) : null}

            {labelReflectionReply ? (
              <CocoAudioPanel
                title="Coco on Your Label"
                badge={isGuestMode ? "Simulated (Guest Mode)" : undefined}
                text={labelReflectionReply}
                voiceState={voiceState}
                onPlay={onPlayAudio}
                onPause={onPauseAudio}
              />
            ) : null}
          </div>

          {/* Single Primary CTA on Beat 3 */}
          <button
            type="button"
            disabled={busy}
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

      {/* BEAT 4: THE LIVE SHIFT (ATTEMPT 2 + INTEGRITY-GATED COMPARISON) */}
      {beatIndex === 3 ? (
        <div className="space-y-5">
          <CocoAudioPanel
            title="Attempt 2 — Same Topic, One Clear Purpose"
            text={p01PromptSection8}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          {attempt2Participation ? (
            <div
              data-testid="attempt2-participation-badge"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emeraldStrongBorder bg-emeraldSurface px-3.5 py-2 text-xs"
            >
              <span className="text-mutedSage">
                Attempt 2 Status:{" "}
                <strong className="text-mintAccent">
                  {PARTICIPATION_BADGE_LABELS[attempt2Participation]}
                </strong>
              </span>
              {attempt2Reply && !showAttempt2RecorderAgain ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setShowAttempt2RecorderAgain(true)}
                  className="inline-flex items-center gap-1 text-xs text-mintAccent underline hover:opacity-90"
                >
                  <RotateCcw className="h-3 w-3" />
                  Try another take (optional)
                </button>
              ) : null}
            </div>
          ) : null}

          {!attempt2Reply || showAttempt2RecorderAgain ? (
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
              onMicErrorObserved={(kind) => handleMicErrorObserved(true, kind)}
              onSubmitAudio={(blob, dur, mime, runAna) =>
                handleP01AttemptSubmit({
                  isAttemptTwo: true,
                  participationMode: "recorded",
                  blob,
                  durationSeconds: dur,
                  mimeType: mime,
                  runAnalysis: runAna,
                  learnerText: null,
                })
              }
              onConfirmSpokenWithoutRecording={(note) =>
                handleP01AttemptSubmit({
                  isAttemptTwo: true,
                  participationMode: "spoken_unrecorded",
                  blob: null,
                  durationSeconds: 0,
                  mimeType: null,
                  runAnalysis: false,
                  learnerText: note || null,
                })
              }
              onSubmitTypedFallback={(txt) =>
                handleP01AttemptSubmit({
                  isAttemptTwo: true,
                  participationMode: "typed_only",
                  blob: null,
                  durationSeconds: 0,
                  mimeType: null,
                  runAnalysis: false,
                  learnerText: txt,
                })
              }
              secondarySkipAction={{
                label: "Skip Attempt 2 and continue to Beat 5",
                onClick: () => {
                  setAttempt2Participation((prev) => prev ?? "skipped");
                  goToBeat(4, "p01_beat_4_live_shift", true);
                  const transferNarration =
                    p01Content.sections.find((s) => s.id === "P01-11")?.narration || "";
                  if (voiceState.audioDefaultEnabled && transferNarration) {
                    onPlayAudio(transferNarration, "COCO");
                  }
                },
              }}
            />
          ) : null}

          {attempt2SubmittedSummary ? (
            <div
              data-testid="learner-submitted-turn"
              className="ml-6 rounded-2xl border border-emeraldStrongBorder bg-emeraldField px-4 py-2.5 text-sm text-creamInk"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-mintAccent">
                Your Attempt 2 Turn
              </p>
              <p className="mt-0.5">{attempt2SubmittedSummary}</p>
            </div>
          ) : null}

          {busy && thinkingStageLabel && !submittedFollowUpText ? (
            <CocoThinkingCard label={thinkingStageLabel} />
          ) : null}

          {attempt2Reply ? (
            <div className="space-y-3">
              <CocoAudioPanel
                title="Coco's Response & Follow-Up (Attempt 2)"
                badge={isGuestMode ? "Simulated (Guest Mode)" : undefined}
                text={attempt2Reply}
                voiceState={voiceState}
                onPlay={onPlayAudio}
                onPause={onPauseAudio}
              />

              {submittedFollowUpText ? (
                <div
                  data-testid="learner-submitted-turn"
                  className="ml-6 rounded-2xl border border-emeraldStrongBorder bg-emeraldField px-4 py-2.5 text-sm text-creamInk"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-mintAccent">
                    You replied
                  </p>
                  <p className="mt-0.5">{submittedFollowUpText}</p>
                </div>
              ) : null}

              {busy && thinkingStageLabel && submittedFollowUpText ? (
                <CocoThinkingCard label={thinkingStageLabel} />
              ) : null}

              {!followUpClosing ? (
                <div className="flex gap-2 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
                  <input
                    type="text"
                    value={followUpText}
                    onChange={(e) => setFollowUpText(e.target.value)}
                    disabled={busy}
                    placeholder="Reply briefly to Coco's follow-up question (optional)…"
                    className="flex-1 rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
                  />
                  <button
                    type="button"
                    disabled={busy || !followUpText.trim()}
                    onClick={handleBeat4FollowUp}
                    className="rounded-full border border-mintAccent/70 bg-emeraldField px-4 py-2 text-xs font-semibold text-mintAccent hover:bg-emeraldRaised disabled:opacity-40"
                  >
                    Reply
                  </button>
                </div>
              ) : (
                <CocoAudioPanel
                  title="Coco's Closing Thought"
                  badge={isGuestMode ? "Simulated (Guest Mode)" : undefined}
                  text={followUpClosing}
                  voiceState={voiceState}
                  onPlay={onPlayAudio}
                  onPause={onPauseAudio}
                />
              )}
            </div>
          ) : null}

          {/* Priority 3: Brief Confirmation when spoken participation is uncertain */}
          {shouldAskBriefAloudConfirmation ? (
            <div
              data-testid="attempt-comparison-confirmation"
              className="space-y-3 rounded-2xl border border-warmGold/50 bg-emeraldSurface p-4"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-warmGold">
                  Quick Check Before Comparing Attempts
                </p>
                <p className="mt-1 text-sm font-medium text-creamInk">
                  Did you speak both Attempt 1 and Attempt 2 aloud (even if you didn&rsquo;t
                  record audio)?
                </p>
                <p className="mt-1 text-xs text-mutedSage">
                  Current session log: Attempt 1 ({
                    attempt1Participation
                      ? PARTICIPATION_BADGE_LABELS[attempt1Participation]
                      : "not recorded yet"
                  }) • Attempt 2 ({
                    attempt2Participation
                      ? PARTICIPATION_BADGE_LABELS[attempt2Participation]
                      : "not recorded yet"
                  }). We only compare Attempt 1 and Attempt 2 when both were spoken aloud.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBothAloudConfirmedByLearner(true);
                    if (!isConfirmedSpokenAloud(attempt1Participation)) {
                      setAttempt1Participation("spoken_unrecorded");
                    }
                    if (!isConfirmedSpokenAloud(attempt2Participation)) {
                      setAttempt2Participation("spoken_unrecorded");
                    }
                  }}
                  className="rounded-full border border-mintAccent bg-emeraldField px-4 py-1.5 text-xs font-semibold text-mintAccent hover:bg-emeraldRaised"
                >
                  Yes, I spoke both aloud
                </button>
                <button
                  type="button"
                  onClick={() => setBothAloudConfirmedByLearner(false)}
                  className="rounded-full border border-emeraldStrongBorder px-4 py-1.5 text-xs text-softMintInk hover:bg-emeraldRaised"
                >
                  No, skip comparison
                </button>
              </div>
            </div>
          ) : null}

          {/* Side-by-side Attempt 1 vs Attempt 2 Acoustic Mirror ONLY when both were recorded in current session */}
          {attempt1?.participationStatus === "recorded" &&
          attempt2?.participationStatus === "recorded" ? (
            <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                  Optional Side-by-Side Playback (Current Session • Attempt 1 vs. Attempt 2)
                </p>
                <p className="mt-1 text-[11px] text-mutedSage">
                  Compare what you notice in your own voice. Neither audio clip nor moment count is
                  ever used to score Attempt 2 as &ldquo;better&rdquo; or &ldquo;worse&rdquo;.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <AcousticMirrorPanel
                  titleOverride="Attempt 1 (Baseline Before Teaching)"
                  attempt={attempt1}
                  events={events}
                  clip={localClips[attempt1.id]}
                  onUpdateEventReview={onUpdateEventReview}
                  onAddUserMoment={onAddUserMoment}
                />
                <AcousticMirrorPanel
                  titleOverride="Attempt 2 (With One Clear Purpose)"
                  attempt={attempt2}
                  events={events}
                  clip={localClips[attempt2.id]}
                  onUpdateEventReview={onUpdateEventReview}
                  onAddUserMoment={onAddUserMoment}
                />
              </div>
            </div>
          ) : attempt2?.participationStatus === "recorded" ? (
            <AcousticMirrorPanel
              titleOverride="Optional Acoustic Mirror (Attempt 2 • Current Session)"
              attempt={attempt2}
              events={events}
              clip={localClips[attempt2.id]}
              onUpdateEventReview={onUpdateEventReview}
              onAddUserMoment={onAddUserMoment}
            />
          ) : null}

          {/* Shift feeling comparison — ONLY shown when learner confirms both attempts were spoken aloud */}
          {canCompareAttemptsAloud ? (
            <div
              data-testid="attempt-comparison-feeling"
              className="space-y-2 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4"
            >
              <p className="text-xs font-semibold text-creamInk">
                Since you spoke both attempts aloud, how did Attempt 2 feel compared to Attempt 1?
              </p>
              <div className="flex flex-wrap gap-2">
                {(["lighter", "similar", "harder", "unsure", "skip"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setShiftFeeling(f)}
                    className={`rounded-full px-3.5 py-1.5 text-xs capitalize ${
                      shiftFeeling === f
                        ? "border border-mintAccent bg-emeraldField font-semibold text-mintAccent"
                        : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          ) : bothAloudConfirmedByLearner === false ? (
            <p className="rounded-xl border border-emeraldBorder bg-emeraldSurface px-4 py-3 text-xs text-mutedSage">
              Attempt 1 vs. Attempt 2 comparison skipped because both turns were not spoken aloud
              in this session. You can continue directly to Beat 5 whenever you&rsquo;re ready.
            </p>
          ) : null}

          {attempt2Reply ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                goToBeat(4, "p01_beat_4_live_shift", !isConfirmedSpokenAloud(attempt2Participation));
                const transferNarration =
                  p01Content.sections.find((s) => s.id === "P01-11")?.narration || "";
                if (voiceState.audioDefaultEnabled && transferNarration) {
                  onPlayAudio(transferNarration, "COCO");
                }
              }}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-6 py-2.5 text-sm font-semibold text-sageInk hover:opacity-90"
            >
              Continue to Beat 5 (Real-World Transfer)
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* BEAT 5: TRANSFER & PROVISIONAL 4-WEEK FOCUS */}
      {beatIndex === 4 ? (
        <div className="space-y-5">
          <CocoAudioPanel
            title="Carrying This Into One Ordinary Conversation"
            text={p01Content.sections.find((s) => s.id === "P01-11")?.narration || ""}
            voiceState={voiceState}
            onPlay={onPlayAudio}
            onPause={onPauseAudio}
          />

          <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
              Real-World Transfer Plan (Saved Only With Your Approval)
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
              Small communication purpose (staying with your message and listener)
              <input
                type="text"
                value={planAction}
                onChange={(e) => setPlanAction(e.target.value)}
                className="mt-1 w-full rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
            </label>
            <label className="block text-xs text-mutedSage">
              Specific observation to notice afterwards (without a verdict)
              <input
                type="text"
                value={planObservation}
                onChange={(e) => setPlanObservation(e.target.value)}
                className="mt-1 w-full rounded-xl border border-emeraldBorder bg-emeraldCanvas px-3 py-2 text-xs text-creamInk"
              />
            </label>

            {!sessionCompleted ? (
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
                  Approve &amp; Save Transfer Plan + Complete Lesson
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
                  Complete Lesson Without Saving Plan
                </button>
              </div>
            ) : null}

            {planChoiceMade ? (
              <p className="text-xs text-mintAccent">
                {planChoiceMade === "saved"
                  ? isGuestMode
                    ? "Transfer plan approved for this guest review session (local memory only)."
                    : "Transfer plan approved and saved to your learner profile."
                  : "Respected — lesson marked complete without saving a transfer memory."}
              </p>
            ) : null}
          </div>

          {sessionCompleted ? (
            <div className="space-y-4 rounded-2xl border border-mintAccent/60 bg-emeraldField/60 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                  Lesson Completed • Recommended Focus
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
                      Week {w.weekNumber} • {w.focusAreasLabel}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-creamInk">{w.focusTitle}</p>
                    <p className="mt-1 text-xs text-mutedSage">{w.rationale}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-creamInk">Choose your pace:</span>
                  {(
                    [
                      ["repeat", "Repeat Lesson"],
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
                          ? "border border-mintAccent bg-emeraldField text-mintAccent"
                          : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldRaised"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setNextStepChoice("continue");
                    onReturnToHub?.();
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-sagePill px-6 py-2 text-xs font-semibold text-sageInk hover:opacity-90"
                >
                  Continue &amp; Return to Hub
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Priority 3: Separate Historical Attempts Disclosure (never mixed with current session) */}
      {historicalP01Attempts.length > 0 ? (
        <div className="rounded-2xl border border-emeraldBorder bg-emeraldSurface/70 p-4">
          <button
            type="button"
            onClick={() => setShowHistoricalAttempts((s) => !s)}
            className="flex w-full items-center justify-between text-left text-xs text-mutedSage hover:text-creamInk"
          >
            <span className="inline-flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-mintAccent" />
              Earlier Saved Session Attempts ({historicalP01Attempts.length} from previous sessions)
            </span>
            <span className="text-mintAccent">
              {showHistoricalAttempts ? "Hide History" : "View History"}
            </span>
          </button>
          {showHistoricalAttempts ? (
            <div className="mt-3 space-y-2 border-t border-emeraldBorder pt-3">
              {historicalP01Attempts.slice(0, 4).map((hist) => (
                <AcousticMirrorPanel
                  key={hist.id}
                  attempt={hist}
                  events={events}
                  onUpdateEventReview={onUpdateEventReview}
                  onAddUserMoment={onAddUserMoment}
                  titleOverride={`Earlier Session (${hist.createdAtIso.slice(0, 10)})`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
