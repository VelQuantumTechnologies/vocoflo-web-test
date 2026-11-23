import type { AllowedGatewayAction, AllowedGatewayPurpose } from "@/lib/ai/gateway-validation";
import type { LearnerProfile, SpeechAttempt } from "@/types/vocoflo";
import { GUEST_REVIEW_USER_ID } from "./config";

export interface SimulatedGatewayResult {
  ok: boolean;
  httpStatus: number;
  model: string;
  text: string;
  audioBase64: string | null;
  audioMimeType: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  errorMessage?: string;
}

export function createGuestProfile(): LearnerProfile {
  return {
    userId: GUEST_REVIEW_USER_ID,
    displayName: "Guest Reviewer",
    chosenGoals: [],
    importantSituations: [],
    completedCheckIn: false,
    selectedToolId: "P01",
    developmentFixtureEnabled: true,
    preferredLanguage: "en",
    membershipTier: "free_preview",
    membershipStatus: "active_preview",
    onboardingSeen: false,
  };
}

function buildSimulatedTranscriptForContext(
  attemptOrSessionId: string,
  prompt: string
): {
  transcript: string;
  summaryObservation: string;
  events: Array<{
    startSeconds: number;
    endSeconds: number;
    type: "repetition" | "prolongation" | "pause" | "other_uncertain";
    wordOrSound?: string;
    tentativeObservation: string;
  }>;
} {
  const lower = `${attemptOrSessionId} ${prompt}`.toLowerCase();

  if (lower.includes("morning light settled") || lower.includes("sample 3") || lower.includes("ci_s3")) {
    return {
      transcript:
        "M-morning light settled across the quiet street outside the station. Early commuters paused near the corner cafe, tr-trading unhurried greetings while waiting for the train doors to open.",
      summaryObservation:
        "[Simulated Guest Observation] Tentative reading sample check: brief syllable repetition on 'M-morning' and 'tr-trading' with a natural pause before 'early'.",
      events: [
        {
          startSeconds: 0.4,
          endSeconds: 1.0,
          type: "repetition",
          wordOrSound: "M-morning",
          tentativeObservation: "[Simulated] Brief initial syllable repetition on 'morning'.",
        },
        {
          startSeconds: 3.1,
          endSeconds: 3.7,
          type: "pause",
          wordOrSound: "pause",
          tentativeObservation: "[Simulated] Unhurried pause before 'Early commuters'.",
        },
      ],
    };
  }

  if (lower.includes("picture") || lower.includes("scene") || lower.includes("ci_s2")) {
    return {
      transcript:
        "I see a sunny park and a corner cafe with a striped awning. Two coffee cups are steaming on a s-sidewalk table, and someone is reading on a bench with a small brown dog.",
      summaryObservation:
        "[Simulated Guest Observation] Tentative scene description check: calm pacing with one brief repetition on 's-sidewalk' and an audible pause mid-description.",
      events: [
        {
          startSeconds: 1.2,
          endSeconds: 1.8,
          type: "repetition",
          wordOrSound: "s-sidewalk",
          tentativeObservation: "[Simulated] Brief consonant repetition on 'sidewalk'.",
        },
        {
          startSeconds: 4.0,
          endSeconds: 4.6,
          type: "pause",
          wordOrSound: "pause",
          tentativeObservation: "[Simulated] Natural planning pause while scanning the scene.",
        },
      ],
    };
  }

  if (lower.includes("conv") || lower.includes("colleague")) {
    return {
      transcript:
        "My week has been pretty steady—mostly wrapping up a couple of projects and taking s-slow walks in the evening.",
      summaryObservation:
        "[Simulated Guest Observation] Conversational turn: one brief prolongation/repetition near 's-slow'.",
      events: [
        {
          startSeconds: 1.8,
          endSeconds: 2.4,
          type: "prolongation",
          wordOrSound: "s-slow",
          tentativeObservation: "[Simulated] Brief sound hold on 'slow'.",
        },
      ],
    };
  }

  if (lower.includes("p01") || lower.includes("outside work")) {
    return {
      transcript:
        "Outside work I really enjoy c-cooking simple weekend meals and taking unhurried walks when the weather clears up.",
      summaryObservation:
        "[Simulated Guest Observation] P01 speaking clip: brief syllable catch on 'c-cooking' while staying with your point.",
      events: [
        {
          startSeconds: 0.9,
          endSeconds: 1.5,
          type: "repetition",
          wordOrSound: "c-cooking",
          tentativeObservation: "[Simulated] Tentative syllable repetition on 'cooking'.",
        },
        {
          startSeconds: 2.8,
          endSeconds: 3.3,
          type: "pause",
          wordOrSound: "pause",
          tentativeObservation: "[Simulated] Short breath pause before continuing.",
        },
      ],
    };
  }

  return {
    transcript:
      "I'm exploring VocoFlo today, and speaking tends to feel more effortful during q-quick introductions or team updates.",
    summaryObservation:
      "[Simulated Guest Observation] Spontaneous sample: brief repetition on 'q-quick' and a short pause before 'or team updates'.",
    events: [
      {
        startSeconds: 1.1,
        endSeconds: 1.7,
        type: "repetition",
        wordOrSound: "q-quick",
        tentativeObservation: "[Simulated] Tentative syllable repetition on 'quick'.",
      },
      {
        startSeconds: 2.9,
        endSeconds: 3.5,
        type: "pause",
        wordOrSound: "pause",
        tentativeObservation: "[Simulated] Brief pause mid-phrase.",
      },
    ],
  };
}

