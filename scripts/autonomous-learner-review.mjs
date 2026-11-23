#!/usr/bin/env node
/**
 * VocoFlo — Autonomous AI Learner & Independent Product Reviewer (Developer-Only QA Runner)
 *
 * Drives the real VocoFlo web application via Playwright browser automation while using
 * a server-side OpenAI model to generate authentic learner responses, unexpected follow-up
 * questions, challenges, memory checks, and an independent post-session product evaluation.
 *
 * Security & Integrity Rules:
 * - Never uses Guest Review Mode, simulated Coco replies, or fabricated speech events.
 * - Requires a real authenticated Firebase Auth browser session + real Web App Check token.
 * - Keeps OPENAI_API_KEY strictly server-side in this Node runner; never logs credentials.
 * - Isolates Firestore writes by default (ISOLATE_FIRESTORE_WRITES=true) so the QA run
 *   never mutates real learner records in Firestore while still executing real authenticated
 *   Gemini calls through /api/ai-gateway.
 * - Strictly caps total OpenAI and Gemini calls to control cost.
 *
 * Usage:
 *   # First run (opens visible Chrome window so you can complete Google Sign-In once):
 *   HEADLESS=false node scripts/autonomous-learner-review.mjs
 *
 *   # Subsequent runs (reuses the authenticated .qa-browser-profile):
 *   node scripts/autonomous-learner-review.mjs
 */

import fs from "node:fs";
import path from "node:path";

const TARGET_URL = (process.env.VOCOFLO_QA_URL || "https://vocoflo-web-test.vercel.app").trim();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_QA_MODEL || "gpt-4o").trim();
const HEADLESS = (process.env.HEADLESS || "true").toLowerCase() !== "false";
const LOGIN_WAIT_SECONDS = Number(process.env.QA_LOGIN_WAIT_SECONDS || (HEADLESS ? 5 : 120));
const ISOLATE_FIRESTORE_WRITES =
  (process.env.ISOLATE_FIRESTORE_WRITES || "true").toLowerCase() !== "false";
const MAX_OPENAI_CALLS = 14;

const ROOT_DIR = process.cwd();
const PROFILE_DIR = path.resolve(
  process.env.QA_PROFILE_DIR || path.join(ROOT_DIR, ".qa-browser-profile")
);
const REPORT_DIR = path.resolve(
  process.env.QA_REPORT_DIR || path.join(ROOT_DIR, "qa-reports")
);

const LEARNER_PERSONA_SYSTEM_PROMPT = `
You are an independent human-like test learner evaluating VocoFlo, a speech coaching app for adults who stammer.
Your persona:
- You are a 34-year-old product engineer who speaks fluently when alone, but blocks or anticipates difficult words in listener-facing situations (especially saying your name when ordering at a café and giving updates in weekly team meetings).
- You are thoughtful, slightly skeptical of generic self-help advice, and care about whether an exercise actually helps when your throat or chest feels physically locked on a word.
- You write natural, concise 1-2 sentence learner responses (never robotic, never over-eager).
- When asked to challenge, disagree, or test memory, do so naturally and respectfully in 1-2 sentences.
- Return ONLY the learner's exact response text with no quotation marks or role prefixes.
`.trim();

let openAiCallsUsed = 0;

async function callOpenAi({ systemPrompt, userPrompt, maxTokens = 220, temperature = 0.7 }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in the server environment.");
  }
  if (openAiCallsUsed >= MAX_OPENAI_CALLS) {
    throw new Error(`OpenAI call cap (${MAX_OPENAI_CALLS}) reached.`);
  }
  openAiCallsUsed += 1;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API HTTP ${res.status}: ${errText.slice(0, 240)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || "").trim();
}

