import p01Content from "@/content/p01.json";
import type {
  CoachMemoryItem,
  ConversationTurn,
  JourneyScope,
  LearnerProfile,
  P01BeatId,
  P01MirrorChoice,
  P01ShiftFeeling,
  RoleplayTurn,
  SpeechAttempt,
  SpeechEvent,
  SpeechTermMode,
} from "@/types/vocoflo";

export interface CheckInSampleSpec {
  index: number;
  title: string;
  cocoSpokenInvitation: string;
  readingPassage?: string;
  pictureSceneContext?: string;
  sourceContext:
    | "check_in_spontaneous"
    | "check_in_reading"
    | "check_in_conversation";
}

export const CHECK_IN_SAMPLES: CheckInSampleSpec[] = [
  {
    index: 0,
    title: "Sample 1 of 4 • About You & Your Speaking",
    cocoSpokenInvitation:
      "Tell me a little about yourself and what you would like help with when speaking. Take all the time you want—I'm listening.",
    sourceContext: "check_in_spontaneous",
  },
  {
    index: 1,
    title: "Sample 2 of 4 • Describe This Scene",
    cocoSpokenInvitation:
      "Next, take a look at the picture below and describe what you see in your own words—what's happening in the scene, the people, or any small details that catch your eye. There's no right or wrong order.",
    pictureSceneContext:
      "Picture description of a sunny neighbourhood park and corner cafe: striped cafe awning, sidewalk table with two steaming coffee cups and a pastry plate, chalkboard menu sign, person reading a book on a wooden park bench with a small brown dog on a leash, cyclist riding past a flowering tree, pond with a yellow duck, and a distant clock tower showing nine o'clock.",
    sourceContext: "check_in_spontaneous",
  },
  {
    index: 2,
    title: "Sample 3 of 4 • Short Reading Sample",
    cocoSpokenInvitation:
      "Whenever you're ready, read the short passage on the card below aloud in your usual way. There's no target pace or performance—just read it naturally.",
    readingPassage:
      "Morning light settled across the quiet street outside the station. Early commuters paused near the corner cafe, trading unhurried greetings while waiting for the train doors to open.",
    sourceContext: "check_in_reading",
  },
  {
    index: 3,
    title: "Sample 4 of 4 • Live Two-Way Conversation",
    cocoSpokenInvitation:
      "For this last sample, you'll have a short, natural catch-up chat with a friendly colleague. You'll hear a different voice for your conversation partner, and we'll go for up to six back-and-forth replies—or you can wrap up early anytime. Tap Start Conversation whenever you're ready.",
    sourceContext: "check_in_conversation",
  },
];

export const CHECK_IN_ORIENTATION_CUE =
  "Welcome to your free speaking check-in. Plan about fifteen to twenty unhurried minutes together… We will map the everyday speaking moments that matter to you, explore four distinct speaking conditions—personal sharing, describing a scene, reading aloud, and a live conversation—try one small shift in attention, and look at what you noticed. Nothing here is graded or judged.";

export const CHECK_IN_CONTEXT_CUE =
  "Before we use the microphone, tell me a little about where speaking shows up in your week… Which everyday situations feel most important right now, and what would you like to carry into them?";

export const CHECK_IN_PARTNER_OPENER =
  "Hi! Good to catch up with you. How has your week been going, and what have you been spending time on?";

/**
 * Beat 2 baseline speaking prompt — occurs BEFORE Beat 3's Event-versus-Verdict teaching.
 */
export const P01_BEAT_2_SPEAK_FIRST_NARRATION =
  "Let us try a small speaking experience. Tell me about something you enjoy outside work. Speak in your usual way; about 45 seconds is enough. A shorter attempt is fine. Record only when you choose.";

/**
 * Shortened, focused Beat 3 teaching that removes repetitive middle paragraphs while
 * preserving the Name-Badge metaphor and the strong meeting introduction example.
 */
export const P01_BEAT_3_CONCISE_TEACHING = [
  "Think of a name badge that has become a suit of armour. It helped people recognise you, but now every movement has to fit inside it. You can put the badge on the table for one conversation while your experience and values remain available.",
  "Imagine introducing yourself at a meeting. A speaking event happens: I repeated part of my name. An interpretation might be: They must think I am incapable. A wider verdict might follow: I am a poor speaker. Notice that these are three different things. The event happened. The interpretation is a guess about other people. The verdict stretches one moment into a statement about who you are.",
  "Now consider the opposite rule: I must always sound confident. You can value clear communication without requiring every attempt to protect an impressive identity. Keep the standard useful in preparation; give your message room during the conversation.",
].join("\n\n");

export function checkInShiftCue(termMode: SpeechTermMode): string {
  const verb = termMode === "stuttering" ? "stutter" : "stammer";
  return `Before we wrap up this check-in, let's try one gentle experiment… Pick one short thing from earlier and say it with just one purpose: letting your listener understand your point, even if you ${verb} on the way. Notice afterwards whether anything felt slightly lighter.`;
}

