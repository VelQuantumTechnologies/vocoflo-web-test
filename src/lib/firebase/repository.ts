"use client";

import {
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
  type Timestamp,
} from "firebase/firestore";
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
import { getNamedFirestore } from "./client";
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
  sanitizeFirestoreId,
  type SpeechAttemptUpdateInput,
} from "./firestore-schema";

function timestampToIso(ts: unknown): string {
  if (ts && typeof ts === "object" && "toDate" in ts && typeof (ts as Timestamp).toDate === "function") {
    return (ts as Timestamp).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

export function currentUtcPeriodKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function loadOrCreateLearnerProfile(
  uid: string,
  fallbackDisplayName: string
): Promise<LearnerProfile> {
  const db = getNamedFirestore();
  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  const ref = doc(db, FIRESTORE_COLLECTIONS.users, uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    return {
      userId: String(d.userId || uid),
      displayName: String(d.displayName || fallbackDisplayName || "Learner"),
      chosenGoals: Array.isArray(d.chosenGoals) ? d.chosenGoals.map(String) : [],
      importantSituations: Array.isArray(d.importantSituations)
        ? d.importantSituations.map(String)
        : [],
      completedCheckIn: Boolean(d.completedCheckIn),
      selectedToolId: String(d.selectedToolId || "P01"),
      developmentFixtureEnabled: Boolean(d.developmentFixtureEnabled),
      preferredLanguage: d.preferredLanguage === "hi" ? "hi" : "en",
      membershipTier:
        d.membershipTier === "cohort_preview" ? "cohort_preview" : "free_preview",
      membershipStatus:
        d.membershipStatus === "active_cohort"
          ? "active_cohort"
          : d.membershipStatus === "preview_pending"
            ? "preview_pending"
            : "active_preview",
      onboardingSeen: Boolean(d.onboardingSeen),
    };
  }

  const payload = buildLearnerProfileCreatePayload({
    uid,
    displayName: fallbackDisplayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, payload);

  return {
    userId: uid,
    displayName: String(payload.displayName),
    chosenGoals: [],
    importantSituations: [],
    completedCheckIn: false,
    selectedToolId: "P01",
    developmentFixtureEnabled: false,
    preferredLanguage: "en",
    membershipTier: "free_preview",
    membershipStatus: "active_preview",
    onboardingSeen: false,
  };
}

export async function updateLearnerProfileFields(
  uid: string,
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
  >
): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const ref = doc(db, FIRESTORE_COLLECTIONS.users, uid);
  const payload = buildLearnerProfileUpdatePayload(fields, serverTimestamp());
  await updateDoc(ref, payload);
}

export async function loadLearnerContext(uid: string): Promise<{
  memories: CoachMemoryItem[];
  attempts: SpeechAttempt[];
  events: SpeechEvent[];
  p01Progress: LessonProgress | null;
  p01Completed: boolean;
  serverEntitlementTier: "free_preview" | "cohort_preview";
  monthlyLiveAiCalls: number;
}> {
  const db = getNamedFirestore();
  if (!db) {
    return {
      memories: [],
      attempts: [],
      events: [],
      p01Progress: null,
      p01Completed: false,
      serverEntitlementTier: "free_preview",
      monthlyLiveAiCalls: 0,
    };
  }

  const periodKey = currentUtcPeriodKey();
  const [memSnap, attSnap, evtSnap, p01Snap, entSnap, counterSnap] = await Promise.all([
    getDocs(collection(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.memories)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.attempts)),
    getDocs(collection(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.speechEvents)),
    getDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.lessonProgress, "P01")),
    getDoc(
      doc(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.entitlements, "current")
    ).catch(() => null),
    getDoc(
      doc(
        db,
        FIRESTORE_COLLECTIONS.users,
        uid,
        FIRESTORE_COLLECTIONS.allowanceCounters,
        periodKey
      )
    ).catch(() => null),
  ]);

  const memories: CoachMemoryItem[] = memSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        userId: String(x.userId || uid),
        category: x.category || "observation",
        fact: String(x.fact || ""),
        sourceKind: x.sourceKind || "user_report",
        sourceReference: String(x.sourceReference || "web_test"),
        _sortTime: timestampToIso(x.updatedAt || x.createdAt),
      };
    })
    .sort((a, b) => b._sortTime.localeCompare(a._sortTime))
    .map(({ _sortTime, ...rest }) => {
      void _sortTime;
      return rest;
    });

  const attempts: SpeechAttempt[] = attSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        userId: String(x.userId || uid),
        sourceContext: x.sourceContext || "check_in_spontaneous",
        activityOrSectionId: String(x.activityOrSectionId || ""),
        promptText: String(x.promptText || ""),
        durationSeconds: Number(x.durationSeconds || 0),
        hasLocalAudio: Boolean(x.hasLocalAudio),
        analysisStatus: x.analysisStatus || "not_requested",
        analysisProvider: x.analysisProvider,
        analysisModel: x.analysisModel,
        adapterVersion: x.adapterVersion,
        disfluentTranscript: x.disfluentTranscript ?? null,
        summaryObservation: x.summaryObservation ?? null,
        analysisError: x.analysisError ?? null,
        selfReportEffort: typeof x.selfReportEffort === "number" ? x.selfReportEffort : null,
        selfReportAvoidanceNote: x.selfReportAvoidanceNote ?? null,
        createdAtIso: timestampToIso(x.createdAt),
      };
    })
    .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));

  const events: SpeechEvent[] = evtSnap.docs
    .map((d) => {
      const x = d.data();
      return {
        id: d.id,
        userId: String(x.userId || uid),
        attemptId: String(x.attemptId || ""),
        startSeconds: Number(x.startSeconds || 0),
        endSeconds: Number(x.endSeconds || 0.1),
        eventType: x.eventType || "other_uncertain",
        wordOrSound: x.wordOrSound ?? null,
        tentativeObservation: String(x.tentativeObservation || ""),
        sourceKind: x.sourceKind || "ai_observed",
        reviewState: x.reviewState || "unreviewed",
        correctedLabel: x.correctedLabel ?? null,
        correctionNote: x.correctionNote ?? null,
      };
    })
    .sort((a, b) => a.startSeconds - b.startSeconds);

  let p01Progress: LessonProgress | null = null;
  if (p01Snap.exists()) {
    const p = p01Snap.data();
    p01Progress = {
      userId: String(p.userId || uid),
      toolId: String(p.toolId || "P01"),
      currentStepIndex: Number(p.currentStepIndex || 0),
      completedSteps: Array.isArray(p.completedSteps) ? p.completedSteps.map(String) : [],
      skippedSteps: Array.isArray(p.skippedSteps) ? p.skippedSteps.map(String) : [],
      understandingChoiceId: p.understandingChoiceId ? String(p.understandingChoiceId) : null,
      reviewObservationChoice: p.reviewObservationChoice
        ? String(p.reviewObservationChoice)
        : null,
      sessionCompleted: Boolean(p.sessionCompleted),
    };
  }

  const serverEntitlementTier =
    entSnap &&
    entSnap.exists() &&
    entSnap.data()?.membershipTier === "cohort_preview" &&
    entSnap.data()?.membershipStatus === "active_cohort"
      ? "cohort_preview"
      : "free_preview";

  const monthlyLiveAiCalls =
    counterSnap && counterSnap.exists()
      ? Number(counterSnap.data()?.liveAiCalls || 0)
      : 0;

  return {
    memories,
    attempts,
    events,
    p01Progress,
    p01Completed: Boolean(p01Progress?.sessionCompleted),
    serverEntitlementTier,
    monthlyLiveAiCalls,
  };
}