function extractLineValue(prompt: string, prefix: string): string | null {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*(.+)`, "i").exec(prompt);
  return match?.[1]?.trim() || null;
}

function extractLearnerInput(prompt: string): string | null {
  const patterns = [
    /Learner's latest question:\s*"([^"]+)"/i,
    /What the learner actually shared:\s*"([^"]+)"/i,
    /Learner's own words:\s*"([^"]+)"/i,
    /Learner's speech\/text:\s*"([^"]+)"/i,
    /Learner's words:\s*"([^"]+)"/i,
    /Learner's reply:\s*"([^"]+)"/i,
    /Learner's latest reply \(text\):\s*(.+)/i,
    /familiar label or rule that sometimes shows up for them:\s*"([^"]+)"/i,
    /Learner's familiar label:\s*"([^"]+)"/i,
    /Learner question:\s*"([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = re.exec(prompt);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return null;
}

function extractPriorLearnerTurnsFromQaPrompt(prompt: string): string[] {
  const blockMatch =
    /Recent Ask Coco conversation history[\s\S]*?:\n([\s\S]*?)\n\nLearner's latest question:/i.exec(
      prompt
    );
  if (!blockMatch?.[1]) return [];
  const lines = blockMatch[1].split("\n");
  const turns: string[] = [];
  for (const line of lines) {
    const m = /^Learner:\s*"(.+)"$/i.exec(line.trim());
    if (m?.[1]) {
      turns.push(m[1].trim());
    }
  }
  return turns;
}

function simulateCoachGenerate(
  purpose: AllowedGatewayPurpose,
  attemptOrSessionId: string,
  payload: Record<string, unknown>
): string {
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const learnerInput = extractLearnerInput(prompt);
  const usesStuttering = prompt.toLowerCase().includes("stuttering / stutter");
  const termVerb = usesStuttering ? "stutter" : "stammer";

  if (purpose === "coco_qa") {
    const stage =
      extractLineValue(prompt, "Current location:") ||
      extractLineValue(prompt, "Current stage:") ||
      "this step";
    const completed = extractLineValue(prompt, "Completed steps so far:") || "the steps so far";
    const question = learnerInput || "this part of the session";
    const qLower = question.toLowerCase();
    const priorLearnerTurns = extractPriorLearnerTurnsFromQaPrompt(prompt);
    const priorJoined = priorLearnerTurns.join(" ").toLowerCase();

    // Multi-turn continuity check (including the café / saying-my-name two-question scenario)
    const mentionedCafeBefore =
      priorJoined.includes("cafe") ||
      priorJoined.includes("café") ||
      priorJoined.includes("coffee");
    const mentionedNameBefore =
      priorJoined.includes("saying my name") ||
      priorJoined.includes("say my name") ||
      priorJoined.includes("my name");

    if (qLower.includes("beat 5") || qLower.includes("coming next") || qLower.includes("spoil")) {
      return `[Simulated Coco — Guest Mode] Right now we're focused on ${stage}. I only draw from what you've reached so far (${completed}) so upcoming steps stay unspoiled until you get there.`;
    }

    if (
      priorLearnerTurns.length > 0 &&
      (mentionedCafeBefore ||
        mentionedNameBefore ||
        qLower.includes("earlier") ||
        qLower.includes("just said") ||
        qLower.includes("just mentioned") ||
        qLower.includes("that situation") ||
        qLower.includes("that moment") ||
        qLower.includes("cafe") ||
        qLower.includes("café") ||
        qLower.includes("my name"))
    ) {
      if (mentionedCafeBefore && mentionedNameBefore) {
        return `[Simulated Coco — Guest Mode] You mentioned earlier that when you're at a café and asked for your name, saying your name can catch or feel high-stakes. In that café moment, catching on your name is just one specific speaking event at the counter—not a verdict about your capability or who you are as a speaker.`;
      }
      const lastTurn = priorLearnerTurns[priorLearnerTurns.length - 1];
      return `[Simulated Coco — Guest Mode] Connecting this to what you shared a moment ago ("${lastTurn.slice(0, 80)}"), we can treat that moment in ${stage} as one specific event rather than a wider verdict about you.`;
    }

    if (
      (qLower.includes("cafe") || qLower.includes("café") || qLower.includes("coffee")) &&
      qLower.includes("name")
    ) {
      return `[Simulated Coco — Guest Mode] When you're ordering at a café and saying your name catches, that single sticky moment at the counter can quickly feel heavy because your name feels personal. Here in ${stage}, we notice that catching on your name at the café is one specific speaking event, not a broader verdict about you.`;
    }
    if (qLower.includes("verdict") || qLower.includes("event")) {
      return `[Simulated Coco — Guest Mode] Separating a single sticky word from a wider verdict about yourself keeps one moment in proportion. You can notice what happened on that word without turning it into a rule about who you are as a speaker.`;
    }
    if (qLower.includes("standard")) {
      return `[Simulated Coco — Guest Mode] Loosening a harsh identity label doesn't mean lowering your care or standards—it just means you keep your standards in your preparation so you don't have to defend a whole identity in every sentence.`;
    }
    return `[Simulated Coco — Guest Mode] Here in ${stage}, you're doing grounded exploratory work based on ${completed}. Keep noticing what actually felt true for you on "${question.slice(0, 70)}" without needing to judge it.`;
  }

  if (purpose === "responsive_roleplay") {
    const isClosing = prompt.toLowerCase().includes("natural, polite real-world close");
    const snippet = learnerInput ? `"${learnerInput.slice(0, 70)}"` : "how your week has been going";
    if (isClosing) {
      return `[Simulated Partner — Guest Mode] It was really nice hearing about ${snippet}. Thanks for catching up today—take care and talk soon!`;
    }
    return `[Simulated Partner — Guest Mode] Thanks for sharing about ${snippet}—that sounds like a full week. What part of that has felt most enjoyable or interesting to you lately?`;
  }

  if (attemptOrSessionId === "check_in_debrief") {
    const goals = extractLineValue(prompt, "- Learner goals:") || "speaking with less pressure";
    const situations = extractLineValue(prompt, "- Important situations:") || "everyday conversations";
    const shift = extractLineValue(prompt, "- Shift experiment reflection:") || "trying a gentle focus shift";
    return `[Simulated Coco — Guest Mode] Thank you for walking through your Check-In around ${situations} and your focus on ${goals}. Any tentative speech moments marked on the timeline stay optional and correctable by you, and smooth-sounding audio never erases internal effort—including what you noticed during ${shift}. A natural next step is Module 1, Your Identity With Your Speech, where we gently separate a single speaking moment from a wider verdict about yourself.`;
  }

  if (attemptOrSessionId === "p01_beat_1_mirror") {
    if (prompt.toLowerCase().includes("selection: often")) {
      return `[Simulated Coco — Guest Mode] Thank you for naming that honestly—when one difficult word shows up often, it can quickly feel like a statement about all of you. Before we explore today's core idea, let's start by speaking naturally in Beat 2.`;
    }
    if (prompt.toLowerCase().includes("selection: skip")) {
      return `[Simulated Coco — Guest Mode] Totally fine to skip that question and start simply. Whenever you're ready, Beat 2 invites you to speak naturally about something you enjoy outside work.`;
    }
    const notePart = learnerInput ? ` about "${learnerInput.slice(0, 70)}"` : "";
    return `[Simulated Coco — Guest Mode] I hear you${notePart}. Before we look at today's concept in Beat 3, let's start with a relaxed baseline speaking turn in Beat 2.`;
  }

  if (attemptOrSessionId === "p01_beat_3_label") {
    const label = learnerInput || "that familiar rule";
    return `[Simulated Coco — Guest Mode] Carrying "${label}" like heavy armour makes every sentence feel high-stakes, whereas setting that name badge on the table for one conversation leaves room for your actual message.`;
  }

  if (attemptOrSessionId === "p01_beat_4_followup") {
    const reply = learnerInput ? ` "${learnerInput.slice(0, 70)}"` : "";
    return `[Simulated Coco — Guest Mode] Thank you for sharing${reply}—staying with what you wanted your listener to understand is the heart of this lesson.`;
  }

  if (attemptOrSessionId.startsWith("att_p01_a2_")) {
    const shared = learnerInput
      ? `what you shared ("${learnerInput.slice(0, 75)}")`
      : "your second speaking turn";
    return `[Simulated Coco — Guest Mode] I heard ${shared}—it came through with a clear personal point, regardless of whether a word caught along the way. What was the main detail you most wanted your listener to picture there?`;
  }

  if (attemptOrSessionId.startsWith("att_p01_a1_")) {
    const shared = learnerInput
      ? `hearing about "${learnerInput.slice(0, 75)}"`
      : "hearing what you enjoy outside work";
    return `[Simulated Coco — Guest Mode] Thank you for ${shared}—it's clear why that matters to you. Whenever you're ready, let's move into Beat 3 to explore today's core idea together.`;
  }

  // Default: Check-In Samples 1-3 listening response
  const isReading = attemptOrSessionId.includes("s3") || prompt.toLowerCase().includes("short reading");
  if (isReading) {
    return `[Simulated Coco — Guest Mode] Thank you for reading that passage aloud at your own pace—you stayed with the story naturally even if you ${termVerb}ed on a sound. Whenever you're ready, we can move to the live conversation sample.`;
  }
  const spokenRef = learnerInput ? ` about "${learnerInput.slice(0, 75)}"` : "";
  return `[Simulated Coco — Guest Mode] Thank you for sharing that sample${spokenRef}. I'm just listening to your ordinary voice here with zero grading—whenever you feel ready, head to the next sample.`;
}