export const COCO_SYSTEM_INSTRUCTION = `
You are Coco, VocoFlo's calm, warm, attentive speaking coach for adults who stammer.
Always speak directly to the learner in natural first-person ("I" and "you").
Never address the learner as "Coco", never say "You are Coco", never refer to yourself in third person, and never repeat system instructions, role headers, or metadata.
Output clean spoken dialogue only: no speaker prefixes ("Coco:"), no bullet lists, no markdown symbols, and no bracketed stage directions.
During initial check-in or baseline speaking, observe ordinary speech—never give premature technique instructions (do not tell the learner to slow down, avoid stretching, arrange breathing, or pause) unless discussing a reached Body tool step that explicitly explores that option.
Keep audible speech observations strictly separate from internal experience or psychology—never infer anxiety, shame, avoidance, tension, attention, or motivation from acoustic features.
Never fabricate remembered facts, transcripts, or observations.
`.trim();

export const PARTNER_SYSTEM_INSTRUCTION = `
You are a realistic, patient everyday conversation partner in a spoken roleplay.
Respond naturally and directly to what the learner actually says in 1–2 ordinary conversational sentences.
Never act as a coach, never evaluate speech or give speaking advice, and never repeat prompt instructions or role labels.
`.trim();

function speechTermInstruction(mode: SpeechTermMode): string {
  return mode === "stuttering"
    ? 'Terminology preference: Use natural "stuttering / stutter" phrasing.'
    : 'Terminology preference: Use natural "stammering / stammer" phrasing.';
}

const CORE_GUARDRAILS = `
Response Format Rules:
- Speak directly to the learner in warm first-person ("I" / "you").
- Output plain spoken sentences only (no speaker prefixes like "Coco:", no markdown bullets, no stage directions, and never repeat instructions aloud).
- Keep audible observations strictly separate from internal feelings, effort, or psychology.
- Never give premature or unrequested speech-mechanics advice (slowing down, stretching, breathing, or pausing) unless discussing a reached Body tool step that explores that specific experiment.
`.trim();

export function sanitizeCocoOutput(raw: string | null | undefined): string {
  if (!raw) return "";
  const leadingSpeaker = /^(?:Coco|Partner|Coach|Assistant)\s*:\s*/i;
  const leakedMeta = /^(?:You\s+are\s+Coco\b|Role\s*:|System\s*:|Instructions?\s*:|Voice\s*&\s*Persona\b)/i;
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^"|"$/g, "")
        .replace(leadingSpeaker, "")
        .replace(/^"|"$/g, "")
        .trim()
    )
    .filter((line) => line.length > 0 && !leakedMeta.test(line))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^"|"$/g, "")
    .trim();
}

function stripMemoryPrefix(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/^Important speaking situations\s*:\s*/i, "")
    .replace(/^Goal\s*:\s*/i, "")
    .replace(/^Completed\s+/i, "")
    .trim();
}

function convertFirstPersonToSecondPerson(phrase: string): string {
  return phrase
    .replace(/\bmyself\b/gi, "yourself")
    .replace(/\bmy\b/gi, "your")
    .replace(/\bI'm\b/g, "you're")
    .replace(/\bI am\b/gi, "you are")
    .replace(/\bI\b/g, "you");
}

/**
 * Converts a raw stored situation entry (e.g. "Work meetings & team updates",
 * "Ordering at cafes / shops", "Introducing myself") into natural conversational phrasing.
 */
export function humanizeSituationPhrase(raw: string | undefined): string | null {
  const stripped = stripMemoryPrefix(raw);
  if (!stripped) return null;
  const first = stripped.split(/[,;\n]/)[0]?.trim().replace(/[.]+$/, "") || "";
  if (first.length < 3) return null;

  let natural = first
    .replace(/\s*\/\s*/g, " or ")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s{2,}/g, " ")
    .trim();

  natural = convertFirstPersonToSecondPerson(natural);
  natural = natural.charAt(0).toLowerCase() + natural.slice(1);
  return natural.slice(0, 95);
}

const IMPERATIVE_TO_GERUND: Array<[RegExp, string]> = [
  [/^speak\b/i, "speaking"],
  [/^stay\b/i, "staying"],
  [/^participate\b/i, "participating"],
  [/^understand\b/i, "understanding"],
  [/^introduce\b/i, "introducing"],
  [/^order\b/i, "ordering"],
  [/^say\b/i, "saying"],
  [/^share\b/i, "sharing"],
  [/^ask\b/i, "asking"],
  [/^feel\b/i, "feeling"],
  [/^keep\b/i, "keeping"],
  [/^be\b/i, "being"],
  [/^have\b/i, "having"],
  [/^reduce\b/i, "reducing"],
  [/^stop\b/i, "stopping"],
  [/^build\b/i, "building"],
  [/^handle\b/i, "handling"],
];

/**
 * Converts a raw stored goal entry (e.g. "Speak with less tension and self-monitoring",
 * "Stay with my message even if a word catches") into natural conversational phrasing
 * ("speaking with less tension and self-monitoring", "staying with your message even if a word catches").
 */