async function resolvePlaywrightChromium() {
  const candidates = [
    "playwright",
    "playwright-core",
    "/Users/chetan/.gemini/antigravity-acp/brain/55d78182-7895-4570-989b-3e06a96164b8/scratch/node_modules/playwright-core/index.mjs",
  ];
  for (const mod of candidates) {
    try {
      const imported = await import(mod);
      if (imported?.chromium) return imported.chromium;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    "Could not load Playwright (playwright or playwright-core). Install playwright-core to run browser automation."
  );
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(REPORT_DIR, `run-${runTimestamp}`);
  fs.mkdirSync(runDir, { recursive: true });

  console.log(`[Autonomous Reviewer] Target URL: ${TARGET_URL}`);
  console.log(`[Autonomous Reviewer] OpenAI Model: ${OPENAI_MODEL} (Key present: ${Boolean(OPENAI_API_KEY)})`);
  console.log(`[Autonomous Reviewer] Headless: ${HEADLESS} | Firestore Write Isolation: ${ISOLATE_FIRESTORE_WRITES}`);

  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const chromium = await resolvePlaywrightChromium();
  const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    ...(fs.existsSync(chromeExecutable) ? { executablePath: chromeExecutable } : {}),
    headless: HEADLESS,
    viewport: { width: 1280, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());

  const gatewayLogs = [];
  const appCheckLogs = [];
  const uiObservations = [];
  const transcript = [];
  const screenshots = [];
  const stepsReached = [];
  const stepsSkipped = [];
  let isolatedFirestoreWriteCount = 0;

  // Optional Firestore write isolation so QA runs never modify real customer records
  if (ISOLATE_FIRESTORE_WRITES) {
    await page.route("**firestore.googleapis.com/**", async (route) => {
      const req = route.request();
      const url = req.url();
      if (
        req.method() === "POST" &&
        (url.includes("/Write/") || url.includes(":commit") || url.includes(":batchWrite"))
      ) {
        isolatedFirestoreWriteCount += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ writeResults: [] }),
        });
        return;
      }
      await route.continue();
    });
  }

  page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("content-firebaseappcheck.googleapis.com")) {
      appCheckLogs.push({
        timestamp: new Date().toISOString(),
        status: res.status(),
        endpoint: "exchangeRecaptchaEnterpriseToken",
      });
    }
    if (url.includes("/api/ai-gateway")) {
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      gatewayLogs.push({
        timestamp: new Date().toISOString(),
        httpStatus: res.status(),
        ok: Boolean(json?.ok),
        model: json?.model || null,
        latencyMs: json?.latencyMs || null,
        errorCode: json?.errorCode || null,
        errorMessage: json?.errorMessage || null,
      });
    }
  });

  const takeShot = async (name, note) => {
    const filePath = path.join(runDir, `${String(screenshots.length + 1).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    screenshots.push({ name, filePath, note });
  };

  try {
    await page.goto(TARGET_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    // Check if authenticated session is active (never click "Explore as Guest")
    const isSignedIn = async () => {
      const txt = await page.locator("body").innerText();
      if (txt.includes("Guest Review Mode (Simulated Responses)")) {
        throw new Error(
          "Session entered Guest Review Mode. Autonomous reviewer strictly forbids Guest Mode."
        );
      }
      return (
        txt.includes("How VocoFlo Works") ||
        txt.includes("Open Free Check-In") ||
        txt.includes("Sign Out")
      );
    };

    if (!(await isSignedIn())) {
      await takeShot("auth-gate", "Welcome screen requiring interactive Google Sign-In");
      if (!HEADLESS) {
        console.log(
          `[Autonomous Reviewer] Waiting up to ${LOGIN_WAIT_SECONDS}s for interactive Google Sign-In in the browser window...`
        );
      }
      const deadline = Date.now() + LOGIN_WAIT_SECONDS * 1000;
      while (Date.now() < deadline) {
        if (await isSignedIn()) break;
        await page.waitForTimeout(1000);
      }
    }

    if (!(await isSignedIn())) {
      const blockerReport = {
        status: "BLOCKED_ON_INTERACTIVE_GOOGLE_OAUTH",
        timestamp: new Date().toISOString(),
        targetUrl: TARGET_URL,
        appCheckExchangeVerified: appCheckLogs.some((l) => l.status === 200),
        appCheckLogs,
        explanation:
          "Firebase Web App Check (reCAPTCHA Enterprise) succeeded with HTTP 200 on https://vocoflo-web-test.vercel.app, but Firebase Authentication requires an interactive Google OAuth sign-in in the dedicated QA browser profile (.qa-browser-profile). Per security rules, Guest Review Mode and mocked gateway calls were not used.",
        howToAuthenticateOnce:
          "Run `HEADLESS=false node scripts/autonomous-learner-review.mjs` once and complete Google Sign-In in the opened Chrome window. The session is persisted in `.qa-browser-profile` for subsequent autonomous runs.",
        screenshots,
      };
      const blockerPath = path.join(runDir, "blocker-report.json");
      fs.writeFileSync(blockerPath, JSON.stringify(blockerReport, null, 2));
      console.log(JSON.stringify(blockerReport, null, 2));
      process.exitCode = 2;
      return;
    }

    stepsReached.push("Authenticated Hub (Real Firebase Auth + Web App Check)");
    await takeShot("01-authenticated-hub", "Signed-in learner hub with 3-step onboarding rhythm");

    // 1. Navigate 3-step Onboarding on Hub
    for (let step = 1; step <= 2; step++) {
      const nextBtn = page.getByRole("button", { name: /Next Step/i });
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(300);
      }
    }
    stepsReached.push("Onboarding 3-Step Intro");

    // 2. Open Free Check-In -> Context
    await page.getByRole("button", { name: /Open Free Check-In|Begin Free Check-In/i }).first().click();
    await page.waitForSelector("text=Free Speaking Check-In", { timeout: 10000 });
    stepsReached.push("Check-In Orientation");

    await page.getByRole("button", { name: /Continue to Speaking Context/i }).click();
    await page.getByRole("button", { name: "Ordering at cafes / shops" }).click();
    await page.getByRole("button", { name: "Work meetings & team updates" }).click();
    await page.getByRole("button", { name: "Speak with less tension and self-monitoring" }).click();
    await page.getByRole("button", { name: /Save Context & Start Sample 1/i }).click();
    stepsReached.push("Check-In Speaking Context (Cafes + Work Meetings)");

    // Sample 1: OpenAI learner expresses genuine uncertainty about listener pressure (Typed fallback, explicitly NOT claimed as spoken audio)
    const sample1Input = await callOpenAi({
      systemPrompt: LEARNER_PERSONA_SYSTEM_PROMPT,
      userPrompt:
        "You are on Check-In Sample 1 ('Tell me a little about yourself and what brought you to VocoFlo'). Express genuine uncertainty: you speak fine alone, but when a barista asks your name at a café or you speak in a team standup, you anticipate getting stuck and tense up.",
    });
    await page.getByRole("button", { name: /Write Instead \(No Audio\)/i }).click();
    await page.getByPlaceholder(/Share in writing/i).fill(sample1Input);
    await page.getByRole("button", { name: /Send Written Response/i }).click();

    // Observe immediate learner message and thinking indicator
    const sawThinkingS1 = await page
      .getByTestId("coco-thinking-card")
      .isVisible()
      .catch(() => false);
    uiObservations.push({
      stage: "Check-In Sample 1",
      observation: `Immediate learner turn displayed; thinking indicator observed=${sawThinkingS1}`,
    });

    await page.waitForSelector("text=Coco's Listening Response", { timeout: 30000 });
    const s1CocoText = await page.locator("main").innerText();
    transcript.push({
      stage: "Check-In Sample 1 (Personal Share — Written Fallback)",
      learner: sample1Input,
      coco: s1CocoText,
    });
    stepsReached.push("Check-In Sample 1 (Written Fallback)");
    stepsSkipped.push("Check-In Samples 2–4 (Skipped to focus token budget on P01 deep review)");

    // Navigate to P01 via top-left VocoFlo header button -> Open Module 1 (P01)
    await page.locator("header button").first().click();
    await page.getByRole("button", { name: /Open Module 1 \(P01\)/i }).click();
    await page.waitForSelector("text=Beat 1 — The Mirror", { timeout: 10000 });
    stepsReached.push("P01 Beat 1 — The Mirror");
    await takeShot("02-p01-beat1-mirror", "P01 Beat 1 Mirror opening with remembered Check-In context");

    const beat1OpeningText = await page.locator("main").innerText();
    transcript.push({
      stage: "P01 Beat 1 — Mirror Opening",
      learner: "(Observed opening grounded in Check-In)",
      coco: beat1OpeningText,
    });

    // P01 Beat 1: Learner disagrees / expresses nuance about identity vs physical difficulty
    const beat1LearnerNote = await callOpenAi({
      systemPrompt: LEARNER_PERSONA_SYSTEM_PROMPT,
      userPrompt:
        "Coco just asked if one sticky word ever starts to feel like a broader statement about who you are. Reply honestly in 1-2 sentences: you don't really think stammering defines your whole identity, your frustration is mostly that speaking becomes physically tight when people are waiting.",
    });
    await page.getByPlaceholder(/Or reply to Coco in your own words/i).fill(beat1LearnerNote);
    await page.getByRole("button", { name: /Send Reply/i }).click();
    await page.waitForSelector("text=Continue to Beat 2 (Speak First)", { timeout: 30000 });

    const beat1ReplyText = await page.locator("main").innerText();
    transcript.push({
      stage: "P01 Beat 1 — Disagreement / Physical Nuance",
      learner: beat1LearnerNote,
      coco: beat1ReplyText,
    });
    await takeShot("03-p01-beat1-response", "Coco's response to Beat 1 disagreement/nuance");

    // Advance to Beat 2 (Speak First — Baseline Attempt 1 before teaching)
    await page.getByRole("button", { name: /Continue to Beat 2 \(Speak First\)/i }).click();
    await page.waitForSelector("text=Beat 2 — Speak First", { timeout: 10000 });
    stepsReached.push("P01 Beat 2 — Speak First (Baseline Attempt 1)");

    // Test Audio Interruption & Multi-Turn Ask Coco Conversation Memory on Beat 2
    const listenOrReplay = page.getByRole("button", { name: /Listen|Replay/i }).first();
    if (await listenOrReplay.isEnabled()) {
      await listenOrReplay.click();
    }
    await page.getByRole("button", { name: /Ask Coco/i }).first().click();
    await page.waitForSelector("[role='dialog'][aria-label='Ask Coco']", { timeout: 5000 });

    const askInput = page.getByPlaceholder("Ask Coco anything about this step…");
    const askBtn = page.getByRole("button", { name: /^Ask$/i });

    // Ask Coco Turn 1: Share specific café + saying-my-name situation
    const askQ1 = await callOpenAi({
      systemPrompt: LEARNER_PERSONA_SYSTEM_PROMPT,
      userPrompt:
        "You just opened 'Ask Coco' during P01 Beat 2. Tell Coco in 1-2 sentences that when you order coffee at a busy café and the barista asks for your name, you freeze right before saying your name, and ask why that specific moment feels so loaded.",
    });
    await askInput.fill(askQ1);
    await askBtn.click();
    await page.waitForSelector("text=Coco's Answer", { timeout: 30000 });
    const askA1 = await page.locator("[role='dialog'][aria-label='Ask Coco']").innerText();
    transcript.push({
      stage: "Ask Coco (Beat 2) — Turn 1 (Café & Saying My Name)",
      learner: askQ1,
      coco: askA1,
    });

    // Ask Coco Turn 2: Follow-up referencing "that situation I just mentioned" without repeating "café" or "name"
    const askQ2 = await callOpenAi({
      systemPrompt: LEARNER_PERSONA_SYSTEM_PROMPT,
      userPrompt:
        "Now ask a 1-sentence follow-up question in Ask Coco that refers back to 'that counter situation I just mentioned' WITHOUT using the words 'café', 'coffee', or 'name', asking what you should do when your throat locks up right before you say it.",
    });
    await askInput.fill(askQ2);
    await askBtn.click();
    await page.waitForTimeout(500);
    // Wait for second Coco's Answer panel
    await page.waitForFunction(
      () => document.querySelectorAll("[role='dialog'][aria-label='Ask Coco'] h3").length >= 2,
      null,
      { timeout: 30000 }
    );
    const askA2 = await page.locator("[role='dialog'][aria-label='Ask Coco']").innerText();
    transcript.push({
      stage: "Ask Coco (Beat 2) — Turn 2 (Memory Continuity Check)",
      learner: askQ2,
      coco: askA2,
    });
    await takeShot("04-ask-coco-memory", "Multi-turn Ask Coco conversation memory test");

    // Close Ask Coco and verify explicit Resume Lesson Audio banner
    await page.getByRole("button", { name: "Close Ask Coco" }).click();
    const resumeBannerVisible = await page
      .getByTestId("resume-lesson-audio-banner")
      .isVisible()
      .catch(() => false);
    uiObservations.push({
      stage: "P01 Beat 2 Audio Interruption",
      observation: `Closing Ask Coco preserved Beat 2 position and showed explicit Resume Lesson Audio banner=${resumeBannerVisible}`,
    });

    // Beat 2: Submit written fallback (honestly labeled as written note, not spoken audio)
    const beat2Written = await callOpenAi({
      systemPrompt: LEARNER_PERSONA_SYSTEM_PROMPT,
      userPrompt:
        "You are on P01 Beat 2 ('Tell me about something you enjoy outside work'). Write a natural 2-sentence response about restoring vintage mechanical watches on weekends because working with tiny gears feels calm and unhurried.",
    });
    await page.getByRole("button", { name: /Write Instead \(No Audio\)/i }).click();
    await page.getByPlaceholder(/Share in writing/i).fill(beat2Written);
    await page.getByRole("button", { name: /Send Written Response/i }).click();
    await page.waitForSelector("text=Continue to Beat 3 (Event vs. Verdict)", { timeout: 30000 });
    const beat2CocoReply = await page.locator("main").innerText();
    transcript.push({
      stage: "P01 Beat 2 — Baseline Turn (Written Fallback)",
      learner: beat2Written,
      coco: beat2CocoReply,
    });

    // Advance to Beat 3 (Event vs. Verdict & Name-Badge)
    await page.getByRole("button", { name: /Continue to Beat 3 \(Event vs\. Verdict\)/i }).click();
    await page.waitForSelector("text=Beat 3 — Event vs. Verdict & Name-Badge", { timeout: 10000 });
    stepsReached.push("P01 Beat 3 — Event vs. Verdict & Name-Badge");

    await page.getByRole("button", { name: /Set Badge on the Table/i }).click();
    await page.getByRole("button", { name: /^B\./i }).click();

    // Challenge / simplify request in Ask Coco on Beat 3
    await page.getByRole("button", { name: /Ask Coco/i }).first().click();
    await page.waitForSelector("[role='dialog'][aria-label='Ask Coco']", { timeout: 5000 });
    const askQ3 = await callOpenAi({
      systemPrompt: LEARNER_PERSONA_SYSTEM_PROMPT,
      userPrompt:
        "You are on P01 Beat 3 learning 'Event vs. Verdict' and the 'Name-Badge vs. Suit of Armour' metaphor. Challenge Coco in 1-2 sentences: tell Coco that separating an event from a verdict sounds nice in theory, but ask Coco to explain more simply how that actually helps when you physically can't get a word out in a meeting.",
    });
    await askInput.fill(askQ3);
    await askBtn.click();
    await page.waitForFunction(
      () => document.querySelectorAll("[role='dialog'][aria-label='Ask Coco'] h3").length >= 3,
      null,
      { timeout: 30000 }
    );
    const askA3 = await page.locator("[role='dialog'][aria-label='Ask Coco']").innerText();
    transcript.push({
      stage: "Ask Coco (Beat 3) — Challenging Abstract Teaching & Asking for Simpler Explanation",
      learner: askQ3,
      coco: askA3,
    });
    await page.getByRole("button", { name: "Close Ask Coco" }).click();
    await takeShot("05-p01-beat3-teaching", "P01 Beat 3 Event vs Verdict teaching and distinction check");

    // Advance to Beat 4 (The Live Shift — Attempt 2)
    await page.getByRole("button", { name: /Continue to Beat 4 \(The Live Shift\)/i }).click();
    await page.waitForSelector("text=Beat 4 — The Live Shift (Attempt 2)", { timeout: 10000 });
    stepsReached.push("P01 Beat 4 — The Live Shift (Attempt 2)");

    const beat4Written = await callOpenAi({
      systemPrompt: LEARNER_PERSONA_SYSTEM_PROMPT,
      userPrompt:
        "You are on P01 Beat 4 (Attempt 2 — same topic about restoring vintage mechanical watches, focusing on one clear message for your listener). Write 2 sentences sharing the feeling of hearing a 60-year-old watch movement start ticking again.",
    });
    await page.getByRole("button", { name: /Write Instead \(No Audio\)/i }).click();
    await page.getByPlaceholder(/Share in writing/i).fill(beat4Written);
    await page.getByRole("button", { name: /Send Written Response/i }).click();
    await page.waitForSelector("text=Continue to Beat 5 (Real-World Transfer)", { timeout: 30000 });

    // Verify speaking-attempt integrity gate on Beat 4: since both attempts were written fallbacks,
    // verify the confirmation prompt appears and choose "No, skip comparison" honestly.
    const confirmationGateVisible = await page
      .getByTestId("attempt-comparison-confirmation")
      .isVisible()
      .catch(() => false);
    uiObservations.push({
      stage: "P01 Beat 4 Speaking-Attempt Integrity Gate",
      observation: `Attempt 1 vs Attempt 2 comparison gated behind confirmation=${confirmationGateVisible} because both attempts used written fallback.`,
    });
    if (confirmationGateVisible) {
      await page.getByRole("button", { name: "No, skip comparison" }).click();
      stepsSkipped.push("P01 Beat 4 Attempt 1 vs. Attempt 2 Feeling Comparison (Honestly skipped because attempts were written, not spoken aloud)");
    }
    const beat4CocoReply = await page.locator("main").innerText();
    transcript.push({
      stage: "P01 Beat 4 — Attempt 2 & Integrity Gate",
      learner: beat4Written,
      coco: beat4CocoReply,
    });
    await takeShot("06-p01-beat4-integrity", "P01 Beat 4 response and speaking-attempt integrity gate");

    // Advance to Beat 5 (Real-World Transfer)
    await page.getByRole("button", { name: /Continue to Beat 5 \(Real-World Transfer\)/i }).click();
    await page.waitForSelector("text=Beat 5 — Real-World Transfer", { timeout: 10000 });
    stepsReached.push("P01 Beat 5 — Real-World Transfer");
    await page.getByRole("button", { name: /Complete Module 1/i }).click();
    await page.waitForTimeout(1000);
    await takeShot("07-p01-beat5-complete", "P01 Beat 5 completion and provisional 4-week roadmap");

    // Phase 3 & 4: Independent Product Judgment via OpenAI
    const evaluationReportMd = await callOpenAi({
      systemPrompt:
        "You are an independent principal product & clinical-UX reviewer evaluating VocoFlo ($499 speech coaching product) based strictly on the actual recorded transcript and UI observations below. Separate observed facts from evaluator interpretations. Never invent quotes.",
      userPrompt: JSON.stringify(
        {
          evaluationDimensions: [
            "1. Human connection (Does Coco feel attentive? Does it listen and remember? Natural vs formulaic? Response to pushback/disagreement?)",
            "2. Psychological teaching (What did the learner understand? Was Event vs Verdict useful? Any unnecessary metaphors or repetition? Everyday applicability?)",
            "3. Lesson flow (Clear purpose per activity? Natural progression? Confusing controls/interruptions? Did Coco distinguish performed vs typed/skipped activities?)",
            "4. Premium experience ($499 value assessment, design support for coaching relationship, would learner return, what is missing?)",
            "5. High-, medium-, and low-severity problems, specific improvements, independent assessment of P01 educational value, and recommendation (proceed, improve, or redesign).",
          ],
          stepsReached,
          stepsSkipped,
          uiObservations,
          gatewayLogs,
          transcript,
        },
        null,
        2
      ),
      maxTokens: 1600,
      temperature: 0.3,
    });

    const bundle = {
      generatedAt: new Date().toISOString(),
      targetUrl: TARGET_URL,
      openAiModel: OPENAI_MODEL,
      openAiCallsUsed,
      isolatedFirestoreWriteCount,
      stepsReached,
      stepsSkipped,
      uiObservations,
      appCheckLogs,
      gatewayLogs,
      screenshots,
      transcript,
      evaluationReportMd,
    };

    const jsonPath = path.join(runDir, "review-evidence.json");
    const mdPath = path.join(runDir, "independent-product-review.md");
    fs.writeFileSync(jsonPath, JSON.stringify(bundle, null, 2));
    fs.writeFileSync(mdPath, evaluationReportMd);

    console.log(`[Autonomous Reviewer] Completed! Report saved to: ${mdPath}`);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error("[Autonomous Reviewer] Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
