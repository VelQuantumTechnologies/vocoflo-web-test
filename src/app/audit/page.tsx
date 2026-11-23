"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { callTrustedAiGateway, type GatewayCallResult } from "@/lib/ai/gateway-client";
import { COCO_SYSTEM_INSTRUCTION } from "@/lib/ai/coco-prompts";
import { blobToBase64, MAX_WEB_AUDIO_UPLOAD_BYTES, pickSupportedAudioMimeType } from "@/lib/audio/recorder";
import { ensureWebAppCheck, getFirebaseClientAuth, getGoogleProvider } from "@/lib/firebase/client";

type AuditRecord = {
  kind: "coaching" | "speech_analysis";
  scenario: string;
  input: string;
  output: string;
  ok: boolean;
  status: number;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  error?: string;
  timestamp: string;
};

const SCENARIOS = [
  {
    name: "A · Listener pressure",
    learner: "I speak normally alone, but when someone listens I anticipate difficult words and sometimes avoid speaking.",
    instruction: "You have just heard this during a real learner check-in. Respond to the meaning first in 1–3 warm, natural sentences. Do not diagnose or prescribe a technique."
  },
  {
    name: "B · Pushback",
    learner: "You keep telling me not to judge myself, but how does that help when I physically cannot get a word out?",
    instruction: "The learner is challenging the idea in P01 (event versus verdict). Answer the actual question with a concrete explanation, respecting physical difficulty; do not give a generic reassurance."
  },
  {
    name: "C · Disagreement",
    learner: "I do not think stammering defines me. My problem is that speaking becomes physically difficult, so this identity lesson doesn't seem relevant.",
    instruction: "The learner disagrees with P01's identity framework. Acknowledge that it may not apply; don't insist on a label. Offer one practical non-coercive learning connection."
  },
  {
    name: "D · Grounded memory",
    learner: "During my check-in I told you my goal is to speak up in weekly team meetings, but I have not told you whether my speech is easier when alone. What do you remember, and what remains unknown?",
    instruction: "Only saved learner-reported context is: 'My goal is to speak up in weekly team meetings.' Answer accurately, distinguish known from unknown, and do not fabricate observations."
  },
  {
    name: "E · Unexpected mid-lesson question",
    learner: "If I stop calling myself a bad speaker, will that make my stammering go away? What if I still get stuck tomorrow?",
    instruction: "You are teaching P01, separating speaking events from verdicts. Answer the question truthfully and briefly without a cure promise; then naturally return to the lesson's single learning idea."
  }
] as const;

function makePrompt(test: typeof SCENARIOS[number]): string {
  return [
    COCO_SYSTEM_INSTRUCTION,
    "CURRENT LESSON: P01 'Your Identity With Your Speech'. Teaching goals: notice a speaking label; separate a specific speaking event from a verdict about the person; try a specific observation.",
    test.instruction,
    "Learner's actual message: " + test.learner,
    "Speak only Coco's next response. Do not repeat instructions, role labels, or invented memory."
  ].join("\n\n");
}

async function durationOf(blob: Blob): Promise<number> {
  try {
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      return Number(decoded.duration.toFixed(2));
    } finally {
      await context.close();
    }
  } catch {
    return 0;
  }
}

function toRecord(kind: AuditRecord["kind"], scenario: string, input: string, result: GatewayCallResult): AuditRecord {
  return {
    kind,
    scenario,
    input,
    output: result.text,
    ok: result.ok,
    status: result.httpStatus,
    model: result.model,
    latencyMs: result.latencyMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    ...(result.errorMessage ? { error: result.errorMessage } : {}),
    timestamp: new Date().toISOString()
  };
}

