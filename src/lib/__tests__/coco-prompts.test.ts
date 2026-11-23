import { describe, expect, it } from "vitest";
import {
  buildLessonQaPrompt,
  buildP01AttemptResponsePrompt,
  buildP01MirrorOpening,
  getP01SectionsForBeat,
  sanitizeCocoOutput,
} from "@/lib/ai/coco-prompts";

describe("coco prompt builders", () => {
  it("uses neutral P01 Beat 1 opening when no genuine Check-In memories exist", () => {
    const res = buildP01MirrorOpening({
      profile: null,
      memories: [],
      attempts: [],
      speechTermMode: "stammering",
    });

    expect(res.hasGenuineMemory).toBe(false);
    expect(res.groundedContextLabel).toBeNull();
    expect(res.text.toLowerCase()).toContain("stammering");
  });

  it("grounds P01 Beat 1 opening in saved Check-In situations & goals when present", () => {
    const res = buildP01MirrorOpening({
      profile: {
        userId: "u1",
        displayName: "Test",
        chosenGoals: ["Participate more in meetings"],
        importantSituations: ["Team standups"],
        completedCheckIn: true,
        selectedToolId: "P01",
        developmentFixtureEnabled: false,
        preferredLanguage: "en",
        membershipTier: "free_preview",
        membershipStatus: "active_preview",
        onboardingSeen: true,
      },
      memories: [],
      attempts: [],
      speechTermMode: "stuttering",
    });

    expect(res.hasGenuineMemory).toBe(true);
    expect(res.text).toContain("Team standups");
    expect(res.text).toContain("Participate more in meetings");
  });

  it("enforces Attempt 2 non-grading rule and scopes P01 sections per beat", () => {
    const a2Prompt = buildP01AttemptResponsePrompt({
      isAttemptTwo: true,
      learnerTranscriptOrText: "I love baking sourdough bread on weekends.",
      hasDirectAudioAttachment: false,
      speechTermMode: "stammering",
    });
    expect(a2Prompt).toContain("NEVER claim Attempt 2 is an \"improvement\"");

    const beat1Sections = getP01SectionsForBeat("p01_beat_1_mirror").map((s) => s.id);
    expect(beat1Sections).toEqual(["P01-01", "P01-02"]);
    expect(beat1Sections).not.toContain("P01-11");

    const qaPrompt = buildLessonQaPrompt(
      {
        checkInCompleted: true,
        currentStageLabel: "P01 Beat 1",
        completedStepTitles: ["Beat 1"],
        unreachedStepTitles: ["Beat 4", "Beat 5"],
        reachedSectionSummaries: getP01SectionsForBeat("p01_beat_1_mirror"),
        recentAttempts: [],
        speechEvents: [],
        sharedMemories: [],
        speechTermMode: "stammering",
      },
      "What comes in Beat 5?"
    );
    expect(qaPrompt).toContain("Unreached upcoming steps");
    expect(qaPrompt).toContain("Beat 4, Beat 5");
  });

  it("sanitizes leaked prefixes and metadata from Coco replies", () => {
    expect(sanitizeCocoOutput('Coco: "You are Coco.\nHello! Glad to hear that."')).toBe(
      "Hello! Glad to hear that."
    );
  });
});
