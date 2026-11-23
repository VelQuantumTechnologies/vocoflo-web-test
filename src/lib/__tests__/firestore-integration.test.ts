import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildP01MirrorOpening } from "@/lib/ai/coco-prompts";
import {
  buildCoachMemoryCreatePayload,
  buildCoachMemoryUpdatePayload,
  buildLearnerProfileCreatePayload,
  buildLearnerProfileUpdatePayload,
  buildLessonProgressCreatePayload,
  buildLessonProgressUpdatePayload,
  buildSpeechAttemptCreatePayload,
  buildSpeechAttemptUpdatePayload,
  buildSpeechEventCreatePayload,
  buildSpeechEventUpdatePayload,
  buildTransferPlanCreatePayload,
  buildTransferPlanUpdatePayload,
  FIRESTORE_COLLECTIONS,
  isValidFirestoreId,
  sanitizeFirestoreId,
} from "@/lib/firebase/firestore-schema";
import { mergeSpeechEventsPreservingReviews } from "@/lib/speech/validation";
import type {
  CoachMemoryItem,
  SpeechAttempt,
  SpeechEvent,
  TransferPlan,
} from "@/types/vocoflo";

const SERVER_TS = { __mock: "serverTimestamp" };
const DELETE_FIELD = { __mock: "deleteField" };

// In-memory Firestore mock aligned with deployed collection paths
type MockDocRecord = Record<string, unknown>;
const mockStore = new Map<string, MockDocRecord>();

const mockClient = {
  getNamedFirestore: vi.fn(() => ({ __mockDb: true })),
};

vi.mock("@/lib/firebase/client", () => mockClient);

vi.mock("firebase/firestore", () => {
  const doc = (_dbOrRef: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
    id: segments[segments.length - 1],
  });
  const collection = (_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  });
  const serverTimestamp = () => SERVER_TS;
  const deleteField = () => DELETE_FIELD;

  const getDoc = vi.fn(async (ref: { path: string; id: string }) => {
    const data = mockStore.get(ref.path);
    return {
      id: ref.id,
      exists: () => data !== undefined,
      data: () => (data ? { ...data } : undefined),
    };
  });

  const getDocs = vi.fn(async (colRef: { path: string }) => {
    const prefix = `${colRef.path}/`;
    const docs: Array<{ id: string; data: () => MockDocRecord }> = [];
    for (const [path, data] of mockStore.entries()) {
      if (path.startsWith(prefix) && !path.slice(prefix.length).includes("/")) {
        docs.push({
          id: path.slice(prefix.length),
          data: () => ({ ...data }),
        });
      }
    }
    return { docs };
  });

  const applyUpdate = (existing: MockDocRecord, patch: MockDocRecord): MockDocRecord => {
    const next = { ...existing };
    for (const [k, v] of Object.entries(patch)) {
      if (v === DELETE_FIELD) {
        delete next[k];
      } else {
        next[k] = v;
      }
    }
    return next;
  };

  const setDoc = vi.fn(async (ref: { path: string }, data: MockDocRecord) => {
    mockStore.set(ref.path, applyUpdate({}, data));
  });

  const updateDoc = vi.fn(async (ref: { path: string }, patch: MockDocRecord) => {
    const existing = mockStore.get(ref.path);
    if (!existing) {
      throw new Error(`No document to update at ${ref.path}`);
    }
    mockStore.set(ref.path, applyUpdate(existing, patch));
  });

  const deleteDoc = vi.fn(async (ref: { path: string }) => {
    mockStore.delete(ref.path);
  });

  const writeBatch = vi.fn(() => {
    const ops: Array<() => void> = [];
    return {
      delete: (ref: { path: string }) => {
        ops.push(() => mockStore.delete(ref.path));
      },
      set: (ref: { path: string }, data: MockDocRecord) => {
        ops.push(() => mockStore.set(ref.path, applyUpdate({}, data)));
      },
      commit: vi.fn(async () => {
        for (const op of ops) op();
      }),
    };
  });

  return {
    collection,
    deleteDoc,
    deleteField,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    updateDoc,
    writeBatch,
  };
});

