import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCheckInDebriefPrompt,
  buildCheckInListeningPrompt,
  buildLessonQaPrompt,
  buildP01AttemptResponsePrompt,
  buildP01FollowUpClosingPrompt,
  buildP01LabelReflectionPrompt,
  buildP01MirrorOpening,
  buildP01MirrorResponsePrompt,
  buildPartnerReplyPrompt,
} from "@/lib/ai/coco-prompts";
import { GUEST_REVIEW_USER_ID, isGuestReviewModeEnabled } from "@/lib/guest/config";
import { createGuestProfile } from "@/lib/guest/simulator";
import { parseSpeechAnalysisResponse } from "@/lib/speech/validation";

const fetchSpy = vi.fn();

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseClientAuth: () => ({ currentUser: null }),
  getWebAppCheckToken: vi.fn(async () => null),
}));

describe("Guest Review Mode", () => {
  const originalEnv = process.env.NEXT_PUBLIC_ENABLE_GUEST_REVIEW_MODE;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
    delete process.env.NEXT_PUBLIC_ENABLE_GUEST_REVIEW_MODE;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLE_GUEST_REVIEW_MODE;
    } else {
      process.env.NEXT_PUBLIC_ENABLE_GUEST_REVIEW_MODE = originalEnv;
    }
  });

  it("supports an easy configuration flag to enable or disable guest mode", () => {
    expect(isGuestReviewModeEnabled(undefined)).toBe(true);
    expect(isGuestReviewModeEnabled("true")).toBe(true);
    expect(isGuestReviewModeEnabled("1")).toBe(true);
    expect(isGuestReviewModeEnabled("false")).toBe(false);
    expect(isGuestReviewModeEnabled("0")).toBe(false);
    expect(isGuestReviewModeEnabled("off")).toBe(false);
    expect(isGuestReviewModeEnabled("disabled")).toBe(false);
  });

  it("blocks unauthenticated calls to the real AI gateway and blocks guest mode when disabled", async () => {
    const { callTrustedAiGateway } = await import("@/lib/ai/gateway-client");

    // Without guestMode, signed-out user is strictly rejected without calling fetch
    const unauthRes = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "att_test",
      payload: { prompt: "Hello" },
      guestMode: false,
    });
    expect(unauthRes.ok).toBe(false);
    expect(unauthRes.httpStatus).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();

    // When config flag disables guest mode, guestMode: true is blocked too
    process.env.NEXT_PUBLIC_ENABLE_GUEST_REVIEW_MODE = "false";
    const disabledRes = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "att_test",
      payload: { prompt: "Hello" },
      guestMode: true,
    });
    expect(disabledRes.ok).toBe(false);
    expect(disabledRes.httpStatus).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("creates an isolated local guest profile without accessing real accounts", () => {
    const profile = createGuestProfile();
    expect(profile.userId).toBe(GUEST_REVIEW_USER_ID);
    expect(profile.displayName).toBe("Guest Reviewer");
    expect(profile.developmentFixtureEnabled).toBe(true);
    expect(profile.chosenGoals).toEqual([]);
    expect(profile.importantSituations).toEqual([]);
    expect(profile.completedCheckIn).toBe(false);
  });

  it("simulates the full Check-In -> Acoustic Mirror -> P01 -> Ask Coco journey with zero network calls", async () => {
    const { callTrustedAiGateway } = await import("@/lib/ai/gateway-client");

    // 1. Check-In Sample 1 speech analysis (simulated)
    const s1Analysis = await callTrustedAiGateway({
      action: "speech_analysis",
      purpose: "assessment_analysis",
      attemptOrSessionId: "att_ci_s1_guest",
      guestMode: true,
      payload: {
        audioBase64: "",
        mimeType: "audio/webm",
        durationSeconds: 8.5,
        prompt: "Tell me a little about yourself",
      },
    });
    expect(s1Analysis.ok).toBe(true);
    expect(s1Analysis.model).toContain("simulated");
    const parsedS1 = parseSpeechAnalysisResponse(s1Analysis.text, 8.5);
    expect(parsedS1.speechDetected).toBe(true);
    expect(parsedS1.summaryObservation).toContain("[Simulated Guest Observation]");
    expect(parsedS1.events.length).toBeGreaterThan(0);

    // 2. Check-In Sample 3 reading Coco response
    const s3Reply = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "att_ci_s3_guest",
      guestMode: true,
      payload: {
        prompt: buildCheckInListeningPrompt({
          sampleIndex: 2,
          sampleTitle: "Sample 3 of 4 • Short Reading Sample",
          questionAsked: "Read aloud",
          learnerTranscript: parsedS1.disfluentTranscript,
          isReadingSample: true,
          summaryObservation: parsedS1.summaryObservation,
          speechObservations: [],
          speechTermMode: "stammering",
        }),
      },
    });
    expect(s3Reply.ok).toBe(true);
    expect(s3Reply.text).toContain("[Simulated Coco — Guest Mode]");

    // 3. Check-In Sample 4 partner roleplay (open + closing turn 6)
    const convOpen = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "responsive_roleplay",
      attemptOrSessionId: "att_ci_conv_t1_guest",
      guestMode: true,
      payload: {
        prompt: buildPartnerReplyPrompt({
          scenario: "Catch-up chat",
          partnerRole: "Colleague",
          communicationPurpose: "Catch up",
          history: [],
          learnerTextInput: "Busy week wrapping up a project",
          hasAudio: false,
          isClosingTurn: false,
        }),
      },
    });
    expect(convOpen.ok).toBe(true);
    expect(convOpen.text).toContain("[Simulated Partner — Guest Mode]");

    const convClose = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "responsive_roleplay",
      attemptOrSessionId: "att_ci_conv_t6_guest",
      guestMode: true,
      payload: {
        prompt: buildPartnerReplyPrompt({
          scenario: "Catch-up chat",
          partnerRole: "Colleague",
          communicationPurpose: "Catch up",
          history: [],
          learnerTextInput: "Talk soon!",
          hasAudio: false,
          isClosingTurn: true,
        }),
      },
    });
    expect(convClose.ok).toBe(true);
    expect(convClose.text).toContain("[Simulated Partner — Guest Mode]");
    expect(convClose.text.toLowerCase()).toContain("talk soon");

    // 4. Check-In Debrief grounded in guest context
    const debrief = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "check_in_debrief",
      guestMode: true,
      payload: {
        prompt: buildCheckInDebriefPrompt({
          attempts: [],
          events: [],
          goals: ["Speak with less tension"],
          situations: ["Team standups"],
          shiftNote: "Slightly lighter",
          speechTermMode: "stammering",
        }),
      },
    });
    expect(debrief.ok).toBe(true);
    expect(debrief.text).toContain("[Simulated Coco — Guest Mode]");
    expect(debrief.text.toLowerCase()).toContain("team standups");

    // 5. P01 Beat 1 Mirror opening + reply
    const p01Opening = buildP01MirrorOpening({
      profile: {
        ...createGuestProfile(),
        chosenGoals: ["Speak with less tension"],
        importantSituations: ["Team standups"],
        completedCheckIn: true,
      },
      memories: [],
      attempts: [],
      speechTermMode: "stammering",
    });
    expect(p01Opening.hasGenuineMemory).toBe(true);

    const beat1Reply = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "p01_beat_1_mirror",
      guestMode: true,
      payload: {
        prompt: buildP01MirrorResponsePrompt({
          choice: "often",
          groundedContextLabel: p01Opening.groundedContextLabel,
          speechTermMode: "stammering",
        }),
      },
    });
    expect(beat1Reply.ok).toBe(true);
    expect(beat1Reply.text).toContain("[Simulated Coco — Guest Mode]");

    // 6. P01 Beat 2, Beat 3 label reflection, Beat 4 Attempt 2 & follow-up
    const beat2Reply = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "att_p01_a1_guest",
      guestMode: true,
      payload: {
        prompt: buildP01AttemptResponsePrompt({
          isAttemptTwo: false,
          learnerTranscriptOrText: "I enjoy cooking dinner on weekends.",
          hasDirectAudioAttachment: false,
          speechTermMode: "stammering",
        }),
      },
    });
    expect(beat2Reply.text).toContain("[Simulated Coco — Guest Mode]");

    const beat3Label = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "p01_beat_3_label",
      guestMode: true,
      payload: {
        prompt: buildP01LabelReflectionPrompt("I sound unprepared", "stammering"),
      },
    });
    expect(beat3Label.text).toContain("[Simulated Coco — Guest Mode]");

    const beat4Reply = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "att_p01_a2_guest",
      guestMode: true,
      payload: {
        prompt: buildP01AttemptResponsePrompt({
          isAttemptTwo: true,
          learnerTranscriptOrText: "Making fresh pasta with garlic and basil.",
          hasDirectAudioAttachment: false,
          speechTermMode: "stammering",
        }),
      },
    });
    expect(beat4Reply.text).toContain("[Simulated Coco — Guest Mode]");

    const beat4FollowUp = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coaching_debrief",
      attemptOrSessionId: "p01_beat_4_followup",
      guestMode: true,
      payload: {
        prompt: buildP01FollowUpClosingPrompt(
          beat4Reply.text,
          "I pictured the kitchen table",
          "stammering"
        ),
      },
    });
    expect(beat4FollowUp.text).toContain("[Simulated Coco — Guest Mode]");

    // 7. Ask Coco + TTS guard
    const qaReply = await callTrustedAiGateway({
      action: "coach_generate",
      purpose: "coco_qa",
      attemptOrSessionId: "qa_p01",
      guestMode: true,
      payload: {
        prompt: buildLessonQaPrompt(
          {
            checkInCompleted: true,
            currentStageLabel: "P01 Beat 3",
            completedStepTitles: ["Beat 1", "Beat 2"],
            unreachedStepTitles: ["Beat 4", "Beat 5"],
            reachedSectionSummaries: [],
            recentAttempts: [],
            speechEvents: [],
            sharedMemories: [],
            speechTermMode: "stammering",
          },
          "Why does P01 separate an event from a verdict?"
        ),
      },
    });
    expect(qaReply.text).toContain("[Simulated Coco — Guest Mode]");

    const ttsBlocked = await callTrustedAiGateway({
      action: "tts_synthesize",
      purpose: "coco_tts",
      attemptOrSessionId: "web_tts",
      guestMode: true,
      payload: { role: "COCO", text: "Hello" },
    });
    expect(ttsBlocked.ok).toBe(false);

    // Zero fetch calls across the entire guest journey
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
