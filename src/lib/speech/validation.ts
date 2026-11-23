import type { SpeechEvent, SpeechEventType } from "@/types/vocoflo";

export interface RawSpeechEventPayload {
  startSeconds?: unknown;
  endSeconds?: unknown;
  type?: unknown;
  wordOrSound?: unknown;
  tentativeObservation?: unknown;
}

export interface RawSpeechAnalysisPayload {
  speechDetected?: unknown;
  durationSeconds?: unknown;
  disfluentTranscript?: unknown;
  summaryObservation?: unknown;
  events?: unknown;
}

export interface ValidatedSpeechAnalysis {
  speechDetected: boolean;
  disfluentTranscript: string | null;
  summaryObservation: string;
  events: Array<{
    startSeconds: number;
    endSeconds: number;
    eventType: SpeechEventType;
    wordOrSound: string | null;
    tentativeObservation: string;
  }>;
  rejectedCount: number;
}

const ALLOWED_TYPES = new Set<SpeechEventType>([
  "repetition",
  "prolongation",
  "pause",
  "other_uncertain",
]);

export function validateSpeechEvents(
  rawEvents: RawSpeechEventPayload[],
  recordingDurationSeconds: number
): { accepted: ValidatedSpeechAnalysis["events"]; rejectedCount: number } {
  if (!Number.isFinite(recordingDurationSeconds) || recordingDurationSeconds <= 0) {
    return { accepted: [], rejectedCount: rawEvents.length };
  }

  const accepted: ValidatedSpeechAnalysis["events"] = [];
  let rejectedCount = 0;

  for (const raw of rawEvents) {
    const start = typeof raw.startSeconds === "number" ? raw.startSeconds : Number.NaN;
    const end = typeof raw.endSeconds === "number" ? raw.endSeconds : Number.NaN;
    const validTimes =
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      start < end &&
      end <= recordingDurationSeconds + 0.05;

    if (!validTimes) {
      rejectedCount += 1;
      continue;
    }

    const rawType = typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "other_uncertain";
    const eventType: SpeechEventType = ALLOWED_TYPES.has(rawType as SpeechEventType)
      ? (rawType as SpeechEventType)
      : "other_uncertain";

    const wordOrSound =
      typeof raw.wordOrSound === "string" && raw.wordOrSound.trim().length > 0
        ? raw.wordOrSound.trim().slice(0, 128)
        : null;

    const tentativeObservation =
      typeof raw.tentativeObservation === "string" && raw.tentativeObservation.trim().length > 0
        ? raw.tentativeObservation.trim().slice(0, 500)
        : "Audible moment noted for learner review.";

    accepted.push({
      startSeconds: Number(start.toFixed(2)),
      endSeconds: Number(Math.min(end, recordingDurationSeconds).toFixed(2)),
      eventType,
      wordOrSound,
      tentativeObservation,
    });
  }

  accepted.sort((a, b) => a.startSeconds - b.startSeconds);
  return { accepted, rejectedCount };
}

export function parseSpeechAnalysisResponse(
  rawJsonText: string,
  recordingDurationSeconds: number
): ValidatedSpeechAnalysis {
  const parsed = JSON.parse(rawJsonText) as RawSpeechAnalysisPayload;
  const speechDetected = typeof parsed.speechDetected === "boolean" ? parsed.speechDetected : true;
  const disfluentTranscript =
    typeof parsed.disfluentTranscript === "string" && parsed.disfluentTranscript.trim().length > 0
      ? parsed.disfluentTranscript.trim()
      : null;
  const summaryObservation =
    typeof parsed.summaryObservation === "string" && parsed.summaryObservation.trim().length > 0
      ? parsed.summaryObservation.trim()
      : speechDetected
        ? "Audio reviewed for optional learner inspection."
        : "No clear speech was audible in this recording.";

  const rawEvents = Array.isArray(parsed.events)
    ? (parsed.events as RawSpeechEventPayload[])
    : [];
  const { accepted, rejectedCount } = validateSpeechEvents(rawEvents, recordingDurationSeconds);

  return {
    speechDetected,
    disfluentTranscript,
    summaryObservation,
    events: speechDetected ? accepted : [],
    rejectedCount,
  };
}

export function mergeSpeechEventsPreservingReviews(
  existingEvents: SpeechEvent[],
  incomingEvents: SpeechEvent[]
): { eventIdsToDelete: string[]; eventsToInsert: SpeechEvent[] } {
  const TIME_TOLERANCE = 0.35;
  const preserved = existingEvents.filter(
    (e) => e.reviewState !== "unreviewed" || e.sourceKind === "user_reported"
  );
  const staleToDelete = existingEvents.filter(
    (e) => e.reviewState === "unreviewed" && e.sourceKind !== "user_reported"
  );

  const isNearDup = (a: SpeechEvent, b: SpeechEvent) => {
    const overlap =
      a.startSeconds <= b.endSeconds + TIME_TOLERANCE &&
      b.startSeconds <= a.endSeconds + TIME_TOLERANCE;
    const closeStart = Math.abs(a.startSeconds - b.startSeconds) <= TIME_TOLERANCE;
    return overlap || closeStart;
  };

  const eventsToInsert: SpeechEvent[] = [];
  for (const candidate of incomingEvents) {
    if (preserved.some((p) => isNearDup(p, candidate))) continue;
    if (eventsToInsert.some((a) => isNearDup(a, candidate))) continue;
    eventsToInsert.push(candidate);
  }

  return {
    eventIdsToDelete: staleToDelete.map((e) => e.id).filter(Boolean),
    eventsToInsert,
  };
}
