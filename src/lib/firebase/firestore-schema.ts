import type {
  CoachMemoryItem,
  LearnerProfile,
  LessonProgress,
  SpeechAttempt,
  SpeechEvent,
  SpeechEventReviewState,
  SpeechEventType,
  TransferPlan,
} from "@/types/vocoflo";

export const FIRESTORE_COLLECTIONS = {
  users: "users",
  entitlements: "entitlements",
  lessonProgress: "lesson_progress",
  attempts: "attempts",
  speechEvents: "speech_events",
  memories: "memories",
  transferPlans: "transfer_plans",
  allowanceCounters: "allowance_counters",
} as const;

export const ALLOWED_SOURCE_CONTEXTS = new Set<SpeechAttempt["sourceContext"]>([
  "check_in_reading",
  "check_in_spontaneous",
  "check_in_conversation",
  "check_in_shift_experiment",
  "lesson_p01",
  "lesson_tool",
  "practice_static",
  "roleplay_live",
]);

export const ALLOWED_ANALYSIS_STATUSES = new Set<SpeechAttempt["analysisStatus"]>([
  "not_requested",
  "pending",
  "success",
  "failed",
  "fixture",
]);

export const ALLOWED_EVENT_TYPES = new Set<SpeechEventType>([
  "repetition",
  "prolongation",
  "pause",
  "other_uncertain",
  "user_reported_block",
]);

export const ALLOWED_REVIEW_STATES = new Set<SpeechEventReviewState>([
  "unreviewed",
  "confirmed",
  "dismissed",
  "corrected",
]);

export const ALLOWED_MEMORY_CATEGORIES = new Set<CoachMemoryItem["category"]>([
  "goal",
  "context",
  "trigger",
  "active_tool",
  "transfer_plan",
  "approach_feedback",
  "observation",
]);

export const ALLOWED_MEMORY_SOURCE_KINDS = new Set<CoachMemoryItem["sourceKind"]>([
  "user_report",
  "user_confirmed",
]);

export const FIRESTORE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidFirestoreId(id: string): boolean {
  return FIRESTORE_ID_REGEX.test(id);
}

export function sanitizeFirestoreId(raw: string, fallbackPrefix = "doc"): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  if (isValidFirestoreId(cleaned)) return cleaned;
  const randomSuffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 12);
  return `${fallbackPrefix}_${randomSuffix}`.slice(0, 128);
}

export function sanitizeStringList(list: string[], maxLen: number): string[] {
  return list
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .slice(0, maxLen);
}

export function buildLearnerProfileCreatePayload<TTime>(params: {
  uid: string;
  displayName: string;
  createdAt: TTime;
  updatedAt: TTime;
}): Record<string, unknown> {
  const safeName = params.displayName.trim().slice(0, 100) || "Learner";
  return {
    userId: params.uid,
    displayName: safeName,
    chosenGoals: [],
    importantSituations: [],
    completedCheckIn: false,
    selectedToolId: "P01",
    developmentFixtureEnabled: false,
    preferredLanguage: "en",
    membershipTier: "free_preview",
    membershipStatus: "active_preview",
    onboardingSeen: false,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  };
}

export function buildLearnerProfileUpdatePayload<TTime>(
  fields: Partial<
    Pick<
      LearnerProfile,
      | "displayName"
      | "chosenGoals"
      | "importantSituations"
      | "completedCheckIn"
      | "selectedToolId"
      | "developmentFixtureEnabled"
      | "preferredLanguage"
      | "onboardingSeen"
    >
  >,
  updatedAt: TTime
): Record<string, unknown> {
  const payload: Record<string, unknown> = { updatedAt };
  if (fields.displayName !== undefined) {
    payload.displayName = fields.displayName.trim().slice(0, 100) || "Learner";
  }
  if (fields.chosenGoals !== undefined) {
    payload.chosenGoals = sanitizeStringList(fields.chosenGoals, 10);
  }
  if (fields.importantSituations !== undefined) {
    payload.importantSituations = sanitizeStringList(fields.importantSituations, 10);
  }
  if (fields.completedCheckIn !== undefined) {
    payload.completedCheckIn = Boolean(fields.completedCheckIn);
  }
  if (fields.selectedToolId !== undefined) {
    payload.selectedToolId = fields.selectedToolId.trim().slice(0, 32) || "P01";
  }
  if (fields.developmentFixtureEnabled !== undefined) {
    payload.developmentFixtureEnabled = Boolean(fields.developmentFixtureEnabled);
  }
  if (fields.preferredLanguage !== undefined) {
    payload.preferredLanguage = fields.preferredLanguage === "hi" ? "hi" : "en";
  }
  if (fields.onboardingSeen !== undefined) {
    payload.onboardingSeen = Boolean(fields.onboardingSeen);
  }
  return payload;
}