export async function persistSpeechAttempt(attempt: SpeechAttempt): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const safeId = sanitizeFirestoreId(attempt.id, "att");
  const ref = doc(db, FIRESTORE_COLLECTIONS.users, attempt.userId, FIRESTORE_COLLECTIONS.attempts, safeId);
  const payload = buildSpeechAttemptCreatePayload(attempt, serverTimestamp(), serverTimestamp());
  await setDoc(ref, payload);
}

export async function updateSpeechAttemptFields(
  uid: string,
  attemptId: string,
  fields: SpeechAttemptUpdateInput
): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const safeId = sanitizeFirestoreId(attemptId, "att");
  const payload = buildSpeechAttemptUpdatePayload(fields, serverTimestamp(), deleteField());
  await updateDoc(
    doc(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.attempts, safeId),
    payload
  );
}

export async function persistSpeechEvent(evt: SpeechEvent): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const safeId = sanitizeFirestoreId(evt.id, "evt");
  const payload = buildSpeechEventCreatePayload(evt, serverTimestamp(), serverTimestamp());
  await setDoc(
    doc(db, FIRESTORE_COLLECTIONS.users, evt.userId, FIRESTORE_COLLECTIONS.speechEvents, safeId),
    payload
  );
}

export async function replaceSpeechEventsForAttempt(
  uid: string,
  eventIdsToDelete: string[],
  eventsToInsert: SpeechEvent[]
): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  if (eventIdsToDelete.length === 0 && eventsToInsert.length === 0) return;

  const batch = writeBatch(db);
  for (const staleId of eventIdsToDelete) {
    const safeId = sanitizeFirestoreId(staleId, "evt");
    batch.delete(
      doc(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.speechEvents, safeId)
    );
  }
  for (const evt of eventsToInsert) {
    const safeId = sanitizeFirestoreId(evt.id, "evt");
    const payload = buildSpeechEventCreatePayload(
      { ...evt, userId: uid },
      serverTimestamp(),
      serverTimestamp()
    );
    batch.set(
      doc(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.speechEvents, safeId),
      payload
    );
  }
  await batch.commit();
}