export function humanizeGoalPhrase(raw: string | undefined): string | null {
  const stripped = stripMemoryPrefix(raw);
  if (!stripped) return null;
  const first = stripped.split(/[,;\n]/)[0]?.trim().replace(/[.]+$/, "") || "";
  if (first.length < 3) return null;

  let natural = first
    .replace(/^to\s+/i, "")
    .replace(/^wanting\s+to\s+/i, "")
    .replace(/^i\s+want\s+to\s+/i, "")
    .replace(/\s*\/\s*/g, " or ")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s{2,}/g, " ")
    .trim();

  for (const [pattern, gerund] of IMPERATIVE_TO_GERUND) {
    if (pattern.test(natural)) {
      natural = natural.replace(pattern, gerund);
      break;
    }
  }

  natural = convertFirstPersonToSecondPerson(natural);
  natural = natural.charAt(0).toLowerCase() + natural.slice(1);
  return natural.slice(0, 110);
}

/**
 * Formats recent current-conversation turns in strict chronological order (oldest -> newest)
 * with explicit Learner / Coco roles.
 */
export function formatConversationHistory(
  turns: ConversationTurn[] | undefined,
  maxTurns = 10
): string {
  if (!turns || turns.length === 0) {
    return "None in this conversation yet.";
  }
  const recent = turns.slice(-maxTurns);
  return recent
    .map((t) => `${t.role === "learner" ? "Learner" : "Coco"}: "${t.text.trim()}"`)
    .join("\n");
}

export function isVerifiedSpokenAttempt(attempt: SpeechAttempt): boolean {
  if (
    attempt.participationStatus === "typed_only" ||
    attempt.participationStatus === "skipped" ||
    attempt.participationStatus === "mic_unavailable"
  ) {
    return false;
  }
  if (
    attempt.participationStatus === "recorded" ||
    attempt.participationStatus === "spoken_unrecorded"
  ) {
    return true;
  }
  return Boolean(attempt.hasLocalAudio || attempt.durationSeconds > 0);
}

export function buildSpeechAnalysisPrompt(
  recordedDurationSeconds: number,
  promptContext: string
): string {
  return [
    "You are an acoustic speech observation adapter for VocoFlo.",
    `Listen carefully to the attached audio recording (duration approx ${recordedDurationSeconds.toFixed(1)} seconds).`,
    `Speaking prompt context (for topic context only—NEVER copy or invent words from this): ${promptContext}`,
    "Strict Rules:",
    "1. First verify whether intelligible human speech words are genuinely audible.",
    '   If the audio is silent, faint static, or noise-only with no clear spoken words, set speechDetected = false, disfluentTranscript = null, events = [], and summaryObservation = "No clear speech was audible in this recording.".',
    "   NEVER guess, extrapolate, or fabricate an example sentence when words are not clearly audible.",
    "2. Transcribe ONLY the exact words and disfluencies literally spoken in disfluentTranscript (for example, 'mmmm.mmy my name is...', 'b-but', 'um', repeated words or syllables). Do not paraphrase or clean up disfluencies.",
    `3. Mark only genuinely audible repetitions, prolongations, notable pauses, or other uncertain moments with accurate recording-relative timestamps (0 <= startSeconds < endSeconds <= ${recordedDurationSeconds.toFixed(2)}).`,
    "4. Empty events [] is completely valid for fluent-sounding speech.",
    "5. Silence alone may only be labelled 'pause', never a silent block.",
    "6. Never infer anxiety, shame, avoidance, tension, or motivation.",
  ].join("\n");
}