export function buildLessonProgressCreatePayload<TTime>(
  progress: LessonProgress,
  createdAt: TTime,
  updatedAt: TTime
): Record<string, unknown> {
  const safeIndex = Math.min(50, Math.max(0, Math.round(progress.currentStepIndex || 0)));
  const payload: Record<string, unknown> = {
    userId: progress.userId,
    toolId: (progress.toolId.trim() || "P01").slice(0, 32),
    currentStepIndex: safeIndex,
    completedSteps: sanitizeStringList(progress.completedSteps, 30),
    skippedSteps: sanitizeStringList(progress.skippedSteps, 30),
    sessionCompleted: Boolean(progress.sessionCompleted),
    createdAt,
    updatedAt,
  };
  const understanding = progress.understandingChoiceId?.trim();
  if (understanding) {
    payload.understandingChoiceId = understanding.slice(0, 16);
  }
  const reviewChoice = progress.reviewObservationChoice?.trim();
  if (reviewChoice) {
    payload.reviewObservationChoice = reviewChoice.slice(0, 64);
  }
  return payload;
}

export function buildLessonProgressUpdatePayload<TTime>(
  progress: Omit<LessonProgress, "userId" | "toolId">,
  updatedAt: TTime
): Record<string, unknown> {
  const safeIndex = Math.min(50, Math.max(0, Math.round(progress.currentStepIndex || 0)));
  const payload: Record<string, unknown> = {
    currentStepIndex: safeIndex,
    completedSteps: sanitizeStringList(progress.completedSteps, 30),
    skippedSteps: sanitizeStringList(progress.skippedSteps, 30),
    sessionCompleted: Boolean(progress.sessionCompleted),
    updatedAt,
  };
  const understanding = progress.understandingChoiceId?.trim();
  if (understanding) {
    payload.understandingChoiceId = understanding.slice(0, 16);
  }
  const reviewChoice = progress.reviewObservationChoice?.trim();
  if (reviewChoice) {
    payload.reviewObservationChoice = reviewChoice.slice(0, 64);
  }
  return payload;
}

export function buildSpeechAttemptCreatePayload<TTime>(
  attempt: SpeechAttempt,
  createdAt: TTime,
  updatedAt: TTime
): Record<string, unknown> {
  const sourceContext = ALLOWED_SOURCE_CONTEXTS.has(attempt.sourceContext)
    ? attempt.sourceContext
    : "check_in_spontaneous";
  const analysisStatus = ALLOWED_ANALYSIS_STATUSES.has(attempt.analysisStatus)
    ? attempt.analysisStatus
    : "not_requested";
  const duration = Number.isFinite(attempt.durationSeconds)
    ? Math.min(600, Math.max(0, attempt.durationSeconds))
    : 0;

  const payload: Record<string, unknown> = {
    userId: attempt.userId,
    sourceContext,
    activityOrSectionId: (attempt.activityOrSectionId.trim() || "sample").slice(0, 64),
    promptText: attempt.promptText.slice(0, 1000),
    durationSeconds: duration,
    hasLocalAudio: Boolean(attempt.hasLocalAudio),
    analysisStatus,
    createdAt,
    updatedAt,
  };

  if (attempt.analysisProvider?.trim()) {
    payload.analysisProvider = attempt.analysisProvider.trim().slice(0, 64);
  }
  if (attempt.analysisModel?.trim()) {
    payload.analysisModel = attempt.analysisModel.trim().slice(0, 64);
  }
  if (attempt.adapterVersion?.trim()) {
    payload.adapterVersion = attempt.adapterVersion.trim().slice(0, 32);
  }
  if (attempt.disfluentTranscript?.trim()) {
    payload.disfluentTranscript = attempt.disfluentTranscript.trim().slice(0, 4000);
  }
  if (attempt.summaryObservation?.trim()) {
    payload.summaryObservation = attempt.summaryObservation.trim().slice(0, 1000);
  }
  if (attempt.analysisError?.trim()) {
    payload.analysisError = attempt.analysisError.trim().slice(0, 500);
  }
  if (
    typeof attempt.selfReportEffort === "number" &&
    Number.isFinite(attempt.selfReportEffort)
  ) {
    payload.selfReportEffort = Math.min(5, Math.max(1, Math.round(attempt.selfReportEffort)));
  }
  if (attempt.selfReportAvoidanceNote?.trim()) {
    payload.selfReportAvoidanceNote = attempt.selfReportAvoidanceNote.trim().slice(0, 500);
  }
  if (attempt.selfReportParticipationNote?.trim()) {
    payload.selfReportParticipationNote = attempt.selfReportParticipationNote.trim().slice(0, 500);
  }
  return payload;
}

