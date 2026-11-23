"use client";

import React, { useRef, useState } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import type {
  LocalAudioClip,
  SpeechAttempt,
  SpeechEvent,
  SpeechEventReviewState,
  SpeechEventType,
} from "@/types/vocoflo";

interface AcousticMirrorPanelProps {
  attempt: SpeechAttempt;
  events: SpeechEvent[];
  clip?: LocalAudioClip;
  onUpdateEventReview: (
    eventId: string,
    reviewState: SpeechEventReviewState,
    eventType?: SpeechEventType,
    correctedLabel?: string,
    correctionNote?: string
  ) => void;
  onAddUserMoment: (
    attemptId: string,
    startSeconds: number,
    wordOrSound: string,
    note: string
  ) => void;
  onRequestInspection?: (attempt: SpeechAttempt, clip: LocalAudioClip) => Promise<void>;
  inspecting?: boolean;
  defaultOpen?: boolean;
  titleOverride?: string;
}

const EVENT_TYPE_LABELS: Record<SpeechEventType, string> = {
  repetition: "Repetition",
  prolongation: "Prolongation",
  pause: "Pause",
  other_uncertain: "Uncertain moment",
  user_reported_block: "User-reported block",
};

export function AcousticMirrorPanel({
  attempt,
  events,
  clip,
  onUpdateEventReview,
  onAddUserMoment,
  onRequestInspection,
  inspecting = false,
  defaultOpen = false,
  titleOverride,
}: AcousticMirrorPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<SpeechEventType>("repetition");
  const [editNote, setEditNote] = useState("");

  const [addingMoment, setAddingMoment] = useState(false);
  const [newTimestamp, setNewTimestamp] = useState("0.5");
  const [newWord, setNewWord] = useState("");
  const [newNote, setNewNote] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const attemptEvents = events
    .filter((e) => e.attemptId === attempt.id)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  const seekTo = (sec: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, sec);
    el.play().catch(() => {});
  };

  return (
    <div className="rounded-2xl border border-emeraldBorder bg-emeraldSurface/90">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-emeraldRaised/60"
      >
        <div className="flex items-center gap-2.5">
          <AudioLines className="h-4 w-4 text-mintAccent" />
          <div>
            <p className="text-xs font-semibold text-creamInk">
              {titleOverride || "Optional Acoustic Mirror (Inspect & Correct)"}
            </p>
            <p className="text-[11px] text-mutedSage">
              {attemptEvents.length} tentative moment(s) • Status: {attempt.analysisStatus} •{" "}
              {attempt.durationSeconds.toFixed(1)}s
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-mintAccent">
          {open ? "Hide" : "Open"}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open ? (
        <div className="space-y-4 border-t border-emeraldBorder p-4">
          <p className="rounded-xl border border-emeraldBorder bg-emeraldCanvas/70 px-3 py-2 text-xs text-mutedSage">
            Tentative acoustic notes are optional and never final. Only you know what felt
            effortful or easy from the inside—confirm, dismiss, relabel, or add moments anytime.
          </p>

          {clip ? (
            <div className="space-y-1.5">
              <audio ref={audioRef} controls src={clip.blobUrl} className="w-full" />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-mutedSage">
                <span>Click any moment timestamp below to jump &amp; listen.</span>
                {onRequestInspection && clip ? (
                  <button
                    type="button"
                    disabled={inspecting}
                    onClick={() => onRequestInspection(attempt, clip)}
                    className="inline-flex items-center gap-1 rounded-full border border-emeraldStrongBorder px-3 py-1 text-xs text-mintAccent hover:bg-emeraldRaised disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${inspecting ? "animate-spin" : ""}`} />
                    {inspecting
                      ? "Inspecting…"
                      : attempt.analysisStatus === "success"
                        ? "Re-run Inspection"
                        : "Run Speech Inspection"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-xs italic text-mutedSage">
              No local audio clip in this browser session (loaded from saved history or typed entry).
            </p>
          )}

          {attempt.disfluentTranscript ? (
            <div className="rounded-xl border border-emeraldBorder bg-emeraldRaised p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mintAccent">
                Verbatim Transcript (Editable context)
              </p>
              <p className="mt-1 text-sm text-softMintInk">&ldquo;{attempt.disfluentTranscript}&rdquo;</p>
            </div>
          ) : null}

          {attempt.summaryObservation ? (
            <p className="text-xs text-mutedSage">
              <strong className="text-creamInk">Tentative note:</strong> {attempt.summaryObservation}
            </p>
          ) : null}

          {attempt.analysisError ? (
            <p className="rounded-lg border border-softCoral/40 bg-coralContainer/50 px-3 py-2 text-xs text-coralOnContainer">
              Analysis notice: {attempt.analysisError}
            </p>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-mutedSage">
                Timeline Moments ({attemptEvents.length})
              </h4>
              <button
                type="button"
                onClick={() => {
                  if (audioRef.current) {
                    setNewTimestamp(audioRef.current.currentTime.toFixed(1));
                  }
                  setAddingMoment((v) => !v);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-mintAccent/60 px-2.5 py-1 text-[11px] font-medium text-mintAccent hover:bg-emeraldField"
              >
                <Plus className="h-3 w-3" />
                Add My Own Moment
              </button>
            </div>

            {addingMoment ? (
              <div className="space-y-2 rounded-xl border border-mintAccent/40 bg-emeraldCanvas p-3">
                <p className="text-xs font-medium text-creamInk">
                  Report a moment you noticed (including silent blocks)
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-[11px] text-mutedSage">
                    Time (sec)
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      max={Math.max(1, attempt.durationSeconds)}
                      value={newTimestamp}
                      onChange={(e) => setNewTimestamp(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-emeraldBorder bg-emeraldSurface px-2.5 py-1.5 text-xs text-creamInk"
                    />
                  </label>
                  <label className="text-[11px] text-mutedSage sm:col-span-2">
                    Word or sound (optional)
                    <input
                      type="text"
                      value={newWord}
                      onChange={(e) => setNewWord(e.target.value)}
                      placeholder="e.g. 'meeting' or silent hold"
                      className="mt-1 w-full rounded-lg border border-emeraldBorder bg-emeraldSurface px-2.5 py-1.5 text-xs text-creamInk"
                    />
                  </label>
                </div>
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Optional note about what you noticed inside…"
                  className="w-full rounded-lg border border-emeraldBorder bg-emeraldSurface px-2.5 py-1.5 text-xs text-creamInk"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingMoment(false)}
                    className="rounded-full px-3 py-1 text-xs text-mutedSage hover:text-creamInk"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const t = Number.parseFloat(newTimestamp);
                      const safeT = Number.isFinite(t) && t >= 0 ? t : 0;
                      onAddUserMoment(
                        attempt.id,
                        safeT,
                        newWord.trim(),
                        newNote.trim() || "User-reported moment"
                      );
                      setNewWord("");
                      setNewNote("");
                      setAddingMoment(false);
                    }}
                    className="rounded-full bg-sagePill px-3.5 py-1 text-xs font-semibold text-sageInk"
                  >
                    Save Moment
                  </button>
                </div>
              </div>
            ) : null}

            {attemptEvents.length === 0 ? (
              <p className="text-xs text-mutedSage">
                No tentative acoustic moments marked on this clip.
              </p>
            ) : (
              <div className="space-y-2">
                {attemptEvents.map((ev) => {
                  const isDismissed = ev.reviewState === "dismissed";
                  return (
                    <div
                      key={ev.id}
                      className={`rounded-xl border p-3 transition ${
                        isDismissed
                          ? "border-emeraldBorder/40 bg-emeraldCanvas/40 opacity-60"
                          : "border-emeraldBorder bg-emeraldRaised"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={!clip}
                            onClick={() => seekTo(ev.startSeconds)}
                            className="rounded-md bg-emeraldField px-2 py-0.5 font-mono text-xs font-semibold text-mintAccent hover:opacity-90 disabled:opacity-50"
                          >
                            {ev.startSeconds.toFixed(1)}s–{ev.endSeconds.toFixed(1)}s
                          </button>
                          <span className="text-xs font-semibold text-creamInk">
                            {EVENT_TYPE_LABELS[ev.eventType]}
                          </span>
                          {ev.wordOrSound ? (
                            <span className="rounded-full bg-emeraldSurface px-2 py-0.5 text-[11px] text-softMintInk">
                              &ldquo;{ev.wordOrSound}&rdquo;
                            </span>
                          ) : null}
                          <span className="rounded-full border border-emeraldStrongBorder px-2 py-0.5 text-[10px] uppercase tracking-wide text-mutedSage">
                            {ev.sourceKind === "user_reported"
                              ? "User added"
                              : ev.sourceKind === "development_fixture"
                                ? `Simulated (Guest) • ${ev.reviewState}`
                                : ev.reviewState}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUpdateEventReview(ev.id, "confirmed")}
                            title="Confirm moment"
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              ev.reviewState === "confirmed"
                                ? "bg-mintDeep text-mintHighlight"
                                : "border border-emeraldStrongBorder text-softMintInk hover:bg-emeraldField"
                            }`}
                          >
                            <Check className="h-3 w-3" />
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(editingId === ev.id ? null : ev.id);
                              setEditType(ev.eventType);
                              setEditNote(ev.correctionNote || "");
                            }}
                            title="Relabel moment"
                            className="inline-flex items-center gap-1 rounded-full border border-emeraldStrongBorder px-2.5 py-1 text-[11px] text-softMintInk hover:bg-emeraldField"
                          >
                            <Edit3 className="h-3 w-3" />
                            Relabel
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateEventReview(ev.id, "dismissed")}
                            title="Dismiss false positive"
                            className="inline-flex items-center gap-1 rounded-full border border-emeraldBorder px-2.5 py-1 text-[11px] text-mutedSage hover:text-softCoral"
                          >
                            <X className="h-3 w-3" />
                            Dismiss
                          </button>
                        </div>
                      </div>

                      <p className="mt-1.5 text-xs text-mutedSage">
                        {ev.correctionNote || ev.tentativeObservation}
                      </p>

                      {editingId === ev.id ? (
                        <div className="mt-2.5 space-y-2 border-t border-emeraldBorder pt-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={editType}
                              onChange={(e) => setEditType(e.target.value as SpeechEventType)}
                              className="rounded-lg border border-emeraldBorder bg-emeraldCanvas px-2.5 py-1 text-xs text-creamInk"
                            >
                              {Object.entries(EVENT_TYPE_LABELS).map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              placeholder="Optional note…"
                              className="flex-1 rounded-lg border border-emeraldBorder bg-emeraldCanvas px-2.5 py-1 text-xs text-creamInk"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateEventReview(
                                  ev.id,
                                  "corrected",
                                  editType,
                                  EVENT_TYPE_LABELS[editType],
                                  editNote.trim() || undefined
                                );
                                setEditingId(null);
                              }}
                              className="rounded-full bg-sagePill px-3 py-1 text-xs font-semibold text-sageInk"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