export async function updateSpeechEventReviewInFirestore(
  uid: string,
  eventId: string,
  reviewState: SpeechEventReviewState,
  eventType?: SpeechEventType,
  correctedLabel?: string,
  correctionNote?: string
): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const safeId = sanitizeFirestoreId(eventId, "evt");
  const payload = buildSpeechEventUpdatePayload(
    { reviewState, eventType, correctedLabel, correctionNote },
    serverTimestamp()
  );
  await updateDoc(
    doc(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.speechEvents, safeId),
    payload
  );
}

export async function persistCoachMemory(item: CoachMemoryItem): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const safeId = sanitizeFirestoreId(item.id, "mem");
  const ref = doc(db, FIRESTORE_COLLECTIONS.users, item.userId, FIRESTORE_COLLECTIONS.memories, safeId);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const updatePayload = buildCoachMemoryUpdatePayload(item, serverTimestamp());
    if (!updatePayload) return;
    await updateDoc(ref, updatePayload);
  } else {
    const createPayload = buildCoachMemoryCreatePayload(
      item,
      serverTimestamp(),
      serverTimestamp()
    );
    if (!createPayload) return;
    await setDoc(ref, createPayload);
  }
}

export async function deleteCoachMemory(uid: string, memoryId: string): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const safeId = sanitizeFirestoreId(memoryId, "mem");
  await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.memories, safeId));
}

export async function persistP01Progress(
  uid: string,
  beatIndex: number,
  completedSteps: string[],
  skippedSteps: string[],
  sessionCompleted: boolean,
  reviewObservationChoice?: string | null,
  understandingChoiceId?: string | null
): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const ref = doc(db, FIRESTORE_COLLECTIONS.users, uid, FIRESTORE_COLLECTIONS.lessonProgress, "P01");
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const payload = buildLessonProgressUpdatePayload(
      {
        currentStepIndex: beatIndex,
        completedSteps,
        skippedSteps,
        sessionCompleted,
        reviewObservationChoice,
        understandingChoiceId,
      },
      serverTimestamp()
    );
    await updateDoc(ref, payload);
  } else {
    const payload = buildLessonProgressCreatePayload(
      {
        userId: uid,
        toolId: "P01",
        currentStepIndex: beatIndex,
        completedSteps,
        skippedSteps,
        sessionCompleted,
        reviewObservationChoice,
        understandingChoiceId,
      },
      serverTimestamp(),
      serverTimestamp()
    );
    await setDoc(ref, payload);
  }
}

export async function persistTransferPlan(plan: TransferPlan): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const safeId = sanitizeFirestoreId(plan.id, "plan");
  const ref = doc(
    db,
    FIRESTORE_COLLECTIONS.users,
    plan.userId,
    FIRESTORE_COLLECTIONS.transferPlans,
    safeId
  );
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const updatePayload = buildTransferPlanUpdatePayload(plan, serverTimestamp());
    if (!updatePayload) return;
    await updateDoc(ref, updatePayload);
  } else {
    const createPayload = buildTransferPlanCreatePayload(
      plan,
      serverTimestamp(),
      serverTimestamp()
    );
    if (!createPayload) return;
    await setDoc(ref, createPayload);
  }
}