export default function LiveCocoAuditPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [file, setFile] = useState<File | Blob | null>(null);
  const [audioError, setAudioError] = useState("");
  const [recording, setRecording] = useState(false);
  const [selfReport, setSelfReport] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    ensureWebAppCheck();
    const auth = getFirebaseClientAuth();
    if (!auth) {
      setAuthError("Firebase Web configuration is missing.");
      setAuthReady(true);
      return;
    }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
  }, []);

  useEffect(() => () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const signIn = async () => {
    try {
      setAuthError("");
      const auth = getFirebaseClientAuth();
      if (!auth) throw new Error("Firebase Web authentication is not configured.");
      await signInWithPopup(auth, getGoogleProvider());
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Google Sign-In failed.");
    }
  };

  const runCoachAudit = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      // Every request must be authenticated through the existing Firebase Auth + App Check flow.
      // Five actual billable calls; stop immediately upon an auth/quota failure.
      for (const test of SCENARIOS) {
        const res = await callTrustedAiGateway({
          action: "coach_generate",
          purpose: "coco_qa",
          attemptOrSessionId: "web_live_audit",
          payload: { prompt: makePrompt(test) },
          guestMode: false
        });
        setRecords((old) => [...old, toRecord("coaching", test.name, test.learner, res)]);
        if (!res.ok) break;
      }
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    setAudioError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickSupportedAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onerror = () => setAudioError("Microphone recording failed.");
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setFile(blob);
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(300);
      setRecording(true);
    } catch (e) {
      setAudioError(e instanceof Error ? e.message : "Microphone permission denied.");
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const analyzeSpeech = async () => {
    if (!file || !user || busy) return;
    setAudioError("");
    if (file.size > MAX_WEB_AUDIO_UPLOAD_BYTES) {
      setAudioError("Audio exceeds the 2.4 MB upload limit. Please use a shorter clip.");
      return;
    }
    const duration = await durationOf(file);
    if (duration < 1) {
      setAudioError("Cannot determine recording duration. Please record directly in Chrome or choose a supported audio file.");
      return;
    }
    setBusy(true);
    try {
      const mimeType = file.type || "audio/webm";
      const result = await callTrustedAiGateway({
        action: "speech_analysis",
        purpose: "requested_inspection",
        attemptOrSessionId: "web_live_audit_speech",
        payload: {
          audioBase64: await blobToBase64(file),
          mimeType,
          durationSeconds: duration,
          prompt: "Independent evaluation of real human speech. Transcribe only audible speech, preserve disfluencies, mark true repetitions, prolongations and observable pauses with accurate relative timestamps. Silence alone must not be labeled a block. No inference of anxiety or mental state."
        },
        guestMode: false
      });
      setRecords((old) => [...old, toRecord("speech_analysis", "User-supplied genuine audio", "Audio duration " + duration + " seconds; self-report: " + (selfReport || "not supplied"), result)]);
    } catch(e) {
      setAudioError(e instanceof Error ? e.message : "Speech analysis failed.");
    } finally {
      setBusy(false);
    }
  };

  const exportEvidence = () => {
    const report = {
      reportType: "vocoflo_real_gemini_audit",
      generatedAt: new Date().toISOString(),
      simulated: false,
      note: "This export contains actual Firebase-authenticated gateway responses, not mock results. Model quality and timestamp correctness still require independent review with the recording.",
      records
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vocoflo-live-coco-audit.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-[#0b221c] px-4 py-10 text-[#f1eedf]">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/" className="text-sm text-[#91d1b4]">← VocoFlo Test Harness</Link>
          <h1 className="mt-4 text-3xl font-semibold">Real Coco · Independent Evaluation</h1>
          <p className="mt-2 text-sm text-[#c3d4c7]">This runs the real Gemini AI gateway using your existing Google account. No Guest Mode, synthetic answers, fake speech events or new account required. It does not modify the Android app.</p>
        </div>
        <div className="rounded-xl border border-[#476a59] p-4 text-sm">
          {!authReady ? "Checking authentication…" : !user ? (
            <div className="space-y-3">
              <p>One-time Google Sign-In is required by the real VocoFlo backend. Your password and tokens are never shown in the report.</p>
              <button onClick={signIn} className="rounded-lg bg-[#a8d9bf] px-4 py-2 font-semibold text-[#103528]">Sign In With Google</button>
            </div>
          ) : <p>Authenticated test session active. Real gateway calls will count toward your existing monthly allowance.</p>}
          {authError && <p role="alert" className="mt-2 text-[#ffb3a5]">{authError}</p>}
        </div>
        <section className="rounded-xl border border-[#476a59] p-5 space-y-4">
          <h2 className="text-xl font-semibold">Part A · Actual Coco intelligence</h2>
          <p className="text-sm text-[#c3d4c7]">Five genuine Gemini coaching requests: listener pressure, challenge, disagreement, grounded memory and an unexpected follow-up. Expected usage: 5 live AI calls if all succeed. The audit stops at the first failed request.</p>
          <button disabled={!user || busy} onClick={runCoachAudit} className="rounded-lg bg-[#a8d9bf] px-4 py-2 font-semibold text-[#103528] disabled:opacity-40">{busy ? "Running live checks…" : "Run 5 real Coco tests"}</button>
        </section>
        <section className="rounded-xl border border-[#476a59] p-5 space-y-4">
          <h2 className="text-xl font-semibold">Part B · Real speech-event analysis</h2>
          <p className="text-sm text-[#c3d4c7]">Record one genuine human speech sample, or choose an existing recording you own and consent to process with the existing Gemini gateway. Do not manufacture stammering. You can repeat with different recordings. Audio is not embedded in the exported report.</p>
          <div className="flex flex-wrap gap-2">
            <button disabled={!user || busy || recording} onClick={startRecording} className="rounded-lg border border-[#7daf94] px-4 py-2 disabled:opacity-40">Start microphone</button>
            <button disabled={!recording} onClick={stopRecording} className="rounded-lg border border-[#7daf94] px-4 py-2 disabled:opacity-40">Stop microphone</button>
            <label className="rounded-lg border border-[#7daf94] px-4 py-2">Choose audio file
              <input className="block mt-1 max-w-full text-xs" type="file" accept="audio/*" disabled={busy || recording} onChange={e=>setFile(e.target.files?.[0]||null)}/>
            </label>
          </div>
          <p className="text-sm text-[#c3d4c7]">{recording ? "Recording now — explicitly stop when finished." : file ? "Audio ready (" + Math.round(file.size / 1024) + " KB)" : "No audio selected."}</p>
          <label className="block space-y-1 text-sm">What did you personally experience? (optional)
            <textarea value={selfReport} onChange={e=>setSelfReport(e.target.value)} className="w-full rounded-lg border border-[#476a59] bg-[#18382c] p-2" rows={2} placeholder="I felt stuck on a word, even though it may sound like a pause."/>
          </label>
          <button disabled={!user || !file || busy || recording} onClick={analyzeSpeech} className="rounded-lg bg-[#a8d9bf] px-4 py-2 font-semibold text-[#103528] disabled:opacity-40">Analyze genuine speech with Gemini</button>
          {audioError && <p role="alert" className="text-sm text-[#ffb3a5]">{audioError}</p>}
        </section>
        <section className="rounded-xl border border-[#476a59] p-5 space-y-3">
          <h2 className="text-xl font-semibold">Actual results · {records.length}</h2>
          {records.length===0 ? <p className="text-sm text-[#c3d4c7]">No calls yet.</p> : records.map((r,i)=><article key={i} className="rounded-lg bg-[#18382c] p-3 text-sm">
            <p className="font-semibold">{r.scenario} · {r.ok ? "HTTP " + r.status : "Failed " + r.status} · {r.model || "model unavailable"} · {r.latencyMs} ms</p>
            <p className="mt-2 text-[#c3d4c7]">{r.input}</p>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{r.output || r.error || "Empty response"}</pre>
          </article>)}
          <button onClick={exportEvidence} disabled={records.length===0} className="rounded-lg border border-[#7daf94] px-4 py-2 disabled:opacity-40">Download actual response evidence (JSON)</button>
          <p className="text-xs text-[#b1c7b7]">Export is saved to your device only. It excludes audio, Firebase tokens and account ID. For event timestamp verification, retain the original audio separately.</p>
        </section>
      </div>
    </main>
  );
}
