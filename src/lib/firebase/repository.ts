"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type {
  CoachMemoryItem,
  LearnerProfile,
  SpeechAttempt,
  SpeechEvent,
  SpeechEventReviewState,
  SpeechEventType,
  TransferPlan,
} from "@/types/vocoflo";
import { getNamedFirestore } from "./client";

export async function loadOrCreateLearnerProfile(
  uid: string,
  fallbackDisplayName: string
): Promise<LearnerProfile> {
  const db = getNamedFirestore();
  if (!db) {
    throw new Error("Firestore is not configured.");
  }

  const ref = doc(db, "users", uid);
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
        d.membershipStatus === "active_cohort" ? "active_cohort" : "active_preview",
      onboardingSeen: Boolean(d.onboardingSeen),
    };
  }

  const safeName = (fallbackDisplayName || "Learner").trim().slice(0, 100) || "Learner";
  const newProfile: LearnerProfile = {
    userId: uid,
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
  };

  await setDoc(ref, {
    ...newProfile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return newProfile;
}

export async function updateLearnerProfileFields(
  uid: string,
  fields: Partial<
    Pick<
      LearnerProfile,
      "displayName" | "chosenGoals" | "importantSituations" | "completedCheckIn" | "onboardingSeen"
    >
  >
): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const ref = doc(db, "users", uid);
  await updateDoc(ref, {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

export async function loadLearnerContext(uid: string): Promise<{
  memories: CoachMemoryItem[];
  attempts: SpeechAttempt[];
  events: SpeechEvent[];
  p01Completed: boolean;
}> {
  const db = getNamedFirestore();
  if (!db) {
    return { memories: [], attempts: [], events: [], p01Completed: false };
  }

  const [memSnap, attSnap, evtSnap, p01Snap] = await Promise.all([
    getDocs(collection(db, "users", uid, "memories")),
    getDocs(query(collection(db, "users", uid, "attempts"), orderBy("createdAt", "desc"))),
    getDocs(collection(db, "users", uid, "speech_events")),
    getDoc(doc(db, "users", uid, "lesson_progress", "P01")),
  ]);

  const memories: CoachMemoryItem[] = memSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      userId: String(x.userId || uid),
      category: x.category || "observation",
      fact: String(x.fact || ""),
      sourceKind: x.sourceKind || "user_report",
      sourceReference: String(x.sourceReference || "web_test"),
    };
  });

  const attempts: SpeechAttempt[] = attSnap.docs.map((d) => {
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
      createdAtIso: new Date().toISOString(),
    };
  });

  const events: SpeechEvent[] = evtSnap.docs.map((d) => {
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
  });

  const p01Completed = Boolean(p01Snap.exists() && p01Snap.data()?.sessionCompleted);

  return { memories, attempts, events, p01Completed };
}

export async function persistSpeechAttempt(attempt: SpeechAttempt): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const ref = doc(db, "users", attempt.userId, "attempts", attempt.id);
  await setDoc(ref, {
    userId: attempt.userId,
    sourceContext: attempt.sourceContext,
    activityOrSectionId: attempt.activityOrSectionId.slice(0, 64),
    promptText: attempt.promptText.slice(0, 1000),
    durationSeconds: Math.min(Math.max(attempt.durationSeconds, 0), 600),
    hasLocalAudio: attempt.hasLocalAudio,
    analysisStatus: attempt.analysisStatus,
    ...(attempt.analysisProvider ? { analysisProvider: attempt.analysisProvider.slice(0, 64) } : {}),
    ...(attempt.analysisModel ? { analysisModel: attempt.analysisModel.slice(0, 64) } : {}),
    ...(attempt.adapterVersion ? { adapterVersion: attempt.adapterVersion.slice(0, 32) } : {}),
    ...(attempt.disfluentTranscript
      ? { disfluentTranscript: attempt.disfluentTranscript.slice(0, 4000) }
      : {}),
    ...(attempt.summaryObservation
      ? { summaryObservation: attempt.summaryObservation.slice(0, 1000) }
      : {}),
    ...(attempt.analysisError ? { analysisError: attempt.analysisError.slice(0, 500) } : {}),
    ...(typeof attempt.selfReportEffort === "number"
      ? { selfReportEffort: Math.min(5, Math.max(1, Math.round(attempt.selfReportEffort))) }
      : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateSpeechAttemptFields(
  uid: string,
  attemptId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  await updateDoc(doc(db, "users", uid, "attempts", attemptId), {
    ...fields,
    updatedAt: serverTimestamp(),
  });
}

export async function persistSpeechEvent(evt: SpeechEvent): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  await setDoc(doc(db, "users", evt.userId, "speech_events", evt.id), {
    userId: evt.userId,
    attemptId: evt.attemptId.slice(0, 128),
    startSeconds: evt.startSeconds,
    endSeconds: evt.endSeconds,
    eventType: evt.eventType,
    ...(evt.wordOrSound ? { wordOrSound: evt.wordOrSound.slice(0, 128) } : {}),
    tentativeObservation: evt.tentativeObservation.slice(0, 500),
    sourceKind: evt.sourceKind,
    reviewState: evt.reviewState,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
  await updateDoc(doc(db, "users", uid, "speech_events", eventId), {
    reviewState,
    ...(eventType ? { eventType } : {}),
    ...(correctedLabel ? { correctedLabel: correctedLabel.slice(0, 128) } : {}),
    ...(correctionNote ? { correctionNote: correctionNote.slice(0, 500) } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function persistCoachMemory(item: CoachMemoryItem): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  await setDoc(doc(db, "users", item.userId, "memories", item.id), {
    userId: item.userId,
    category: item.category,
    fact: item.fact.slice(0, 500),
    sourceKind: item.sourceKind,
    sourceReference: item.sourceReference.slice(0, 128),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCoachMemory(uid: string, memoryId: string): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  await deleteDoc(doc(db, "users", uid, "memories", memoryId));
}

export async function persistP01Progress(
  uid: string,
  beatIndex: number,
  completedSteps: string[],
  skippedSteps: string[],
  sessionCompleted: boolean,
  reviewObservationChoice?: string | null
): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  const ref = doc(db, "users", uid, "lesson_progress", "P01");
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, {
      currentStepIndex: beatIndex,
      completedSteps: completedSteps.slice(0, 30),
      skippedSteps: skippedSteps.slice(0, 30),
      sessionCompleted,
      ...(reviewObservationChoice
        ? { reviewObservationChoice: reviewObservationChoice.slice(0, 64) }
        : {}),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      userId: uid,
      toolId: "P01",
      currentStepIndex: beatIndex,
      completedSteps: completedSteps.slice(0, 30),
      skippedSteps: skippedSteps.slice(0, 30),
      sessionCompleted,
      ...(reviewObservationChoice
        ? { reviewObservationChoice: reviewObservationChoice.slice(0, 64) }
        : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function persistTransferPlan(plan: TransferPlan): Promise<void> {
  const db = getNamedFirestore();
  if (!db) return;
  await setDoc(doc(db, "users", plan.userId, "transfer_plans", plan.id), {
    userId: plan.userId,
    toolId: plan.toolId,
    situation: plan.situation.slice(0, 300),
    smallAction: plan.smallAction.slice(0, 300),
    ...(plan.observationToNotice
      ? { observationToNotice: plan.observationToNotice.slice(0, 300) }
      : {}),
    planStatus: plan.planStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