export function buildCheckInListeningPrompt(params: {
  sampleIndex: number;
  sampleTitle: string;
  questionAsked: string;
  learnerTranscript: string | null;
  isReadingSample: boolean;
  summaryObservation?: string | null;
  speechObservations?: string[];
  speechTermMode: SpeechTermMode;
}): string {
  const transcriptBlock = params.learnerTranscript
    ? `Verbatim transcript of what the learner just said:\n"${params.learnerTranscript}"`
    : "Listen carefully to what the learner says in the attached audio recording. If the audio is silent, noise-only, or unclear, say honestly that you could not hear clear speech and ask them to try recording again—never guess or invent what they said.";

  const obs = (params.speechObservations || []).filter(Boolean);
  const evidenceBlock =
    params.summaryObservation || obs.length > 0
      ? [
          "Validated audible speech evidence from live analysis (optional subtle context; keep separate from internal feelings):",
          params.summaryObservation ? `- Summary: ${params.summaryObservation}` : "",
          obs.length > 0 ? `- Audible moments: ${obs.slice(0, 4).join("; ")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "Validated audible speech evidence: None available for this clip—do not invent any acoustic findings.";

  const task = params.isReadingSample
    ? "In 1-2 warm, natural sentences, thank the learner for reading the passage in their own ordinary voice, optionally referencing one brief factual detail if helpful, and ask one gentle check-in question about how reading it felt from the inside."
    : "In 2-3 warm, natural sentences, briefly acknowledge one specific detail the learner ACTUALLY said (about themselves, their scene description, or what they want help with when speaking), and ask ONE relevant, open follow-up question grounded in what they shared.";

  return `${COCO_SYSTEM_INSTRUCTION}

Task: Respond as Coco listening during the learner's initial baseline Check-In (${params.sampleTitle}, sample ${params.sampleIndex + 1}).
${speechTermInstruction(params.speechTermMode)}
${CORE_GUARDRAILS}

Invitation you gave the learner:
"${params.questionAsked}"

${transcriptBlock}

${evidenceBlock}

Instructions:
1. ${task}
2. Baseline speaking is for observing ordinary speech—do NOT give speech-mechanics instructions (never tell the learner to slow down, avoid stretching, change their breathing, or insert pauses).
3. Keep any audible observation strictly separate from internal feelings or psychology—never guess or claim the learner felt anxious, tense, ashamed, or nervous unless they explicitly said so.
4. Stay strictly grounded in what the learner actually said—never substitute a generic acknowledgement or invent personal details.`;
}

export function buildPartnerReplyPrompt(params: {
  scenario: string;
  partnerRole: string;
  communicationPurpose: string;
  history: RoleplayTurn[];
  learnerTextInput: string | null;
  hasAudio: boolean;
  isClosingTurn: boolean;
}): string {
  const historyStr =
    params.history.length > 0
      ? params.history
          .map((t) => `${t.speaker === "partner" ? "Partner" : "Learner"}: ${t.message}`)
          .join("\n")
      : "(Opening exchange)";

  const directive = params.isClosingTurn
    ? `- React warmly and specifically to what the learner just said, then bring the conversation to a natural, polite real-world close (for example, thanking them, wishing them well, and saying goodbye).
- Do NOT ask a new open-ended question—leave a clean, natural ending.`
    : `- React genuinely and specifically to what the learner just said, in 1-2 natural conversational sentences.
- Ask a realistic follow-up or move the interaction forward organically.`;

  return `${PARTNER_SYSTEM_INSTRUCTION}

Role: Real, live conversational partner (${params.partnerRole}) in this situation: ${params.scenario}
Learner's communication purpose: ${params.communicationPurpose}

Conversation so far:
${historyStr}

${
  params.learnerTextInput
    ? `Learner's latest reply (text): ${params.learnerTextInput}`
    : "Listen to the learner's latest reply in the attached audio."
}

Instructions:
${directive}
- Keep a patient, ordinary, respectful tone—never coach, never evaluate speech, and never include speaker labels other than the requested format below.
${
  params.hasAudio && !params.learnerTextInput
    ? "Format your response strictly as:\nTRANSCRIPT: <verbatim transcript of what the learner said>\nREPLY: <your 1-2 sentence live partner reply>"
    : "Return only your 1-2 sentence partner reply."
}`;
}

export function buildCheckInDebriefPrompt(params: {
  attempts: SpeechAttempt[];
  events: SpeechEvent[];
  goals: string[];
  situations: string[];
  shiftNote: string;
  speechTermMode: SpeechTermMode;
}): string {
  const checkInAttempts = params.attempts.filter(
    (a) => a.sourceContext.startsWith("check_in_") && isVerifiedSpokenAttempt(a)
  );
  const conditionLines =
    checkInAttempts.length > 0
      ? checkInAttempts
          .map((a) => {
            const evts = params.events.filter(
              (e) => e.attemptId === a.id && e.reviewState !== "dismissed"
            );
            const effortLabel = a.selfReportEffort ? `${a.selfReportEffort}/5` : "skipped/unknown";
            return `- ${a.activityOrSectionId} (${a.sourceContext}, ${a.durationSeconds.toFixed(1)}s, tentativeMoments=${evts.length}, selfEffort=${effortLabel})${
              a.disfluentTranscript ? ` transcript="${a.disfluentTranscript.slice(0, 220)}"` : ""
            }`;
          })
          .join("\n")
      : "- No spoken audio samples recorded yet (respect skipped or written path).";

  const naturalGoals = params.goals
    .map((g) => humanizeGoalPhrase(g))
    .filter((g): g is string => Boolean(g));
  const naturalSituations = params.situations
    .map((s) => humanizeSituationPhrase(s))
    .filter((s): s is string => Boolean(s));

  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco, VocoFlo's speaking coach for adults who ${
    params.speechTermMode === "stuttering" ? "stutter" : "stammer"
  }.
${speechTermInstruction(params.speechTermMode)}
${CORE_GUARDRAILS}

Provide a grounded, calm 4-5 sentence check-in debrief after the learner's Free Check-In.

Learner context:
- Learner goals: ${naturalGoals.join(", ") || "Not specified"}
- Important situations: ${naturalSituations.join(", ") || "Not specified"}
- Shift experiment reflection: ${params.shiftNote || "None shared"}

Per-condition sample evidence (ONLY cite samples actually recorded/analysed below; treat skipped self-reports as unknown, never zero):
${conditionLines}

Strict rules:
1. Ground your observations strictly in the actual samples above and refer to the learner's goals and situations in natural conversational English.
2. Frame every audible observation as tentative and correctable—remind the learner briefly that they can inspect or adjust any moment on the timeline.
3. Keep audible observations separate from internal effort or feelings. If few or zero audible moments appeared, state clearly that smooth-sounding audio never cancels reported internal effort or difficulty.
4. Do NOT diagnose psychology causes, do NOT manufacture severity, do NOT guarantee fluency, and do NOT give premature speech-mechanics commands.
5. Recommend ONE clear next lesson: Module 1 ("Your Identity With Your Speech"), explaining briefly how it connects to what came up in this check-in.`;
}

export interface P01MirrorOpening {
  text: string;
  hasGenuineMemory: boolean;
  groundedContextLabel: string | null;
}

export function buildP01MirrorOpening(params: {
  profile: LearnerProfile | null;
  memories: CoachMemoryItem[];
  attempts: SpeechAttempt[];
  speechTermMode: SpeechTermMode;
}): P01MirrorOpening {
  const goalMem = params.memories.find((m) => m.category === "goal" && m.fact.trim())?.fact;
  const ctxMem = params.memories.find((m) => m.category === "context" && m.fact.trim())?.fact;
  const profileGoal = params.profile?.chosenGoals?.find((g) => g.trim());
  const profileSit = params.profile?.importantSituations?.find((s) => s.trim());

  const chosenSituation =
    humanizeSituationPhrase(profileSit) || humanizeSituationPhrase(ctxMem);
  const chosenGoal = humanizeGoalPhrase(profileGoal) || humanizeGoalPhrase(goalMem);
  const hasRealCheckInAttempt = params.attempts.some(
    (a) =>
      a.sourceContext.startsWith("check_in_") &&
      isVerifiedSpokenAttempt(a) &&
      a.analysisStatus !== "fixture" &&
      Boolean(a.disfluentTranscript?.trim())
  );

  if (!chosenSituation && !chosenGoal && !hasRealCheckInAttempt) {
    const noun = params.speechTermMode === "stuttering" ? "stuttering" : "stammering";
    return {
      text: `Welcome to Your Identity With Your Speech. Before we try a short baseline speaking turn and explore today's core idea, let's check in on one familiar experience: when ${noun} shows up on a word, does that single moment ever start to feel like a statement about who you are as a speaker?`,
      hasGenuineMemory: false,
      groundedContextLabel: null,
    };
  }

  let text: string;
  if (chosenSituation && chosenGoal) {
    text = `Earlier in your Check-In, you mentioned ${chosenSituation} and wanting to focus on ${chosenGoal}. Before we try a short baseline speaking turn, I'm curious: in moments like ${chosenSituation}, does one sticky word ever start to feel like a bigger statement about you as a speaker?`;
  } else if (chosenSituation) {
    text = `Earlier in your Check-In, you shared that ${chosenSituation} is an important place for your voice. Before we try a short baseline speaking turn, does a difficult word in a moment like that ever start to feel like a larger label about who you are?`;
  } else if (chosenGoal) {
    text = `Earlier you shared that you'd like to focus on ${chosenGoal}. Before we try a short baseline speaking turn together, has one difficult speaking moment ever felt like it turned into a larger statement about you as a speaker?`;
  } else {
    text =
      "Thank you for sharing your voice in the Check-In earlier. Before we try our first short speaking turn here, I'd love to check in with you: when a word catches or hesitates, does that single moment ever start to feel like a larger statement about who you are?";
  }

  const label =
    [
      chosenSituation ? `Situation: ${chosenSituation}` : null,
      chosenGoal ? `Goal: ${chosenGoal}` : null,
    ]
      .filter(Boolean)
      .join(" • ") || "Grounded in your Check-In";

  return { text, hasGenuineMemory: true, groundedContextLabel: label };
}

export function buildP01MirrorResponsePrompt(params: {
  choice: P01MirrorChoice;
  learnerNote?: string;
  groundedContextLabel?: string | null;
  recentConversationTurns?: ConversationTurn[];
  speechTermMode: SpeechTermMode;
}): string {
  const behavior: Record<P01MirrorChoice, string> = {
    often:
      "The learner answered 'Often'—meaning one sticky word frequently feels like a bigger statement about themselves. Validate calmly without dramatizing, and invite them into Beat 2 (Speak First) where they'll talk naturally for 20-45 seconds about something they enjoy outside work before any teaching.",
    sometimes:
      "The learner answered 'Sometimes'—meaning that feeling shows up in some moments and not others. Acknowledge that nuance warmly and invite them into Beat 2 (Speak First) to speak naturally before any concept is introduced.",
    rarely:
      "The learner answered 'Rarely'. STRICT RULE: Respect this completely—do NOT pressure them to adopt a negative self-label or insist they secretly carry one. Frame today's session as a practical exploration, then invite them into Beat 2 (Speak First).",
    skip:
      "The learner chose 'Skip'. Respect their choice warmly with zero pressure, and invite them gently into Beat 2 (Speak First) whenever they're ready.",
    speak:
      "The learner responded in their own words. Acknowledge one concrete thing they ACTUALLY shared below, respect their exact perspective without pushing any label, and bridge cleanly to Beat 2 (Speak First).",
  };

  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco in Beat 1 (The Mirror — "Your Identity With Your Speech").
${speechTermInstruction(params.speechTermMode)}
${CORE_GUARDRAILS}

Verified learner context (only if present): ${params.groundedContextLabel || "None (neutral opening)"}
Recent conversation turns in this session (chronological):
${formatConversationHistory(params.recentConversationTurns, 6)}

Learner's Beat 1 selection: ${params.choice}
${params.learnerNote?.trim() ? `Learner's own words: "${params.learnerNote.trim()}"` : "Learner's own words: None added."}

Instructions:
- ${behavior[params.choice]}
- Keep your reply to 2 calm, conversational sentences.
- Do NOT teach the Event-versus-Verdict distinction or Name-Badge metaphor yet (the learner speaks first in Beat 2 before Beat 3 introduces that teaching).
- Never invent remembered facts or assume emotions the learner did not express.`;
}

export function buildP01AttemptResponsePrompt(params: {
  isAttemptTwo: boolean;
  learnerTranscriptOrText: string | null;
  hasDirectAudioAttachment: boolean;
  participationMode?: "recorded" | "spoken_unrecorded" | "typed_only";
  analysisUnavailableReason?: string | null;
  recentConversationTurns?: ConversationTurn[];
  speechTermMode: SpeechTermMode;
}): string {
  const isWrittenFallback = params.participationMode === "typed_only";
  const isSpokenUnrecorded = params.participationMode === "spoken_unrecorded";

  const beatContext = params.isAttemptTwo
    ? `Beat: Beat 4 — The Live Shift (Attempt 2, AFTER learning Event vs. Verdict and the Name-Badge metaphor).
Instructions:
1. Respond warmly to ONE specific, genuine detail the learner ACTUALLY shared below (focusing on their meaning, not grading their speech).
2. Ask ONE natural, conversational follow-up question about what they shared.
3. STRICT RULE: NEVER claim Attempt 2 is an "improvement" or "better" based on fewer detected speech events or acoustic fluency. Do NOT mention event counts.
${isWrittenFallback ? "4. Note: The learner typed this response in writing rather than recording voice audio—respond warmly to their written point without pretending you heard an audio recording." : ""}
${isSpokenUnrecorded ? "4. Note: The learner confirmed they spoke this attempt aloud without recording audio—acknowledge their spoken practice warmly without claiming to have analysed a recording." : ""}
5. Keep your reply to 2-3 calm, human sentences.`
    : `Beat: Beat 2 — Speak First (Baseline Attempt 1, BEFORE the Event-versus-Verdict teaching in Beat 3).
Instructions:
1. Respond warmly to ONE specific, genuine detail the learner ACTUALLY shared below so they know you truly heard their message.
2. Do NOT give speech-mechanics advice, do NOT grade fluency, do NOT cite event counts, and do NOT pre-teach the Event-vs-Verdict concept or Name-Badge metaphor yet.
${isWrittenFallback ? "3. Note: The learner shared this in writing rather than recording audio—respond warmly to their written message without claiming you heard an audio clip." : ""}
${isSpokenUnrecorded ? "3. Note: The learner spoke this aloud without recording—acknowledge their spoken turn warmly without claiming to have analysed an audio clip." : ""}
4. Close gently by inviting them to continue to Beat 3 whenever they're ready to explore today's core idea together.
5. Keep your reply to 2 calm, conversational sentences.`;

  const contentBlock = params.learnerTranscriptOrText?.trim()
    ? `What the learner actually shared:\n"${params.learnerTranscriptOrText.trim()}"`
    : isSpokenUnrecorded
      ? "The learner confirmed they spoke their turn aloud without recording audio and did not add a written summary. Thank them warmly for speaking the turn aloud and invite them to the next step without guessing what topic they chose."
      : params.hasDirectAudioAttachment
        ? "Listen carefully to what the learner says in the attached audio recording. If the audio is silent, noise-only, or unclear, say honestly that you could not hear clear spoken words and invite them to record again—never guess or invent what they said."
        : `Transcript unavailable (${params.analysisUnavailableReason || "not transcribed"}). STRICT RULE: Say honestly that you couldn't read a transcript from that clip, never guess what they talked about, and offer a calm neutral acknowledgement.`;

  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco in "Your Identity With Your Speech".
${speechTermInstruction(params.speechTermMode)}
${CORE_GUARDRAILS}

Recent conversation turns in this session (chronological):
${formatConversationHistory(params.recentConversationTurns, 6)}

${beatContext}

${contentBlock}`;
}

export function buildP01LabelReflectionPrompt(
  learnerLabel: string,
  speechTermMode: SpeechTermMode,
  recentConversationTurns?: ConversationTurn[]
): string {
  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco in Beat 3 (Event vs. Verdict & Name-Badge Metaphor).
${speechTermInstruction(speechTermMode)}
${CORE_GUARDRAILS}

Recent conversation turns in this session (chronological):
${formatConversationHistory(recentConversationTurns, 6)}

The learner optionally shared a familiar label or rule that sometimes shows up for them: "${learnerLabel}"

Instructions:
- In 2 warm, grounded sentences, acknowledge their exact phrase and contrast that broad verdict or rule with a single specific speaking event (like setting a heavy name badge down on the table for one conversation).
- Never diagnose psychology, never push them to adopt extra labels, and never use school-quiz language.`;
}

export function buildP01FollowUpClosingPrompt(
  cocoQuestion: string,
  learnerReply: string,
  speechTermMode: SpeechTermMode,
  recentConversationTurns?: ConversationTurn[]
): string {
  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco closing the brief follow-up in Beat 4 (The Live Shift).
${speechTermInstruction(speechTermMode)}
${CORE_GUARDRAILS}

Recent conversation turns in this session (chronological):
${formatConversationHistory(recentConversationTurns, 6)}

Your follow-up question: "${cocoQuestion}"
Learner's reply: "${learnerReply}"

Instructions:
- In 1-2 warm sentences, respond genuinely to what the learner just answered.
- Do NOT ask another new question—leave space for them to reflect or move to Beat 5 (Transfer).`;
}

/**
 * Strictly scopes reached P01 content to the active beat so unreached lesson
 * concepts never enter Ask Coco's prompt context.
 * - Beat 1 (Mirror): Only P01-01 (welcome & noticing whether a moment feels like a broader picture).
 * - Beat 2 (Speak First): Adds P01-07 (baseline speaking attempt BEFORE Event-vs-Verdict teaching).
 * - Beat 3 (One Idea): Adds P01-02, P01-03 (meeting introduction example), P01-04 (name-badge metaphor),
 *   P01-05 (event vs verdict distinction), and P01-06 (label reflection).
 * - Beat 4 (Live Shift): Adds P01-08 (Attempt 2 with one clear purpose) and P01-10 (review).
 * - Beat 5 (Transfer): Adds P01-11 (real-world message-focused transfer) and P01-12 (closing).
 */
export function getP01SectionsForBeat(activeBeat: P01BeatId): Array<{
  id: string;
  heading: string;
  narration: string;
}> {
  const beatOrder: P01BeatId[] = [
    "p01_beat_1_mirror",
    "p01_beat_2_speak_first",
    "p01_beat_3_one_idea",
    "p01_beat_4_live_shift",
    "p01_beat_5_transfer",
  ];
  const map: Record<P01BeatId, string[]> = {
    p01_beat_1_mirror: ["P01-01"],
    p01_beat_2_speak_first: ["P01-07"],
    p01_beat_3_one_idea: ["P01-02", "P01-03", "P01-04", "P01-05", "P01-06"],
    p01_beat_4_live_shift: ["P01-08", "P01-10"],
    p01_beat_5_transfer: ["P01-11", "P01-12"],
  };
  const activeIdx = Math.max(0, beatOrder.indexOf(activeBeat));
  const reachedIds = new Set(
    beatOrder.slice(0, activeIdx + 1).flatMap((b) => map[b] || [])
  );

  return (p01Content.sections || [])
    .filter((s) => reachedIds.has(s.id))
    .map((s) => {
      let narration = s.narration;
      // In Beat 1 & Beat 2 (before Beat 3 is reached), strip the preview sentence in P01-01
      // that mentions "separate a particular event from a verdict" so unreached Beat 3 teaching
      // does not leak before the baseline speaking attempt.
      if (activeIdx < 2 && s.id === "P01-01") {
        narration =
          "Welcome. In this session, we explore the picture you carry of yourself as a speaker—whether you feel you struggle to speak or feel pressure to always sound confident. Before we look at today's core concept, we begin by noticing how speaking moments feel and trying a relaxed baseline speaking turn.";
      }
      if (activeIdx < 2 && s.id === "P01-07") {
        narration = P01_BEAT_2_SPEAK_FIRST_NARRATION;
      }
      return {
        id: s.id,
        heading: (s as { heading?: string }).heading || s.type,
        narration,
      };
    });
}

export function buildLessonQaPrompt(scope: JourneyScope, learnerQuestion: string): string {
  const reachedBlock =
    scope.reachedSectionSummaries.length > 0
      ? scope.reachedSectionSummaries
          .map((s) => `- ${s.heading}: ${s.narration}`)
          .join("\n")
      : "- Initial orientation only (no lesson teaching sections reached yet).";

  const currentSessionSpoken = (
    scope.currentSessionAttempts ??
    scope.recentAttempts.filter((a) => a.isCurrentSession !== false)
  ).filter(isVerifiedSpokenAttempt);

  const attemptBlock =
    currentSessionSpoken.length > 0
      ? currentSessionSpoken
          .slice(0, 6)
          .map(
            (a) =>
              `- Current session spoken attempt (${a.sourceContext}, ${
                a.participationStatus === "spoken_unrecorded"
                  ? "spoken aloud without recording"
                  : `${a.durationSeconds.toFixed(1)}s recorded`
              })${
                a.disfluentTranscript ? ` transcript="${a.disfluentTranscript}"` : ""
              }${a.summaryObservation ? ` summary="${a.summaryObservation}"` : ""}`
          )
          .join("\n")
      : "No verified spoken recordings in this current session yet.";

  const memoryBlock =
    scope.sharedMemories.length > 0
      ? scope.sharedMemories
          .slice(0, 8)
          .map((m) => {
            const natural =
              m.category === "goal"
                ? humanizeGoalPhrase(m.fact) || m.fact
                : m.category === "context"
                  ? humanizeSituationPhrase(m.fact) || m.fact
                  : m.fact;
            return `- [${m.category}] ${natural}`;
          })
          .join("\n")
      : "None saved yet.";

  const conversationHistoryBlock = formatConversationHistory(
    scope.recentConversationTurns,
    10
  );

  return `${COCO_SYSTEM_INSTRUCTION}

Task: Answer the learner's contextual question in "Ask Coco" while maintaining multi-turn conversation continuity and strictly respecting their current place in the journey.
${speechTermInstruction(scope.speechTermMode)}
${CORE_GUARDRAILS}

Current location: ${scope.currentStageLabel}
Check-In completed: ${scope.checkInCompleted ? "Yes" : "Not yet"}
Completed steps so far: ${scope.completedStepTitles.join(", ") || "None yet"}
Unreached upcoming steps (STRICT BOUNDARY — DO NOT spoil, teach, preview, or pretend these are completed): ${
    scope.unreachedStepTitles.join(", ") || "None"
  }

Lesson material reached so far (ONLY draw lesson concepts from here):
${reachedBlock}

Current-session verified spoken attempts & observations:
${attemptBlock}

Long-term shared learner memories (separately scoped background context):
${memoryBlock}

Recent Ask Coco conversation history (current session, chronological order oldest to newest):
${conversationHistoryBlock}

Learner's latest question:
"${learnerQuestion}"

Strict Rules:
1. Maintain direct continuity with the Recent Ask Coco conversation history above—if the learner refers to a situation, word, or question from an earlier turn (such as ordering at a café or saying their name), recall and build on those exact details accurately without inventing extra facts.
2. Answer warmly and concisely (2-4 spoken sentences) grounded ONLY in the reached material, recent conversation turns, current-session verified spoken attempts, and shared memories above.
3. Never teach or preview unreached upcoming steps, never claim unreached steps were completed, and never fabricate facts or transcripts.`;
}

export interface ProvisionalFocusWeek {
  weekNumber: number;
  focusTitle: string;
  suggestedToolIds: string[];
  focusAreasLabel: string;
  rationale: string;
}

export interface ProvisionalFocusPlan {
  headline: string;
  disclaimer: string;
  groundedSummary: string;
  weeks: ProvisionalFocusWeek[];
}

export function buildProvisionalRoadmap(params: {
  profile: LearnerProfile | null;
  memories: CoachMemoryItem[];
  beat4Feeling: P01ShiftFeeling | null;
}): ProvisionalFocusPlan {
  const situations = (params.profile?.importantSituations || [])
    .map((s) => humanizeSituationPhrase(s))
    .filter((s): s is string => Boolean(s));
  const goals = (params.profile?.chosenGoals || [])
    .concat(params.memories.filter((m) => m.category === "goal").map((m) => m.fact))
    .map((g) => humanizeGoalPhrase(g))
    .filter((g): g is string => Boolean(g));

  const contextPhrase =
    situations.length > 0
      ? situations.slice(0, 2).join(" and ")
      : goals[0] || "everyday conversations at your own pace";

  const feelingNote =
    params.beat4Feeling === "lighter"
      ? "Since shifting focus to your message felt lighter today, we can keep building on that openness."
      : params.beat4Feeling === "harder"
        ? "Since the second attempt felt harder today, we can keep early steps unhurried and add calm physical supports."
        : params.beat4Feeling === "similar"
          ? "Since both attempts felt similar today, steady practice in low-stakes moments is a solid next step."
          : "You choose the pace at every step—Continue, Repeat, or Gentler Practice are always yours.";

  return {
    headline: "Initial 4-Week Recommended Focus (Provisional)",
    disclaimer:
      "This is an initial recommended focus based on what you shared—not a diagnosis, fixed schedule, or guaranteed outcome. You can Continue, Repeat, or pick Gentler Practice anytime.",
    groundedSummary: `Oriented around ${contextPhrase}. ${feelingNote}`,
    weeks: [
      {
        weekNumber: 1,
        focusTitle: "Safety, Self-Permission & Calm Starts",
        suggestedToolIds: ["P01", "B01", "P05"],
        focusAreasLabel: "Identity Perspective • Easy Airflow Starts • Self-Permission",
        rationale:
          "Separate single speaking events from self-verdicts and explore comfortable moving-air starts.",
      },
      {
        weekNumber: 2,
        focusTitle: "Noticing Tension & Staying With Meaning",
        suggestedToolIds: ["B03", "B07", "P06"],
        focusAreasLabel: "Unhurried Pauses • Releasing Bracing • Listener Focus",
        rationale: `Try comfortable pauses and noticing unnecessary bracing in situations like ${contextPhrase}.`,
      },
      {
        weekNumber: 3,
        focusTitle: "Gentle Pace & Low-Stakes Conversation",
        suggestedToolIds: ["B02", "B04", "P02"],
        focusAreasLabel: "Gentle Phrasing • Before-I-Speak Prep • Live Practice",
        rationale:
          "Pair gentle phrasing with responsive two-way conversation and optional preparation.",
      },
      {
        weekNumber: 4,
        focusTitle: "Real-World Participation & Debrief",
        suggestedToolIds: ["P07", "B05"],
        focusAreasLabel: "Everyday Participation • Post-Conversation Debrief",
        rationale:
          "Carry small chosen intentions into real life and debrief what actually happened afterwards.",
      },
    ],
  };
}
