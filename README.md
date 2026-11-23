# VocoFlo Web Test Harness (`vocoflo-web-test`)

Private browser-based staging evaluation harness for **VocoFlo** covering Welcome & Sign-In, the four-condition Free Speaking Check-In, Coco's contextual responses, the five-beat P01 conversational lesson (*"Your Identity With Your Speech"*), the optional Acoustic Mirror, contextual **Ask Coco**, and privacy-conscious evidence export.

> **Repository & Safeguard Boundary**
> - Separate repository (`VelQuantumTechnologies/vocoflo-web-test`) from the Android app (`vocoflo-coco-hydrogen`), which remains completely read-only and untouched.
> - Deployed strictly to **private Vercel staging** (never modifying `www.vocoflo.com`, Firebase Security Rules, Cloud Functions, Android app registrations, or global quota policies).
> - **Audio Fidelity Note:** Browser Web Audio / `MediaRecorder` capture and HTMLAudio playback (`Sulafat` / `Orus`) are adapted for browsers; audio fidelity relative to Android is not claimed equivalent until tested across target browsers.

---

## Architecture

1. **Same-Origin AI Gateway Proxy (`src/app/api/ai-gateway/route.ts`)**
   - Forwards strictly allowlisted actions (`coach_generate`, `tts_synthesize`, `speech_analysis`) and purposes (`coaching_debrief`, `coco_qa`, `coco_tts`, `assessment_analysis`, `lesson_analysis`, `requested_inspection`, `responsive_roleplay`) to the existing Cloud Function `vocofloAiGateway`.
   - Requires valid `Authorization: Bearer <Firebase ID Token>` and `X-Firebase-AppCheck: <Web App Check Token>` headers; enforces a `3.5 MB` request body limit (under Vercel's `4.5 MB` payload cap) and `60s` timeout.
   - Never logs audio bytes, transcripts, ID tokens, or App Check tokens.
2. **Pre-Generated Audio Cache (`public/narration/*.wav` + `src/content/narration-manifest.json`)**
   - Uses identical `tts_v3` SHA-256 cache keys so scripted Coco (`Sulafat`) and Partner (`Orus`) prompts resolve from bundled WAV assets with **zero live TTS calls**, falling back to `tts_synthesize` (wrapping raw `audio/L16` PCM in RIFF/WAVE headers via `ensureWavBytes`) only for dynamic responses.
3. **Named Firestore Persistence (`src/lib/firebase/repository.ts`)**
   - Connects to the project's named Firestore database (`ai-studio-android-vocofloh-b15877a9-aed4-44f5-88cd-134d702cad3a`) under isolated test accounts (`/users/{uid}`).

---

## Environment Variables

Copy `.env.example` to `.env.local` (never commit `.env.local` or debug tokens):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (`gen-lang-client-0920152353.firebaseapp.com`)
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (`gen-lang-client-0920152353`)
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (`gen-lang-client-0920152353.firebasestorage.app`)
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` (`441309065928`)
- `NEXT_PUBLIC_FIREBASE_APP_ID` (`1:441309065928:web:b6c199a092279805c86bfd`)
- `NEXT_PUBLIC_FIRESTORE_DATABASE_ID` (`ai-studio-android-vocofloh-b15877a9-aed4-44f5-88cd-134d702cad3a`)
- `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` (Web reCAPTCHA Enterprise site key linked to Firebase App Check for the Web App)
- `VOCOFLO_AI_GATEWAY_URL` (`https://vocofloaigateway-i2vkb7nxrq-uc.a.run.app`)
- `NEXT_PUBLIC_ENABLE_GUEST_REVIEW_MODE` (`true` by default; set to `false` to disable **Explore as Guest**)

Never set `NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN` in Vercel staging/production builds.

---

## Local Development & Verification

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

---

## Firebase Console Checklist (Web App & Private Staging Only)

1. **Web App Check (`1:441309065928:web:b6c199a092279805c86bfd`)**:
   - Register a Web reCAPTCHA Enterprise key in Google Cloud / reCAPTCHA Enterprise allowing only `localhost` and the private Vercel staging hostname (`*.vercel.app` or exact staging domain — never `www.vocoflo.com`).
   - Bind that site key to Web App `VocoFlo Web Test` (`1:441309065928:web:b6c199a092279805c86bfd`) under Firebase Console → App Check. Do **not** alter existing Android app registrations or enforcement policies.
2. **Firebase Authentication Authorized Domains**:
   - Add the exact private Vercel staging hostname under Firebase Console → Authentication → Settings → Authorized domains.

---

## Independent Reviewer Walkthrough (Check-In → P01)

1. Open the protected Vercel staging URL and sign in with an **isolated test Google account** (do not use your primary Android learner account).
2. Review the **How VocoFlo Works** 3-step paged intro (`Next Step` → `Begin Free Check-In`).
3. **Free Speaking Check-In (Flow A)**:
   - Listen to or read Orientation, then select everyday speaking situations, goals, and terminology (`stammering` / `stuttering`).
   - On first mic tap, review the explicit **Microphone & Speech Processing Notice** (`VocoFlo speech detection model`); agreeing starts recording directly.
   - Complete **Samples 1–4** (personal share, sunny park/cafe scene description, short reading passage, and live two-way conversation with Partner `Orus` up to 6 turns). Optionally open **Acoustic Mirror** to seek, confirm, dismiss, relabel, or add moments.
   - Try the **Purpose-Shift Experiment** and wait for **Coco's Check-In Debrief** (`Begin Module P01` unlocks once debrief finishes speaking or is paused).
4. **Module P01 — Five Beats (Flow B)**:
   - **Beat 1 (The Mirror)**: Verify Coco references your saved Check-In situations/goals (or uses a neutral opening if skipped), select `Often / Sometimes / Rarely / Skip` or write a thought.
   - **Beat 2 (Speak First — Attempt 1)**: Record or type a ~20–45s interest clip and verify Coco responds specifically to what you shared.
   - **Beat 3 (One Idea & Name-Badge)**: Toggle *"Set Badge on the Table"*, answer the 3-card distinction check, and optionally reflect on a familiar label.
   - **Beat 4 (The Live Shift — Attempt 2)**: Record Attempt 2, reply to Coco's follow-up, and compare Attempt 1 vs Attempt 2 side-by-side in Acoustic Mirror.
   - **Beat 5 (Transfer & Focus)**: Explicitly choose whether to save or decline the Transfer Plan, complete P01, and inspect the Provisional 4-Week Focus.
5. **Ask Coco & Evidence Export**:
   - Open **Ask Coco** from any beat to verify journey-scoped Q&A without spoiling unreached beats.
   - Click **Evidence & Export** to inspect chronological timestamps, gateway calls, and Coco responses, and download `.md` / `.json` (transcripts OFF by default; per-clip local audio downloadable separately).
