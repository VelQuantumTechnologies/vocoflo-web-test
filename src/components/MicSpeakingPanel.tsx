"use client";

import React, { useState } from "react";
import { Mic, Square, RotateCcw, Send, Keyboard } from "lucide-react";
import type { MicRecordingState } from "@/lib/audio/useMicRecorder";

interface MicSpeakingPanelProps {
  recordingState: MicRecordingState;
  audioConsentAuthorized: boolean;
  onRequestConsent: () => void;
  onBeforeStart: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onResetRecording: () => void;
  onSubmitAudio: (blob: Blob, durationSeconds: number, mimeType: string, runAnalysis: boolean) => void;
  onSubmitTypedFallback: (text: string) => void;
  submitLabel?: string;
  allowSkipAnalysis?: boolean;
  busy?: boolean;
  isGuestMode?: boolean;
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function MicSpeakingPanel({
  recordingState,
  audioConsentAuthorized,
  onRequestConsent,
  onBeforeStart,
  onStartRecording,
  onStopRecording,
  onResetRecording,
  onSubmitAudio,
  onSubmitTypedFallback,
  submitLabel = "Submit Recording",
  allowSkipAnalysis = true,
  busy = false,
  isGuestMode = false,
}: MicSpeakingPanelProps) {
  const [showTyped, setShowTyped] = useState(false);
  const [typedDraft, setTypedDraft] = useState("");
  const [runAnalysis, setRunAnalysis] = useState(true);

  if (recordingState.status === "recording") {
    const barPct = Math.max(8, Math.min(100, Math.round(recordingState.level * 100)));
    return (
      <div className="rounded-2xl border border-mintAccent/60 bg-emeraldField p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
              Microphone Active • Listening Unhurriedly
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold text-creamInk">
              {formatSeconds(recordingState.elapsedSeconds)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onStopRecording}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-full bg-sagePill px-5 py-2.5 text-sm font-semibold text-sageInk transition hover:opacity-90"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop Recording
            </button>
            <button
              type="button"
              onClick={onResetRecording}
              className="inline-flex min-h-[46px] items-center rounded-full border border-emeraldStrongBorder px-3.5 py-2 text-xs text-mutedSage hover:text-creamInk"
            >
              Cancel
            </button>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-emeraldCanvas">
            <div
              className="h-full rounded-full bg-mintAccent transition-all duration-100"
              style={{ width: `${barPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-softMintInk/85">
            Speak in your ordinary voice. No fluency grading or live alerts run while you speak.
          </p>
        </div>
      </div>
    );
  }

  if (recordingState.status === "completed") {
    return (
      <div className="space-y-3 rounded-2xl border border-emeraldStrongBorder bg-emeraldRaised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-creamInk">
            Recorded Clip ({recordingState.durationSeconds.toFixed(1)}s)
          </p>
          <button
            type="button"
            onClick={onResetRecording}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs text-mintAccent hover:underline disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Record Again
          </button>
        </div>

        <audio controls src={recordingState.blobUrl} className="w-full" />

        {recordingState.warning ? (
          <div className="rounded-xl border border-warmGold/50 bg-emeraldSurface p-3 text-xs text-warmGold">
            {recordingState.warning}
          </div>
        ) : null}

        {allowSkipAnalysis ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-softMintInk">
            <input
              type="checkbox"
              checked={runAnalysis}
              onChange={(e) => setRunAnalysis(e.target.checked)}
              className="h-4 w-4 accent-mintAccent"
            />
            {isGuestMode
              ? "Run optional simulated speech observation & transcript (Guest Mode — local only)"
              : "Run optional speech observation & verbatim transcript (speech detection model)"}
          </label>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmitAudio(
              recordingState.blob,
              recordingState.durationSeconds,
              recordingState.mimeType,
              runAnalysis
            )
          }
          className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-sagePill px-5 py-2.5 text-sm font-semibold text-sageInk transition hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {busy ? "Sending to Coco…" : submitLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
      {recordingState.status === "error" ? (
        <div className="rounded-xl border border-softCoral/50 bg-coralContainer/70 p-3 text-xs text-coralOnContainer">
          {recordingState.message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!audioConsentAuthorized) {
              onRequestConsent();
              return;
            }
            onBeforeStart();
            onStartRecording();
          }}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-sagePill px-5 py-2.5 text-sm font-semibold text-sageInk transition hover:opacity-90 disabled:opacity-50"
        >
          <Mic className="h-4 w-4" />
          {audioConsentAuthorized ? "Start Speaking" : "Review Mic Upload Notice & Speak"}
        </button>

        <button
          type="button"
          onClick={() => setShowTyped((s) => !s)}
          disabled={busy}
          className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full border border-emeraldStrongBorder px-4 py-2 text-xs text-creamInk hover:bg-emeraldRaised"
        >
          <Keyboard className="h-4 w-4" />
          {showTyped ? "Hide Typing" : "Type Instead"}
        </button>
      </div>

      {showTyped ? (
        <div className="space-y-2 border-t border-emeraldBorder pt-3">
          <textarea
            value={typedDraft}
            onChange={(e) => setTypedDraft(e.target.value)}
            rows={3}
            placeholder="Share in writing if you prefer not to use the microphone right now…"
            className="w-full rounded-xl border border-emeraldStrongBorder bg-emeraldCanvas p-3 text-sm text-creamInk placeholder:text-mutedSage/60 focus:border-mintAccent focus:outline-none"
          />
          <button
            type="button"
            disabled={busy || !typedDraft.trim()}
            onClick={() => {
              const text = typedDraft.trim();
              if (!text) return;
              onSubmitTypedFallback(text);
              setTypedDraft("");
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-mintAccent px-4 py-2 text-xs font-semibold text-mintAccent hover:bg-emeraldField disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
            Send Written Response
          </button>
        </div>
      ) : null}
    </div>
  );
}
