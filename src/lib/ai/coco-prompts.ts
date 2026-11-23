import p01Content from "@/content/p01.json";
import type {
  CoachMemoryItem,
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
  const checkInAttempts = params.attempts.filter((a) =>
    a.sourceContext.startsWith("check_in_")
  );
  const conditionLines =
    checkInAttempts.length > 0
      ? checkInAttempts
          .map((a) => {
            const evts = params.events.filter(
              (e) => e.attemptId === a.id && e.reviewState !== "dismissed"
            );
            const effortLabel = a.selfReportEffort ? `${a.selfReportEffort}/5` : "skipped/unknown";
            return `- ${a.activityOrSectionId} (${a.sourceContext}, ${a.durationSeconds.toFixed(1)}s, status=${a.analysisStatus}, tentativeMoments=${evts.length}, selfEffort=${effortLabel})${
              a.disfluentTranscript ? ` transcript="${a.disfluentTranscript.slice(0, 220)}"` : ""
            }`;
          })
          .join("\n")
      : "- No audio samples recorded yet (respect skipped/typed path).";

  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco, VocoFlo's speaking coach for adults who ${
    params.speechTermMode === "stuttering" ? "stutter" : "stammer"
  }.
${speechTermInstruction(params.speechTermMode)}
${CORE_GUARDRAILS}

Provide a grounded, calm 4-5 sentence check-in debrief after the learner's Free Check-In.

Learner context:
- Learner goals: ${params.goals.join(", ") || "Not specified"}
- Important situations: ${params.situations.join(", ") || "Not specified"}
- Shift experiment reflection: ${params.shiftNote || "None shared"}

Per-condition sample evidence (ONLY cite samples actually recorded/analysed below; treat skipped self-reports as unknown, never zero):
${conditionLines}

