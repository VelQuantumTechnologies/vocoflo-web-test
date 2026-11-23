import { describe, expect, it } from "vitest";
import {
  buildLessonQaPrompt,
  buildP01AttemptResponsePrompt,
  buildP01MirrorOpening,
  formatConversationHistory,
  getP01SectionsForBeat,
  humanizeGoalPhrase,
  humanizeSituationPhrase,
  isVerifiedSpokenAttempt,
  P01_BEAT_2_SPEAK_FIRST_NARRATION,
  P01_BEAT_3_CONCISE_TEACHING,
  sanitizeCocoOutput,
} from "@/lib/ai/coco-prompts";
import { classifyMicrophoneError } from "@/lib/audio/useMicRecorder";
import { simulateGuestGatewayCall } from "@/lib/guest/simulator";
import type { ConversationTurn, SpeechAttempt } from "@/types/vocoflo";

describe("coco prompt builders & P01 quality pass regression suite", () => {
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

  it("grounds P01 Beat 1 opening in saved Check-In situations & goals using natural humanized phrasing", () => {
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
    expect(res.text).toContain("team standups");
    expect(res.text).toContain("participating more in meetings");
    // Does not paste raw Title-Case database labels inside a conversational sentence
    expect(res.text).not.toContain("in Team standups");
    expect(res.text).not.toContain("toward Participate more in meetings");
  });

  it("humanizes common Check-In situation and goal phrases into conversational English", () => {
    expect(humanizeSituationPhrase("Ordering at cafes / shops")).toBe(
      "ordering at cafes or shops"
    );
    expect(humanizeSituationPhrase("Introducing myself")).toBe(
      "introducing yourself"
    );
    expect(humanizeGoalPhrase("Speak with less tension and self-monitoring")).toBe(
      "speaking with less tension and self-monitoring"
    );
    expect(
      humanizeGoalPhrase("Stay with my message even if a word catches")
    ).toBe("staying with your message even if a word catches");
  });

  it("enforces Attempt 2 non-grading rule and strictly scopes P01 sections per beat (baseline speaking before teaching)", () => {
    const a2Prompt = buildP01AttemptResponsePrompt({
      isAttemptTwo: true,
      learnerTranscriptOrText: "I love baking sourdough bread on weekends.",
      hasDirectAudioAttachment: false,
      speechTermMode: "stammering",
      participationMode: "recorded",
    });
    expect(a2Prompt).toContain('NEVER claim Attempt 2 is an "improvement"');

    // Beat 1: only P01-01 (no Event-vs-Verdict teaching before Beat 2 baseline speaking)
    const beat1Sections = getP01SectionsForBeat("p01_beat_1_mirror");
    expect(beat1Sections.map((s) => s.id)).toEqual(["P01-01"]);
    expect(beat1Sections[0].narration).not.toContain("separate a particular event from a verdict");

    // Beat 2: cumulative reached sections P01-01 + P01-07 (still no P01-02..P01-06 Event-vs-Verdict teaching)
    const beat2Sections = getP01SectionsForBeat("p01_beat_2_speak_first");
    expect(beat2Sections.map((s) => s.id)).toEqual(["P01-01", "P01-07"]);
    expect(beat2Sections.map((s) => s.id)).not.toContain("P01-02");
    expect(beat2Sections.map((s) => s.id)).not.toContain("P01-08");

    // Beat 3: cumulative reached sections include Event-vs-Verdict (P01-02..P01-06) without leaking Beat 4 (P01-08) or Beat 5 (P01-11)
    const beat3Ids = getP01SectionsForBeat("p01_beat_3_one_idea").map((s) => s.id);
    expect(beat3Ids).toContain("P01-02");
    expect(beat3Ids).toContain("P01-06");
    expect(beat3Ids).not.toContain("P01-08");
    expect(beat3Ids).not.toContain("P01-11");

    // Beat 2 narration invites baseline speaking first without referring to unreached Beat 3 ideas; Beat 3 preserves the meeting introduction example
    expect(P01_BEAT_2_SPEAK_FIRST_NARRATION).toContain("Let us try a small speaking experience.");
    expect(P01_BEAT_2_SPEAK_FIRST_NARRATION).not.toContain("Imagine we tried that");
    expect(P01_BEAT_3_CONCISE_TEACHING).toContain("Imagine introducing yourself at a meeting");
    expect(P01_BEAT_3_CONCISE_TEACHING.toLowerCase()).toContain("name badge");
  });

  it("maintains multi-turn conversation memory in chronological order for the exact café / saying-my-name two-question regression test", async () => {
    const turn1Learner: ConversationTurn = {
      id: "turn_1_learner",
      role: "learner",
      text: "When I'm ordering at a café and the barista asks for my name, I freeze right before saying my name.",
      stageLabel: "P01 Beat 2 — Speak First",
      timestampIso: "2026-04-06T10:00:00.000Z",
    };

    // Build Turn 1 prompt
    const turn1Prompt = buildLessonQaPrompt(
      {
        checkInCompleted: true,
        currentStageLabel: "P01 Beat 2 — Speak First",
        completedStepTitles: ["Beat 1 — The Mirror"],
        unreachedStepTitles: [
          "Beat 3 — Event vs. Verdict & Name-Badge",
          "Beat 4 — The Live Shift (Attempt 2)",
          "Beat 5 — Real-World Transfer",
        ],
        reachedSectionSummaries: getP01SectionsForBeat("p01_beat_2_speak_first"),
        recentAttempts: [],
        currentSessionAttempts: [],
        speechEvents: [],
        sharedMemories: [
          {
            id: "m1",
            userId: "u1",
            category: "goal",
            fact: "Speak with less tension and self-monitoring",
            sourceKind: "user_report",
            sourceReference: "check_in",
          },
        ],
        recentConversationTurns: [turn1Learner],
        speechTermMode: "stammering",
      },
      turn1Learner.text
    );

    const turn1Simulated = await simulateGuestGatewayCall({
      action: "coach_generate",
      purpose: "coco_qa",
      attemptOrSessionId: "qa_cafe_1",
      payload: { prompt: turn1Prompt },
    });
    expect(turn1Simulated.ok).toBe(true);

    const turn1Coach: ConversationTurn = {
      id: "turn_1_coach",
      role: "coach",
      text: sanitizeCocoOutput(turn1Simulated.text),
      stageLabel: "P01 Beat 2 — Speak First",
      timestampIso: "2026-04-06T10:00:02.000Z",
    };

    const turn2Question =
      "Wait — in that situation I just mentioned, what should I focus on right before I say it?";
    const turn2Learner: ConversationTurn = {
      id: "turn_2_learner",
      role: "learner",
      text: turn2Question,
      stageLabel: "P01 Beat 2 — Speak First",
      timestampIso: "2026-04-06T10:00:15.000Z",
    };

    // Build Turn 2 prompt with full chronological conversation history
    const turn2Prompt = buildLessonQaPrompt(
      {
        checkInCompleted: true,
        currentStageLabel: "P01 Beat 2 — Speak First",
        completedStepTitles: ["Beat 1 — The Mirror"],
        unreachedStepTitles: [
          "Beat 3 — Event vs. Verdict & Name-Badge",
          "Beat 4 — The Live Shift (Attempt 2)",
          "Beat 5 — Real-World Transfer",
        ],
        reachedSectionSummaries: getP01SectionsForBeat("p01_beat_2_speak_first"),
        recentAttempts: [],
        currentSessionAttempts: [],
        speechEvents: [],
        sharedMemories: [
          {
            id: "m1",
            userId: "u1",
            category: "goal",
            fact: "Speak with less tension and self-monitoring",
            sourceKind: "user_report",
            sourceReference: "check_in",
          },
        ],
        recentConversationTurns: [turn1Learner, turn1Coach, turn2Learner],
        speechTermMode: "stammering",
      },
      turn2Question
    );

    // 1. Chronological order (Turn 1 Learner -> Turn 1 Coco -> Turn 2 Learner)
    const idxTurn1Learner = turn2Prompt.indexOf(
      'Learner: "When I\'m ordering at a café'
    );
    const idxTurn1Coach = turn2Prompt.indexOf('Coco: "[Simulated Coco');
    const idxTurn2Learner = turn2Prompt.indexOf(
      'Learner: "Wait — in that situation I just mentioned'
    );
    expect(idxTurn1Learner).toBeGreaterThan(-1);
    expect(idxTurn1Coach).toBeGreaterThan(idxTurn1Learner);
    expect(idxTurn2Learner).toBeGreaterThan(idxTurn1Coach);

    // 2. Separately scoped long-term learner memories vs current-conversation history
    expect(turn2Prompt).toContain(
      "Long-term shared learner memories (separately scoped background context):"
    );
    expect(turn2Prompt).toContain(
      "Recent Ask Coco conversation history (current session, chronological order oldest to newest):"
    );

    // 3. Unreached lesson information (Beat 3 Event-vs-Verdict, Beat 5 Transfer) is excluded from reached material
    expect(turn2Prompt).not.toContain("separate a particular event from a verdict");
    expect(turn2Prompt).not.toContain("carrying this into a real conversation");

    // 4. Guest simulator also honours the café + saying-my-name follow-up context
    const turn2Simulated = await simulateGuestGatewayCall({
      action: "coach_generate",
      purpose: "coco_qa",
      attemptOrSessionId: "qa_cafe_2",
      payload: { prompt: turn2Prompt },
    });
    expect(turn2Simulated.ok).toBe(true);
    expect(turn2Simulated.text.toLowerCase()).toContain("café");
    expect(turn2Simulated.text.toLowerCase()).toContain("saying your name");
  });

  it("distinguishes verified spoken attempts from typed fallbacks, skipped, and historical attempts", () => {
    const recordedAttempt: SpeechAttempt = {
      id: "att_rec",
      userId: "u1",
      sourceContext: "lesson_p01",
      activityOrSectionId: "P01-07",
      promptText: "Weekend food",
      createdAtIso: "2026-04-06T10:00:00.000Z",
      durationSeconds: 7.2,
      disfluentTranscript: "I like pasta",
      summaryObservation: "Clear speech",
      analysisStatus: "success",
      hasLocalAudio: true,
      participationStatus: "recorded",
      isCurrentSession: true,
    };

    const spokenUnrecordedAttempt: SpeechAttempt = {
      ...recordedAttempt,
      id: "att_spoken_unrec",
      durationSeconds: 0,
      hasLocalAudio: false,
      participationStatus: "spoken_unrecorded",
    };

    const typedOnlyAttempt: SpeechAttempt = {
      ...recordedAttempt,
      id: "att_typed",
      durationSeconds: 0,
      hasLocalAudio: false,
      disfluentTranscript: "I typed this without speaking aloud",
      participationStatus: "typed_only",
    };

    const historicalAttempt: SpeechAttempt = {
      ...recordedAttempt,
      id: "att_hist",
      disfluentTranscript: "Historical session recording from yesterday",
      isCurrentSession: false,
    };

    expect(isVerifiedSpokenAttempt(recordedAttempt)).toBe(true);
    expect(isVerifiedSpokenAttempt(spokenUnrecordedAttempt)).toBe(true);
    expect(isVerifiedSpokenAttempt(typedOnlyAttempt)).toBe(false);
    expect(
      isVerifiedSpokenAttempt({
        ...recordedAttempt,
        participationStatus: "skipped",
      })
    ).toBe(false);
    expect(
      isVerifiedSpokenAttempt({
        ...recordedAttempt,
        participationStatus: "mic_unavailable",
      })
    ).toBe(false);

    const qaPrompt = buildLessonQaPrompt(
      {
        checkInCompleted: true,
        currentStageLabel: "P01 Beat 2",
        completedStepTitles: ["Beat 1"],
        unreachedStepTitles: ["Beat 3", "Beat 4", "Beat 5"],
        reachedSectionSummaries: getP01SectionsForBeat("p01_beat_2_speak_first"),
        recentAttempts: [recordedAttempt, typedOnlyAttempt, historicalAttempt],
        currentSessionAttempts: [recordedAttempt, typedOnlyAttempt],
        speechEvents: [],
        sharedMemories: [],
        recentConversationTurns: [],
        speechTermMode: "stammering",
      },
      "How did my attempt go?"
    );

    expect(qaPrompt).toContain("I like pasta");
    expect(qaPrompt).not.toContain("I typed this without speaking aloud");
    expect(qaPrompt).not.toContain("Historical session recording from yesterday");
  });

  it("classifies missing microphone hardware separately from permission denial", () => {
    const missingErr = classifyMicrophoneError({
      name: "NotFoundError",
      message: "Requested device not found",
    });
    expect(missingErr.errorKind).toBe("mic_missing");
    expect(missingErr.title).toBe("No Microphone Detected");

    const deniedErr = classifyMicrophoneError({
      name: "NotAllowedError",
      message: "Permission denied by user",
    });
    expect(deniedErr.errorKind).toBe("mic_permission_denied");
    expect(deniedErr.title).toBe("Microphone Permission Denied");

    const busyErr = classifyMicrophoneError({
      name: "NotReadableError",
      message: "Could not start audio source",
    });
    expect(busyErr.errorKind).toBe("mic_unavailable");
  });

  it("formats conversation history and sanitizes leaked prefixes from Coco replies", () => {
    expect(formatConversationHistory([])).toContain("None in this conversation yet.");
    expect(sanitizeCocoOutput('Coco: "You are Coco.\nHello! Glad to hear that."')).toBe(
      "Hello! Glad to hear that."
    );
  });
});