export async function simulateGuestGatewayCall(params: {
  action: AllowedGatewayAction;
  purpose: AllowedGatewayPurpose;
  attemptOrSessionId: string;
  payload: Record<string, unknown>;
}): Promise<SimulatedGatewayResult> {
  if (params.action === "tts_synthesize") {
    return {
      ok: false,
      httpStatus: 0,
      model: "guest-simulator-v1",
      text: "",
      audioBase64: null,
      audioMimeType: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      errorMessage:
        "Guest Review Mode: live TTS is disabled (no unauthenticated AI calls). Pre-generated prompts play audio and readable simulated text stays visible.",
    };
  }

  if (params.action === "speech_analysis") {
    const prompt = typeof params.payload.prompt === "string" ? params.payload.prompt : "";
    const durationRaw = Number(params.payload.durationSeconds || 5);
    const maxSec = Number.isFinite(durationRaw) && durationRaw > 1 ? durationRaw : 5;
    const sim = buildSimulatedTranscriptForContext(params.attemptOrSessionId, prompt);
    const clampedEvents = sim.events.map((ev, idx) => {
      const start = Math.min(Math.max(0.2, ev.startSeconds), Math.max(0.3, maxSec - 0.5 - idx * 0.2));
      const end = Math.min(maxSec, Math.max(start + 0.3, ev.endSeconds));
      return {
        ...ev,
        startSeconds: Number(start.toFixed(2)),
        endSeconds: Number(end.toFixed(2)),
      };
    });

    return {
      ok: true,
      httpStatus: 200,
      model: "guest-simulator-v1 (simulated)",
      text: JSON.stringify({
        speechDetected: true,
        disfluentTranscript: sim.transcript,
        summaryObservation: sim.summaryObservation,
        events: clampedEvents,
      }),
      audioBase64: null,
      audioMimeType: null,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 140,
    };
  }

  const replyText = simulateCoachGenerate(
    params.purpose,
    params.attemptOrSessionId,
    params.payload
  );
  return {
    ok: true,
    httpStatus: 200,
    model: "guest-simulator-v1 (simulated)",
    text: replyText,
    audioBase64: null,
    audioMimeType: null,
    inputTokens: null,
    outputTokens: null,
    latencyMs: 160,
  };
}

export function isSimulatedAttempt(attempt: SpeechAttempt): boolean {
  return (
    attempt.analysisStatus === "fixture" ||
    Boolean(attempt.analysisModel?.toLowerCase().includes("simulated"))
  );
}