Strict rules:
1. Ground your observations strictly in the actual samples above.
2. Frame every audible observation as tentative and correctable—remind the learner briefly that they can inspect or adjust any moment on the timeline.
3. Keep audible observations separate from internal effort or feelings. If few or zero audible moments appeared, state clearly that smooth-sounding audio never cancels reported internal effort or difficulty.
4. Do NOT diagnose psychology causes, do NOT manufacture severity, do NOT guarantee fluency, and do NOT give premature speech-mechanics commands.
5. Recommend ONE clear next tool: P01 ("Your Identity With Your Speech"), explaining briefly how it connects to what came up in this check-in.`;
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
  const cleanSnippet = (raw: string | undefined): string | null => {
    if (!raw) return null;
    const cleaned = raw
      .replace(/^Important speaking situations:/, "")
      .replace(/^Goal:/, "")
      .replace(/^Completed /, "")
      .trim();
    const first = cleaned.split(/[,;\n]/)[0]?.trim() || "";
    return first.length >= 3 && first.length <= 90 ? first : null;
  };

  const goalMem = params.memories.find((m) => m.category === "goal" && m.fact.trim())?.fact;
  const ctxMem = params.memories.find((m) => m.category === "context" && m.fact.trim())?.fact;
  const profileGoal = params.profile?.chosenGoals?.find((g) => g.trim());
  const profileSit = params.profile?.importantSituations?.find((s) => s.trim());

  const chosenSituation = cleanSnippet(profileSit) || cleanSnippet(ctxMem);
  const chosenGoal = cleanSnippet(profileGoal) || cleanSnippet(goalMem);
  const hasRealCheckInAttempt = params.attempts.some(
    (a) =>
      a.sourceContext.startsWith("check_in_") &&
      a.analysisStatus !== "fixture" &&
      Boolean(a.disfluentTranscript?.trim())
  );

  if (!chosenSituation && !chosenGoal && !hasRealCheckInAttempt) {
    const noun = params.speechTermMode === "stuttering" ? "stuttering" : "stammering";
    return {
      text: `Welcome to P01. Before we explore any idea, let's start with something ordinary: when ${noun} shows up on one word, does that single moment ever quietly expand into a bigger verdict about who you are as a speaker?`,
      hasGenuineMemory: false,
      groundedContextLabel: null,
    };
  }

  let text: string;
  if (chosenSituation && chosenGoal) {
    text = `Earlier in your Check-In you mentioned ${chosenSituation} and wanting to work toward ${chosenGoal}. Before we unpack P01, I'm curious: in moments like ${chosenSituation}, does one difficult word ever quietly turn into a bigger verdict about yourself as a speaker?`;
  } else if (chosenSituation) {
    text = `In your Check-In, ${chosenSituation} stood out as an important place for your voice. Before we explore P01's core idea, does a sticky word in a moment like that ever quietly grow into a larger label about who you are?`;
  } else if (chosenGoal) {
    text = `You shared earlier that you're aiming for ${chosenGoal}. As we step into P01 together, has one difficult speaking moment ever felt like it became a verdict about you as a speaker rather than just one moment?`;
  } else {
    text =
      "Thank you for sharing your voice in the Check-In earlier. As we begin P01, I'd love to check in with you: when a word catches or pauses, does that single event ever turn into a much bigger label about who you are?";
  }

  const label =
    [
      chosenSituation ? `Context: ${chosenSituation}` : null,
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
  speechTermMode: SpeechTermMode;
}): string {
  const behavior: Record<P01MirrorChoice, string> = {
    often:
      "The learner answered 'Often'—meaning one sticky word frequently turns into a larger verdict about themselves. Validate calmly without dramatizing, and bridge cleanly to Beat 2 (Speak First) where they'll talk for 20-40 seconds about something ordinary they enjoy.",
    sometimes:
      "The learner answered 'Sometimes'—meaning that verdict shows up in some moments and not others. Acknowledge that nuance warmly and bridge cleanly to Beat 2 (Speak First).",
    rarely:
      "The learner answered 'Rarely'. STRICT RULE: Respect this completely—do NOT pressure them to adopt a negative self-label or insist they secretly carry one. Frame P01 as a practical check-in on keeping speaking events specific and light, then bridge cleanly to Beat 2 (Speak First).",
    skip:
      "The learner chose 'Skip'. Respect their choice warmly with zero pressure, and invite them gently into Beat 2 (Speak First) whenever they're ready.",
    speak:
      "The learner responded in their own words. Acknowledge one concrete thing they ACTUALLY wrote below, respect their exact perspective without pushing any label, and bridge cleanly to Beat 2 (Speak First).",
  };

  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco in P01 Beat 1 (The Mirror — "Your Identity With Your Speech").
${speechTermInstruction(params.speechTermMode)}
${CORE_GUARDRAILS}

Verified learner context (only if present): ${params.groundedContextLabel || "None (neutral opening)"}
Learner's Beat 1 selection: ${params.choice}
${params.learnerNote?.trim() ? `Learner's own words: "${params.learnerNote.trim()}"` : "Learner's own words: None added."}

Instructions:
- ${behavior[params.choice]}
- Keep your reply to 2 calm, conversational sentences.
- Do not teach the full name-badge metaphor yet (that arrives in Beat 3).
- Never invent remembered facts or assume emotions the learner did not express.`;
}

export function buildP01AttemptResponsePrompt(params: {
  isAttemptTwo: boolean;
  learnerTranscriptOrText: string | null;
  hasDirectAudioAttachment: boolean;
  analysisUnavailableReason?: string | null;
  speechTermMode: SpeechTermMode;
}): string {
  const beatContext = params.isAttemptTwo
    ? `Beat: P01 Beat 4 — The Live Shift (Attempt 2, AFTER learning Event vs. Verdict and the Name-Badge metaphor).
Instructions:
1. Respond warmly to ONE specific, genuine detail the learner ACTUALLY talked about below (focusing on meaning, not speech grading).
2. Ask ONE natural, conversational follow-up question about what they shared.
3. STRICT RULE: NEVER claim Attempt 2 is an "improvement" or "better" based on fewer detected speech events or acoustic fluency. Do NOT mention event counts.
4. Keep your reply to 2-3 calm, human sentences.`
    : `Beat: P01 Beat 2 — Speak First (Attempt 1, BEFORE teaching).
Instructions:
1. Respond warmly to ONE specific, genuine detail the learner ACTUALLY talked about below so they know you truly heard their meaning.
2. Do NOT give speech-mechanics advice, do NOT grade fluency, and do NOT cite event counts here.
3. Close gently by inviting them to look at P01's core distinction (Event vs. Verdict) whenever they're ready.
4. Keep your reply to 2 calm, conversational sentences.`;

  const contentBlock = params.learnerTranscriptOrText?.trim()
    ? `What the learner actually shared:\n"${params.learnerTranscriptOrText.trim()}"`
    : params.hasDirectAudioAttachment
      ? "Listen carefully to what the learner says in the attached audio recording. If the audio is silent, noise-only, or unclear, say honestly that you could not hear clear spoken words and invite them to record again—never guess or invent what they said."
      : `Transcript unavailable (${params.analysisUnavailableReason || "not transcribed"}). STRICT RULE: Say honestly that you couldn't read a transcript from that clip, never guess what they talked about, and offer a calm neutral acknowledgement.`;

  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco in P01 ("Your Identity With Your Speech").
${speechTermInstruction(params.speechTermMode)}
${CORE_GUARDRAILS}

${beatContext}

${contentBlock}`;
}

export function buildP01LabelReflectionPrompt(
  learnerLabel: string,
  speechTermMode: SpeechTermMode
): string {
  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco in P01 Beat 3 (One Idea & Name-Badge Metaphor).
${speechTermInstruction(speechTermMode)}
${CORE_GUARDRAILS}

The learner optionally shared a familiar label or thought that sometimes shows up for them: "${learnerLabel}"

Instructions:
- In 2 warm, grounded sentences, acknowledge their exact phrase and contrast that global verdict with a single specific speaking event (like setting a heavy name badge down on the table for one conversation).
- Never diagnose psychology, never push them to adopt extra labels, and never use school-quiz language.`;
}