export interface SpeechAttemptUpdateInput {
  localAudioPath?: string | null;
  hasLocalAudio?: boolean;
  analysisStatus?: SpeechAttempt["analysisStatus"];
  analysisProvider?: string | null;
  analysisModel?: string | null;
  adapterVersion?: string | null;
  disfluentTranscript?: string | null;
  summaryObservation?: string | null;
  analysisError?: string | null;
  selfReportEffort?: number | null;
  selfReportAvoidanceNote?: string | null;
  selfReportParticipationNote?: string | null;
}

export function buildSpeechAttemptUpdatePayload<TTime, TDelete>(
  fields: SpeechAttemptUpdateInput,
  updatedAt: TTime,
  deleteFieldValue: TDelete
): Record<string, unknown> {
  const payload: Record<string, unknown> = { updatedAt };

  const setStringOrDelete = (key: string, val: string | null | undefined, maxLen: number) => {
    if (val === undefined) return;
    const trimmed = val?.trim();
    payload[key] = trimmed ? trimmed.slice(0, maxLen) : deleteFieldValue;
  };

  if (fields.hasLocalAudio !== undefined) {
    payload.hasLocalAudio = Boolean(fields.hasLocalAudio);
  }
  if (fields.analysisStatus !== undefined) {
    payload.analysisStatus = ALLOWED_ANALYSIS_STATUSES.has(fields.analysisStatus)
      ? fields.analysisStatus
      : "failed";
  }

  setStringOrDelete("localAudioPath", fields.localAudioPath, 500);
  setStringOrDelete("analysisProvider", fields.analysisProvider, 64);
  setStringOrDelete("analysisModel", fields.analysisModel, 64);
  setStringOrDelete("adapterVersion", fields.adapterVersion, 32);
  setStringOrDelete("disfluentTranscript", fields.disfluentTranscript, 4000);
  setStringOrDelete("summaryObservation", fields.summaryObservation, 1000);
  setStringOrDelete("analysisError", fields.analysisError, 500);
  setStringOrDelete("selfReportAvoidanceNote", fields.selfReportAvoidanceNote, 500);
  setStringOrDelete("selfReportParticipationNote", fields.selfReportParticipationNote, 500);

  if (fields.selfReportEffort !== undefined) {
    if (
      typeof fields.selfReportEffort === "number" &&
      Number.isFinite(fields.selfReportEffort)
    ) {
      payload.selfReportEffort = Math.min(5, Math.max(1, Math.round(fields.selfReportEffort)));
    } else {
      payload.selfReportEffort = deleteFieldValue;
    }
  }

  return payload;
}

export function buildSpeechEventCreatePayload<TTime>(
  evt: SpeechEvent,
  createdAt: TTime,
  updatedAt: TTime
): Record<string, unknown> {
  const start = Number.isFinite(evt.startSeconds)
    ? Math.min(599.9, Math.max(0, Number(evt.startSeconds.toFixed(2))))
    : 0;
  const rawEnd = Number.isFinite(evt.endSeconds) ? evt.endSeconds : start + 0.1;
  const end = Math.min(600, Math.max(Number((start + 0.01).toFixed(2)), Number(rawEnd.toFixed(2))));

  const eventType: SpeechEventType = ALLOWED_EVENT_TYPES.has(evt.eventType)
    ? evt.eventType
    : "other_uncertain";
  const reviewState: SpeechEventReviewState = ALLOWED_REVIEW_STATES.has(evt.reviewState)
    ? evt.reviewState
    : "unreviewed";
  const sourceKind =
    evt.sourceKind === "user_reported" || evt.sourceKind === "development_fixture"
      ? evt.sourceKind
      : "ai_observed";

  const payload: Record<string, unknown> = {
    userId: evt.userId,
    attemptId: (evt.attemptId.trim() || "attempt").slice(0, 128),
    startSeconds: start,
    endSeconds: end,
    eventType,
    tentativeObservation: (evt.tentativeObservation || "").slice(0, 500),
    sourceKind,
    reviewState,
    createdAt,
    updatedAt,
  };

  if (evt.wordOrSound?.trim()) {
    payload.wordOrSound = evt.wordOrSound.trim().slice(0, 128);
  }
  if (evt.correctedLabel?.trim()) {
    payload.correctedLabel = evt.correctedLabel.trim().slice(0, 128);
  }
  if (evt.correctionNote?.trim()) {
    payload.correctionNote = evt.correctionNote.trim().slice(0, 500);
  }
  return payload;
}

