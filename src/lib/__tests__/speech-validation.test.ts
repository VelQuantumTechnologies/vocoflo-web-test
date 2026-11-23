import { describe, expect, it } from "vitest";
import {
  mergeSpeechEventsPreservingReviews,
  parseSpeechAnalysisResponse,
  validateSpeechEvents,
} from "@/lib/speech/validation";
import type { SpeechEvent } from "@/types/vocoflo";

describe("speech validation", () => {
  it("drops invalid NaN, negative, inverted, and out-of-bounds timestamps", () => {
    const { accepted, rejectedCount } = validateSpeechEvents(
      [
        { startSeconds: -0.5, endSeconds: 0.4, type: "repetition" },
        { startSeconds: 2.0, endSeconds: 1.5, type: "pause" },
        { startSeconds: 1.0, endSeconds: 12.0, type: "prolongation" },
        { startSeconds: Number.NaN, endSeconds: 2.0, type: "pause" },
        {
          startSeconds: 1.2,
          endSeconds: 1.9,
          type: "repetition",
          wordOrSound: "m-morning",
          tentativeObservation: "Brief syllable repetition",
        },
      ],
      5.0
    );

    expect(rejectedCount).toBe(4);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].wordOrSound).toBe("m-morning");
    expect(accepted[0].eventType).toBe("repetition");
  });

  it("returns empty events when speechDetected is false", () => {
    const res = parseSpeechAnalysisResponse(
      JSON.stringify({
        speechDetected: false,
        disfluentTranscript: null,
        summaryObservation: "No clear speech was audible in this recording.",
        events: [{ startSeconds: 0.2, endSeconds: 0.8, type: "pause" }],
      }),
      3.0
    );

    expect(res.speechDetected).toBe(false);
    expect(res.disfluentTranscript).toBeNull();
    expect(res.events).toHaveLength(0);
  });

  it("preserves confirmed/corrected/dismissed and user_reported events when re-analyzing", () => {
    const existing: SpeechEvent[] = [
      {
        id: "ev_confirmed",
        userId: "u1",
        attemptId: "att1",
        startSeconds: 1.0,
        endSeconds: 1.5,
        eventType: "repetition",
        tentativeObservation: "Confirmed",
        sourceKind: "ai_observed",
        reviewState: "confirmed",
      },
      {
        id: "ev_stale",
        userId: "u1",
        attemptId: "att1",
        startSeconds: 3.0,
        endSeconds: 3.5,
        eventType: "pause",
        tentativeObservation: "Old unreviewed",
        sourceKind: "ai_observed",
        reviewState: "unreviewed",
      },
      {
        id: "ev_user",
        userId: "u1",
        attemptId: "att1",
        startSeconds: 4.0,
        endSeconds: 4.5,
        eventType: "user_reported_block",
        tentativeObservation: "User felt a hold",
        sourceKind: "user_reported",
        reviewState: "confirmed",
      },
    ];

    const incoming: SpeechEvent[] = [
      {
        id: "ev_new_dup",
        userId: "u1",
        attemptId: "att1",
        startSeconds: 1.1,
        endSeconds: 1.4,
        eventType: "repetition",
        tentativeObservation: "Near duplicate of confirmed",
        sourceKind: "ai_observed",
        reviewState: "unreviewed",
      },
      {
        id: "ev_new_fresh",
        userId: "u1",
        attemptId: "att1",
        startSeconds: 2.5,
        endSeconds: 2.8,
        eventType: "prolongation",
        tentativeObservation: "New moment",
        sourceKind: "ai_observed",
        reviewState: "unreviewed",
      },
    ];

    const merged = mergeSpeechEventsPreservingReviews(existing, incoming);
    expect(merged.eventIdsToDelete).toEqual(["ev_stale"]);
    expect(merged.eventsToInsert.map((e) => e.id)).toEqual(["ev_new_fresh"]);
  });
});