export function buildP01FollowUpClosingPrompt(
  cocoQuestion: string,
  learnerReply: string,
  speechTermMode: SpeechTermMode
): string {
  return `${COCO_SYSTEM_INSTRUCTION}

Role: Coco closing the brief follow-up in P01 Beat 4 (The Live Shift).
${speechTermInstruction(speechTermMode)}
${CORE_GUARDRAILS}

Your follow-up question: "${cocoQuestion}"
Learner's reply: "${learnerReply}"

Instructions:
- In 1-2 warm sentences, respond genuinely to what the learner just answered.
- Do NOT ask another new question—leave space for them to optionally compare attempts, note how it felt, or move to Beat 5 (Transfer).`;
}

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
    p01_beat_1_mirror: ["P01-01", "P01-02"],
    p01_beat_2_speak_first: ["P01-07"],
    p01_beat_3_one_idea: ["P01-03", "P01-04", "P01-05", "P01-06", "P01-08"],
    p01_beat_4_live_shift: ["P01-09", "P01-10"],
    p01_beat_5_transfer: ["P01-11", "P01-12"],
  };
  const activeIdx = beatOrder.indexOf(activeBeat);
  const reachedIds = new Set(
    beatOrder.slice(0, activeIdx + 1).flatMap((b) => map[b] || [])
  );
  return (p01Content.sections || [])
    .filter((s) => reachedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      heading: (s as { heading?: string }).heading || s.type,
      narration: s.narration,
    }));
}

