"use client";

import React, { useMemo, useState } from "react";
import { Download, FileJson, FileText, Shield, Volume2, X } from "lucide-react";
import {
  buildPrivacyConsciousReport,
  formatReportAsMarkdown,
} from "@/lib/evidence/exporter";
import type {
  EvidenceLogEntry,
  LocalAudioClip,
  SpeechAttempt,
  SpeechEvent,
} from "@/types/vocoflo";

interface EvidenceExportModalProps {
  open: boolean;
  onClose: () => void;
  uid: string | null;
  entries: EvidenceLogEntry[];
  attempts: SpeechAttempt[];
  speechEvents: SpeechEvent[];
  localClips: LocalAudioClip[];
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function EvidenceExportModal({
  open,
  onClose,
  uid,
  entries,
  attempts,
  speechEvents,
  localClips,
}: EvidenceExportModalProps) {
  const [includeTranscripts, setIncludeTranscripts] = useState(false);

  const report = useMemo(
    () =>
      buildPrivacyConsciousReport({
        uid,
        entries,
        attempts,
        speechEvents,
        options: { includeTranscripts },
      }),
    [uid, entries, attempts, speechEvents, includeTranscripts]
  );

  if (!open) return null;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-export-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-emeraldStrongBorder bg-emeraldCanvas shadow-2xl">
        <div className="flex items-center justify-between border-b border-emeraldBorder bg-emeraldSurface px-5 py-4">
          <div>
            <h2
              id="evidence-export-title"
              className="font-display text-lg font-semibold text-creamInk"
            >
              Independent Reviewer Evidence &amp; Export
            </h2>
            <p className="text-xs text-mutedSage">
              Timestamps, actual Coco responses, gateway diagnostics, and explicit learner controls
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="rounded-full p-1.5 text-mutedSage hover:bg-emeraldRaised hover:text-creamInk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Privacy control */}
          <div className="rounded-2xl border border-emeraldStrongBorder bg-emeraldSurface p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-mintAccent" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-creamInk">
                  Privacy-Conscious Export Defaults
                </p>
                <p className="text-xs text-mutedSage">
                  By default, exported JSON and Markdown reports include timestamps, UI flow events,
                  gateway model/status telemetry, and actual Coco responses, while{" "}
                  <strong>omitting learner speech transcripts</strong> and never embedding raw audio
                  or auth credentials.
                </p>
                <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs font-medium text-softMintInk">
                  <input
                    type="checkbox"
                    checked={includeTranscripts}
                    onChange={(e) => setIncludeTranscripts(e.target.checked)}
                    className="h-4 w-4 accent-mintAccent"
                  />
                  Include learner disfluent transcripts in exported JSON / Markdown (opt-in)
                </label>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emeraldBorder bg-emeraldSurface p-3">
              <p className="text-[11px] text-mutedSage">AI Gateway Calls</p>
              <p className="mt-1 font-mono text-lg font-semibold text-creamInk">
                {report.summary.totalGatewayCalls}
              </p>
            </div>
            <div className="rounded-xl border border-emeraldBorder bg-emeraldSurface p-3">
              <p className="text-[11px] text-mutedSage">Gateway Errors</p>
              <p className="mt-1 font-mono text-lg font-semibold text-warmGold">
                {report.summary.failedGatewayCalls}
              </p>
            </div>
            <div className="rounded-xl border border-emeraldBorder bg-emeraldSurface p-3">
              <p className="text-[11px] text-mutedSage">Coco / Partner Turns</p>
              <p className="mt-1 font-mono text-lg font-semibold text-mintAccent">
                {report.summary.totalCocoResponses}
              </p>
            </div>
            <div className="rounded-xl border border-emeraldBorder bg-emeraldSurface p-3">
              <p className="text-[11px] text-mutedSage">Speaking Attempts</p>
              <p className="mt-1 font-mono text-lg font-semibold text-creamInk">
                {report.summary.recordedAttemptsCount}
              </p>
            </div>
          </div>

          {/* Explicit per-clip local audio downloads */}
          <div className="space-y-2 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-mintAccent" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-creamInk">
                Local Session Audio Clips (Explicit Per-Clip Export Only)
              </h3>
            </div>
            {localClips.length === 0 ? (
              <p className="text-xs text-mutedSage">
                No audio clips recorded in this browser session yet.
              </p>
            ) : (
              <div className="space-y-2">
                {localClips.map((clip) => (
                  <div
                    key={clip.attemptId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emeraldBorder bg-emeraldRaised px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-creamInk">{clip.label}</p>
                      <p className="text-[11px] text-mutedSage">
                        {clip.durationSeconds.toFixed(1)}s • {(clip.byteSize / 1024).toFixed(0)} KB
                        • {clip.mimeType}
                      </p>
                    </div>
                    <a
                      href={clip.blobUrl}
                      download={`vocoflo-${clip.attemptId}.${clip.mimeType.includes("mp4") ? "m4a" : "webm"}`}
                      className="inline-flex items-center gap-1 rounded-full border border-emeraldStrongBorder px-3 py-1 text-xs text-mintAccent hover:bg-emeraldField"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Clip
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chronological Timeline Preview */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-mutedSage">
              Chronological Event Log ({entries.length})
            </h3>
            <div className="max-h-60 space-y-2 overflow-y-auto rounded-2xl border border-emeraldBorder bg-emeraldSurface p-3">
              {entries.length === 0 ? (
                <p className="text-xs text-mutedSage">No session events recorded yet.</p>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-emeraldBorder/60 bg-emeraldCanvas px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-mutedSage">
                        {entry.timestampIso.slice(11, 19)}
                      </span>
                      <span className="rounded bg-emeraldField px-1.5 py-0.5 font-mono text-[10px] uppercase text-mintAccent">
                        {entry.kind}
                      </span>
                      <span className="text-softMintInk">{entry.summary}</span>
                      {entry.model ? (
                        <span className="font-mono text-[10px] text-mutedSage">
                          [{entry.model}]
                        </span>
                      ) : null}
                      {typeof entry.latencyMs === "number" ? (
                        <span className="font-mono text-[10px] text-mutedSage">
                          {entry.latencyMs}ms
                        </span>
                      ) : null}
                    </div>
                    {entry.cocoText ? (
                      <p className="mt-1 border-l-2 border-mintAccent/50 pl-2 text-[11px] text-softMintInk/90">
                        {entry.cocoText}
                      </p>
                    ) : null}
                    {entry.errorMessage ? (
                      <p className="mt-1 text-[11px] text-softCoral">{entry.errorMessage}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-emeraldBorder bg-emeraldSurface px-5 py-4">
          <button
            type="button"
            onClick={() =>
              triggerDownload(
                `vocoflo-evidence-${stamp}.md`,
                formatReportAsMarkdown(report),
                "text/markdown;charset=utf-8"
              )
            }
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full border border-emeraldStrongBorder px-4 py-2 text-xs font-semibold text-creamInk hover:bg-emeraldRaised"
          >
            <FileText className="h-4 w-4 text-mintAccent" />
            Download Markdown
          </button>
          <button
            type="button"
            onClick={() =>
              triggerDownload(
                `vocoflo-evidence-${stamp}.json`,
                JSON.stringify(report, null, 2),
                "application/json;charset=utf-8"
              )
            }
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-sagePill px-5 py-2 text-xs font-semibold text-sageInk hover:opacity-90"
          >
            <FileJson className="h-4 w-4" />
            Download JSON
          </button>
        </div>
      </div>
    </div>
  );
}
