export type SpeechTermMode = "stammering" | "stuttering";

export type VoiceRole = "COCO" | "ROLEPLAY_PARTNER";

export type P01BeatId =
  | "p01_beat_1_mirror"
  | "p01_beat_2_speak_first"
  | "p01_beat_3_one_idea"
  | "p01_beat_4_live_shift"
  | "p01_beat_5_transfer";

export type P01MirrorChoice = "often" | "sometimes" | "rarely" | "speak" | "skip";

export type P01ShiftFeeling = "lighter" | "similar" | "harder" | "unsure" | "skip";

export type SpeechEventType =
  | "repetition"
  | "prolongation"
  | "pause"
  | "other_uncertain"
  | "user_reported_block";

export type SpeechEventReviewState =
  | "unreviewed"
  | "confirmed"
  | "dismissed"
  | "corrected";

export interface LearnerProfile {
  userId: string;
  displayName: string;
  chosenGoals: string[];
  importantSituations: string[];
  completedCheckIn: boolean;
  selectedToolId: string;
  developmentFixtureEnabled: boolean;
  preferredLanguage: "en" | "hi";
  membershipTier: "free_preview" | "cohort_preview";
  membershipStatus: "active_preview" | "preview_pending" | "active_cohort";
  onboardingSeen: boolean;
}

export interface SpeechAttempt {
  id: string;
  userId: string;
  sourceContext:
    | "check_in_reading"
    | "check_in_spontaneous"
    | "check_in_conversation"
    | "check_in_shift_experiment"
    | "lesson_p01"
    | "lesson_tool"
    | "practice_static"
    | "roleplay_live";
  activityOrSectionId: string;
  promptText: string;
  durationSeconds: number;
  hasLocalAudio: boolean;
  analysisStatus: "not_requested" | "pending" | "success" | "failed" | "fixture";
  analysisProvider?: string;
  analysisModel?: string;
  adapterVersion?: string;
  disfluentTranscript?: string | null;
  summaryObservation?: string | null;
  analysisError?: string | null;
  selfReportEffort?: number | null;
  selfReportAvoidanceNote?: string | null;
  createdAtIso: string;
}

export interface SpeechEvent {
  id: string;
  userId: string;
  attemptId: string;
  startSeconds: number;
  endSeconds: number;
  eventType: SpeechEventType;
  wordOrSound?: string | null;
  tentativeObservation: string;
  sourceKind: "ai_observed" | "user_reported" | "development_fixture";
  reviewState: SpeechEventReviewState;
  correctedLabel?: string | null;
  correctionNote?: string | null;
}

export interface CoachMemoryItem {
  id: string;
  userId: string;
  category:
    | "goal"
    | "context"
    | "trigger"
    | "active_tool"
    | "transfer_plan"
    | "approach_feedback"
    | "observation";
  fact: string;
  sourceKind: "user_report" | "user_confirmed";
  sourceReference: string;
}

export interface TransferPlan {
  id: string;
  userId: string;
  toolId: string;
  situation: string;
  smallAction: string;
  observationToNotice?: string;
  reviewOutcomeNote?: string;
  planStatus: "active" | "reviewed" | "archived";
}

export interface LessonProgress {
  userId: string;
  toolId: string;
  currentStepIndex: number;
  completedSteps: string[];
  skippedSteps: string[];
  understandingChoiceId?: string | null;
  reviewObservationChoice?: string | null;
  sessionCompleted: boolean;
}

export interface RoleplayTurn {
  speaker: "partner" | "learner";
  message: string;
  learnerTranscript?: string | null;
}

export interface LocalAudioClip {
  attemptId: string;
  label: string;
  blobUrl: string;
  mimeType: string;
  durationSeconds: number;
  byteSize: number;
  createdAtIso: string;
}

export interface EvidenceLogEntry {
  id: string;
  timestampIso: string;
  kind: "ui_event" | "audio_event" | "gateway_call" | "coco_response" | "error";
  stage: string;
  summary: string;
  model?: string;
  latencyMs?: number;
  httpStatus?: number;
  errorMessage?: string;
  cocoText?: string;
  transcriptAttemptId?: string;
}

export interface JourneyScope {
  checkInCompleted: boolean;
  currentStageLabel: string;
  completedStepTitles: string[];
  unreachedStepTitles: string[];
  reachedSectionSummaries: Array<{ id: string; heading: string; narration: string }>;
  recentAttempts: SpeechAttempt[];
  speechEvents: SpeechEvent[];
  sharedMemories: CoachMemoryItem[];
  speechTermMode: SpeechTermMode;
}