export function buildLessonQaPrompt(scope: JourneyScope, learnerQuestion: string): string {
  const reachedBlock =
    scope.reachedSectionSummaries.length > 0
      ? scope.reachedSectionSummaries
          .map((s) => `- ${s.id} (${s.heading}): ${s.narration}`)
          .join("\n")
      : "- Initial orientation only (no P01 sections reached yet).";

  const attemptBlock =
    scope.recentAttempts.length > 0
      ? scope.recentAttempts
          .slice(0, 6)
          .map(
            (a) =>
              `- ${a.sourceContext} / ${a.activityOrSectionId} (${a.durationSeconds.toFixed(1)}s, status=${a.analysisStatus})${
                a.disfluentTranscript ? ` transcript="${a.disfluentTranscript}"` : ""
              }${a.summaryObservation ? ` summary="${a.summaryObservation}"` : ""}`
          )
          .join("\n")
      : "None recorded yet.";

  const memoryBlock =
    scope.sharedMemories.length > 0
      ? scope.sharedMemories.slice(0, 8).map((m) => `- [${m.category}] ${m.fact}`).join("\n")
      : "None shared yet.";

  return `${COCO_SYSTEM_INSTRUCTION}

Task: Answer the learner's contextual question in "Ask Coco" while strictly respecting their current place in the journey.
${speechTermInstruction(scope.speechTermMode)}
${CORE_GUARDRAILS}

Current location: ${scope.currentStageLabel}
Check-In completed: ${scope.checkInCompleted ? "Yes" : "Not yet"}
Completed steps so far: ${scope.completedStepTitles.join(", ") || "None yet"}
Unreached upcoming steps (DO NOT spoil, preview, or pretend these are completed): ${
    scope.unreachedStepTitles.join(", ") || "None"
  }

Authored material reached so far:
${reachedBlock}

Verified speech attempts & observations:
${attemptBlock}

Shared learner memories (user-approved only):
${memoryBlock}

Learner's question:
"${learnerQuestion}"

Strict Rules:
1. Answer warmly and concisely (2-4 spoken sentences) grounded ONLY in the reached material, real verified attempts, and shared memories above.
2. Never claim unreached steps were completed, and never fabricate facts or transcripts.`;
}

export interface ProvisionalFocusWeek {
  weekNumber: number;
  focusTitle: string;
  suggestedToolIds: string[];
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
  const situations = (params.profile?.importantSituations || []).filter((s) => s.trim());
  const goals = (params.profile?.chosenGoals || [])
    .filter((g) => g.trim())
    .concat(
      params.memories.filter((m) => m.category === "goal").map((m) => m.fact)
    );
  const contextPhrase =
    situations.length > 0
      ? situations.slice(0, 2).join(" and ")
      : goals[0]?.slice(0, 70) || "everyday conversations at your own pace";

  const feelingNote =
    params.beat4Feeling === "lighter"
      ? "Since shifting focus felt lighter in Beat 4, we can keep building on that openness."
      : params.beat4Feeling === "harder"
        ? "Since Beat 4 felt harder, we can keep early steps unhurried and add calm body supports."
        : params.beat4Feeling === "similar"
          ? "Since Beat 4 felt similar, steady repetition in low-stakes moments is a solid next step."
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
        rationale:
          "Separate speaking events from self-verdicts and explore comfortable moving-air starts.",
      },
      {
        weekNumber: 2,
        focusTitle: "Noticing Tension & Staying With Meaning",
        suggestedToolIds: ["B03", "B07", "P06"],
        rationale: `Try comfortable pauses and noticing unnecessary bracing in situations like ${contextPhrase}.`,
      },
      {
        weekNumber: 3,
        focusTitle: "Gentle Pace & Low-Stakes Sparring",
        suggestedToolIds: ["B02", "B04", "P02"],
        rationale:
          "Pair gentle phrasing with responsive Live Sparring and optional Before-I-Speak prep.",
      },
      {
        weekNumber: 4,
        focusTitle: "Real-World Participation & Debrief",
        suggestedToolIds: ["P07", "B05"],
        rationale:
          "Carry small chosen intentions into real life and debrief what actually happened afterwards.",
      },
    ],
  };
}