describe("Firestore schema & firestore.rules alignment", () => {
  beforeEach(() => {
    mockStore.clear();
    vi.clearAllMocks();
  });

  it("uses the exact deployed collection names from firestore.rules", () => {
    expect(FIRESTORE_COLLECTIONS).toEqual({
      users: "users",
      entitlements: "entitlements",
      lessonProgress: "lesson_progress",
      attempts: "attempts",
      speechEvents: "speech_events",
      memories: "memories",
      transferPlans: "transfer_plans",
      allowanceCounters: "allowance_counters",
    });
  });

  it("validates and sanitizes document IDs per isValidId()", () => {
    expect(isValidFirestoreId("att_ci_123-abc")).toBe(true);
    expect(isValidFirestoreId("bad/id.with:chars")).toBe(false);
    expect(isValidFirestoreId("")).toBe(false);
    expect(isValidFirestoreId("a".repeat(129))).toBe(false);

    const sanitized = sanitizeFirestoreId("bad/id.with:chars");
    expect(isValidFirestoreId(sanitized)).toBe(true);
    expect(isValidFirestoreId(sanitizeFirestoreId("!!!"))).toBe(true);
  });

  it("covers first-time profile creation and preserves server-only fields on updates", async () => {
    const createPayload = buildLearnerProfileCreatePayload({
      uid: "uid_test_1",
      displayName: "   ",
      createdAt: SERVER_TS,
      updatedAt: SERVER_TS,
    });

    expect(Object.keys(createPayload).sort()).toEqual([
      "chosenGoals",
      "completedCheckIn",
      "createdAt",
      "developmentFixtureEnabled",
      "displayName",
      "importantSituations",
      "membershipStatus",
      "membershipTier",
      "onboardingSeen",
      "preferredLanguage",
      "selectedToolId",
      "updatedAt",
      "userId",
    ]);
    expect(createPayload.displayName).toBe("Learner");
    expect(createPayload.membershipTier).toBe("free_preview");
    expect(createPayload.membershipStatus).toBe("active_preview");
    expect(createPayload.selectedToolId).toBe("P01");

    const updatePayload = buildLearnerProfileUpdatePayload(
      {
        chosenGoals: Array.from({ length: 12 }, (_, i) => `Goal ${i}`),
        importantSituations: [" Standups ", ""],
        completedCheckIn: true,
      },
      SERVER_TS
    );
    expect(Object.keys(updatePayload).sort()).toEqual([
      "chosenGoals",
      "completedCheckIn",
      "importantSituations",
      "updatedAt",
    ]);
    expect(updatePayload.chosenGoals).toHaveLength(10);
    expect(updatePayload.importantSituations).toEqual(["Standups"]);

    const { loadOrCreateLearnerProfile, updateLearnerProfileFields } = await import(
      "@/lib/firebase/repository"
    );

    const created = await loadOrCreateLearnerProfile("uid_test_1", "Alex Tester");
    expect(created.userId).toBe("uid_test_1");
    expect(created.displayName).toBe("Alex Tester");
    expect(created.membershipTier).toBe("free_preview");
    expect(created.membershipStatus).toBe("active_preview");
    expect(mockStore.has("users/uid_test_1")).toBe(true);

    // Simulate existing profile with preview_pending preserved on reload
    mockStore.set("users/uid_test_2", {
      ...createPayload,
      userId: "uid_test_2",
      membershipStatus: "preview_pending",
    });
    const reloaded = await loadOrCreateLearnerProfile("uid_test_2", "Ignored");
    expect(reloaded.membershipStatus).toBe("preview_pending");

    await updateLearnerProfileFields("uid_test_1", {
      chosenGoals: ["Speak up in team meetings"],
      completedCheckIn: true,
    });
    const storedAfterUpdate = mockStore.get("users/uid_test_1");
    expect(storedAfterUpdate?.completedCheckIn).toBe(true);
    expect(storedAfterUpdate?.membershipTier).toBe("free_preview");
  });

  it("covers saving Check-In attempts and deleting cleared optional fields instead of writing null", async () => {
    const attempt: SpeechAttempt = {
      id: "att_ci_spont_1",
      userId: "uid_test_1",
      sourceContext: "check_in_spontaneous",
      activityOrSectionId: "ci_spontaneous",
      promptText: "Tell Coco about your morning.",
      durationSeconds: 18.4,
      hasLocalAudio: true,
      analysisStatus: "pending",
      selfReportEffort: 3,
      createdAtIso: new Date().toISOString(),
    };

    const createPayload = buildSpeechAttemptCreatePayload(attempt, SERVER_TS, SERVER_TS);
    expect(createPayload).toMatchObject({
      userId: "uid_test_1",
      sourceContext: "check_in_spontaneous",
      activityOrSectionId: "ci_spontaneous",
      durationSeconds: 18.4,
      hasLocalAudio: true,
      analysisStatus: "pending",
      selfReportEffort: 3,
    });

    // Clearing effort or error must emit deleteField(), never null (rules require `is int` / `is string`)
    const clearUpdate = buildSpeechAttemptUpdatePayload(
      {
        analysisStatus: "success",
        disfluentTranscript: "Good m-morning everyone.",
        summaryObservation: "One brief syllable repetition on morning.",
        analysisError: null,
        selfReportEffort: null,
      },
      SERVER_TS,
      DELETE_FIELD
    );
    expect(clearUpdate.analysisError).toBe(DELETE_FIELD);
    expect(clearUpdate.selfReportEffort).toBe(DELETE_FIELD);

    const { persistSpeechAttempt, updateSpeechAttemptFields } = await import(
      "@/lib/firebase/repository"
    );
    await persistSpeechAttempt(attempt);
    expect(mockStore.has("users/uid_test_1/attempts/att_ci_spont_1")).toBe(true);

    await updateSpeechAttemptFields("uid_test_1", "att_ci_spont_1", {
      analysisStatus: "success",
      disfluentTranscript: "Good m-morning everyone.",
      analysisError: null,
      selfReportEffort: null,
    });
    const stored = mockStore.get("users/uid_test_1/attempts/att_ci_spont_1");
    expect(stored?.analysisStatus).toBe("success");
    expect(stored?.disfluentTranscript).toBe("Good m-morning everyone.");
    expect("selfReportEffort" in (stored || {})).toBe(false);
    expect("analysisError" in (stored || {})).toBe(false);
  });

  it("covers speech-event bounds, corrections, and stale AI event replacement", async () => {
    const zeroLenEvent: SpeechEvent = {
      id: "sev_1",
      userId: "uid_test_1",
      attemptId: "att_ci_spont_1",
      startSeconds: 599.9,
      endSeconds: 599.9,
      eventType: "pause",
      tentativeObservation: "Brief pause",
      sourceKind: "ai_observed",
      reviewState: "unreviewed",
    };

    const payload = buildSpeechEventCreatePayload(zeroLenEvent, SERVER_TS, SERVER_TS);
    expect(Number(payload.endSeconds)).toBeGreaterThan(Number(payload.startSeconds));
    expect(Number(payload.endSeconds)).toBeLessThanOrEqual(600);

    const reviewPatch = buildSpeechEventUpdatePayload(
      {
        reviewState: "corrected",
        eventType: "user_reported_block",
        correctedLabel: "silent block",
        correctionNote: "Felt stuck before speaking",
      },
      SERVER_TS
    );
    expect(Object.keys(reviewPatch).sort()).toEqual([
      "correctedLabel",
      "correctionNote",
      "eventType",
      "reviewState",
      "updatedAt",
    ]);

    const {
      persistSpeechEvent,
      replaceSpeechEventsForAttempt,
      updateSpeechEventReviewInFirestore,
    } = await import("@/lib/firebase/repository");

    // Seed one confirmed event + one stale unreviewed AI event
    await persistSpeechEvent({
      ...zeroLenEvent,
      id: "sev_confirmed",
      startSeconds: 1.0,
      endSeconds: 1.6,
      reviewState: "confirmed",
    });
    await persistSpeechEvent({
      ...zeroLenEvent,
      id: "sev_stale",
      startSeconds: 3.0,
      endSeconds: 3.4,
      reviewState: "unreviewed",
    });

    const existing: SpeechEvent[] = [
      {
        ...zeroLenEvent,
        id: "sev_confirmed",
        startSeconds: 1.0,
        endSeconds: 1.6,
        reviewState: "confirmed",
      },
      {
        ...zeroLenEvent,
        id: "sev_stale",
        startSeconds: 3.0,
        endSeconds: 3.4,
        reviewState: "unreviewed",
      },
    ];
    const incoming: SpeechEvent[] = [
      {
        ...zeroLenEvent,
        id: "sev_new_fresh",
        startSeconds: 5.0,
        endSeconds: 5.4,
        reviewState: "unreviewed",
      },
    ];
    const merged = mergeSpeechEventsPreservingReviews(existing, incoming);
    await replaceSpeechEventsForAttempt(
      "uid_test_1",
      merged.eventIdsToDelete,
      merged.eventsToInsert
    );

    expect(mockStore.has("users/uid_test_1/speech_events/sev_confirmed")).toBe(true);
    expect(mockStore.has("users/uid_test_1/speech_events/sev_stale")).toBe(false);
    expect(mockStore.has("users/uid_test_1/speech_events/sev_new_fresh")).toBe(true);

    await updateSpeechEventReviewInFirestore(
      "uid_test_1",
      "sev_new_fresh",
      "corrected",
      "repetition",
      "syllable repetition",
      "Happened on first word"
    );
    const updatedEvt = mockStore.get("users/uid_test_1/speech_events/sev_new_fresh");
    expect(updatedEvt?.reviewState).toBe("corrected");
    expect(updatedEvt?.eventType).toBe("repetition");
    expect(updatedEvt?.correctedLabel).toBe("syllable repetition");
  });

  it("covers memory continuity: create vs update without mutating createdAt/userId and P01 hydration", async () => {
    const blankMem: CoachMemoryItem = {
      id: "mem_blank",
      userId: "uid_test_1",
      category: "goal",
      fact: "   ",
      sourceKind: "user_report",
      sourceReference: "web_check_in",
    };
    expect(buildCoachMemoryCreatePayload(blankMem, SERVER_TS, SERVER_TS)).toBeNull();
    expect(buildCoachMemoryUpdatePayload(blankMem, SERVER_TS)).toBeNull();

    const { persistCoachMemory, loadLearnerContext } = await import("@/lib/firebase/repository");
    const { setDoc, updateDoc } = await import("firebase/firestore");

    const memItem: CoachMemoryItem = {
      id: "mem_checkin_situations",
      userId: "uid_test_1",
      category: "context",
      fact: "Important speaking situations: Team standups",
      sourceKind: "user_report",
      sourceReference: "web_check_in_context",
    };

    // First write creates the document
    await persistCoachMemory(memItem);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledTimes(0);

    // Second write updates WITHOUT overwriting immutable userId or createdAt
    await persistCoachMemory({
      ...memItem,
      fact: "Important speaking situations: Team standups, Client demos",
      sourceKind: "user_confirmed",
    });
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const secondPatch = vi.mocked(updateDoc).mock.calls[0]?.[1] as unknown as Record<
      string,
      unknown
    >;
    expect(Object.keys(secondPatch).sort()).toEqual([
      "category",
      "fact",
      "sourceKind",
      "sourceReference",
      "updatedAt",
    ]);
    expect("createdAt" in secondPatch).toBe(false);
    expect("userId" in secondPatch).toBe(false);

    const ctx = await loadLearnerContext("uid_test_1");
    expect(ctx.memories).toHaveLength(1);
    expect(ctx.memories[0].fact).toContain("Client demos");

    const opening = buildP01MirrorOpening({
      profile: null,
      memories: ctx.memories,
      attempts: [],
      speechTermMode: "stammering",
    });
    expect(opening.hasGenuineMemory).toBe(true);
    expect(opening.text.toLowerCase()).toContain("team standups");
  });

  it("covers P01 lesson_progress, transfer_plans, and full context loading", async () => {
    const createProgress = buildLessonProgressCreatePayload(
      {
        userId: "uid_test_1",
        toolId: "P01",
        currentStepIndex: 99,
        completedSteps: ["p01_beat_1_mirror"],
        skippedSteps: [],
        understandingChoiceId: "B",
        reviewObservationChoice: "lighter",
        sessionCompleted: false,
      },
      SERVER_TS,
      SERVER_TS
    );
    expect(createProgress.currentStepIndex).toBe(50);
    expect(Object.keys(createProgress).sort()).toEqual([
      "completedSteps",
      "createdAt",
      "currentStepIndex",
      "reviewObservationChoice",
      "sessionCompleted",
      "skippedSteps",
      "toolId",
      "understandingChoiceId",
      "updatedAt",
      "userId",
    ]);

    const updateProgress = buildLessonProgressUpdatePayload(
      {
        currentStepIndex: 4,
        completedSteps: ["p01_beat_1_mirror", "p01_beat_5_transfer"],
        skippedSteps: [],
        understandingChoiceId: "B",
        reviewObservationChoice: "lighter",
        sessionCompleted: true,
      },
      SERVER_TS
    );
    expect("userId" in updateProgress).toBe(false);
    expect("toolId" in updateProgress).toBe(false);
    expect("createdAt" in updateProgress).toBe(false);

    const invalidPlan: TransferPlan = {
      id: "plan_empty",
      userId: "uid_test_1",
      toolId: "P01",
      situation: "  ",
      smallAction: "Speak calmly",
      planStatus: "active",
    };
    expect(buildTransferPlanCreatePayload(invalidPlan, SERVER_TS, SERVER_TS)).toBeNull();
    expect(buildTransferPlanUpdatePayload(invalidPlan, SERVER_TS)).toBeNull();

    const {
      persistP01Progress,
      persistTransferPlan,
      loadLearnerContext,
      currentUtcPeriodKey,
    } = await import("@/lib/firebase/repository");

    // Create + Update P01 progress
    await persistP01Progress("uid_test_1", 2, ["p01_beat_1_mirror", "p01_beat_2_speak_first"], [], false, null, "B");
    await persistP01Progress(
      "uid_test_1",
      4,
      ["p01_beat_1_mirror", "p01_beat_2_speak_first", "p01_beat_5_transfer"],
      [],
      true,
      "lighter",
      "B"
    );

    // Create + Update transfer plan
    const plan: TransferPlan = {
      id: "plan_p01_abc",
      userId: "uid_test_1",
      toolId: "P01",
      situation: "Friday team check-in",
      smallAction: "Share one clear update without self-judging",
      observationToNotice: "Notice one moment afterward",
      planStatus: "active",
    };
    await persistTransferPlan(plan);
    await persistTransferPlan({
      ...plan,
      planStatus: "reviewed",
      reviewOutcomeNote: "Shared my update clearly.",
    });
    const storedPlan = mockStore.get("users/uid_test_1/transfer_plans/plan_p01_abc");
    expect(storedPlan?.planStatus).toBe("reviewed");
    expect(storedPlan?.reviewOutcomeNote).toBe("Shared my update clearly.");

    // Seed read-only entitlements/current and allowance_counters/{YYYY-MM}
    const periodKey = currentUtcPeriodKey();
    mockStore.set("users/uid_test_1/entitlements/current", {
      membershipTier: "cohort_preview",
      membershipStatus: "active_cohort",
    });
    mockStore.set(`users/uid_test_1/allowance_counters/${periodKey}`, {
      liveAiCalls: 7,
    });
    mockStore.set("users/uid_test_1/attempts/att_ts", {
      userId: "uid_test_1",
      sourceContext: "check_in_reading",
      activityOrSectionId: "ci_reading",
      promptText: "Reading prompt",
      durationSeconds: 12,
      hasLocalAudio: false,
      analysisStatus: "not_requested",
      createdAt: { toDate: () => new Date("2026-11-23T10:00:00.000Z") },
    });

    const ctx = await loadLearnerContext("uid_test_1");
    expect(ctx.p01Completed).toBe(true);
    expect(ctx.p01Progress?.currentStepIndex).toBe(4);
    expect(ctx.p01Progress?.understandingChoiceId).toBe("B");
    expect(ctx.p01Progress?.reviewObservationChoice).toBe("lighter");
    expect(ctx.serverEntitlementTier).toBe("cohort_preview");
    expect(ctx.monthlyLiveAiCalls).toBe(7);
    expect(ctx.attempts[0]?.createdAtIso).toBe("2026-11-23T10:00:00.000Z");
  });
});