export function buildSpeechEventUpdatePayload<TTime>(
  params: {
    reviewState: SpeechEventReviewState;
    eventType?: SpeechEventType;
    correctedLabel?: string;
    correctionNote?: string;
  },
  updatedAt: TTime
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    reviewState: ALLOWED_REVIEW_STATES.has(params.reviewState)
      ? params.reviewState
      : "unreviewed",
    updatedAt,
  };
  if (params.eventType && ALLOWED_EVENT_TYPES.has(params.eventType)) {
    payload.eventType = params.eventType;
  }
  if (params.correctedLabel?.trim()) {
    payload.correctedLabel = params.correctedLabel.trim().slice(0, 128);
  }
  if (params.correctionNote?.trim()) {
    payload.correctionNote = params.correctionNote.trim().slice(0, 500);
  }
  return payload;
}

export function buildCoachMemoryCreatePayload<TTime>(
  item: CoachMemoryItem,
  createdAt: TTime,
  updatedAt: TTime
): Record<string, unknown> | null {
  const fact = item.fact.trim().slice(0, 500);
  if (!fact) return null;
  const sourceReference = (item.sourceReference.trim() || "web_test").slice(0, 128);
  const category = ALLOWED_MEMORY_CATEGORIES.has(item.category)
    ? item.category
    : "observation";
  const sourceKind = ALLOWED_MEMORY_SOURCE_KINDS.has(item.sourceKind)
    ? item.sourceKind
    : "user_report";

  return {
    userId: item.userId,
    category,
    fact,
    sourceKind,
    sourceReference,
    createdAt,
    updatedAt,
  };
}

export function buildCoachMemoryUpdatePayload<TTime>(
  item: Pick<CoachMemoryItem, "category" | "fact" | "sourceKind" | "sourceReference">,
  updatedAt: TTime
): Record<string, unknown> | null {
  const fact = item.fact.trim().slice(0, 500);
  if (!fact) return null;
  const sourceReference = (item.sourceReference.trim() || "web_test").slice(0, 128);
  const category = ALLOWED_MEMORY_CATEGORIES.has(item.category)
    ? item.category
    : "observation";
  const sourceKind = ALLOWED_MEMORY_SOURCE_KINDS.has(item.sourceKind)
    ? item.sourceKind
    : "user_confirmed";

  return {
    category,
    fact,
    sourceKind,
    sourceReference,
    updatedAt,
  };
}

export function buildTransferPlanCreatePayload<TTime>(
  plan: TransferPlan,
  createdAt: TTime,
  updatedAt: TTime
): Record<string, unknown> | null {
  const situation = plan.situation.trim().slice(0, 300);
  const smallAction = plan.smallAction.trim().slice(0, 300);
  if (!situation || !smallAction) return null;

  const planStatus =
    plan.planStatus === "reviewed" || plan.planStatus === "archived"
      ? plan.planStatus
      : "active";

  const payload: Record<string, unknown> = {
    userId: plan.userId,
    toolId: (plan.toolId.trim() || "P01").slice(0, 32),
    situation,
    smallAction,
    planStatus,
    createdAt,
    updatedAt,
  };
  if (plan.observationToNotice?.trim()) {
    payload.observationToNotice = plan.observationToNotice.trim().slice(0, 300);
  }
  if (plan.reviewOutcomeNote?.trim()) {
    payload.reviewOutcomeNote = plan.reviewOutcomeNote.trim().slice(0, 500);
  }
  return payload;
}

export function buildTransferPlanUpdatePayload<TTime>(
  plan: Pick<
    TransferPlan,
    "situation" | "smallAction" | "observationToNotice" | "reviewOutcomeNote" | "planStatus"
  >,
  updatedAt: TTime
): Record<string, unknown> | null {
  const situation = plan.situation.trim().slice(0, 300);
  const smallAction = plan.smallAction.trim().slice(0, 300);
  if (!situation || !smallAction) return null;

  const planStatus =
    plan.planStatus === "reviewed" || plan.planStatus === "archived"
      ? plan.planStatus
      : "active";

  const payload: Record<string, unknown> = {
    situation,
    smallAction,
    planStatus,
    updatedAt,
  };
  if (plan.observationToNotice?.trim()) {
    payload.observationToNotice = plan.observationToNotice.trim().slice(0, 300);
  }
  if (plan.reviewOutcomeNote?.trim()) {
    payload.reviewOutcomeNote = plan.reviewOutcomeNote.trim().slice(0, 500);
  }
  return payload;
}
