"use client";

import React, { useState } from "react";
import { MessageCircleQuestion, Play, Send, X } from "lucide-react";
import type { CoachVoiceState } from "@/lib/audio/useCoachVoice";
import type { JourneyScope, VoiceRole } from "@/types/vocoflo";
import { CocoAudioPanel, CocoThinkingCard } from "./CocoAudioPanel";

export interface QaExchange {
  id: string;
  question: string;
  answer: string | null;
  status: "thinking" | "completed" | "error";
  timestampIso: string;
}

interface AskCocoDrawerProps {
  open: boolean;
  onClose: () => void;
  onCloseAndResumeLesson?: () => void;
  hasInterruptedLessonAudio?: boolean;
  scope: JourneyScope;
  micRecordingActive: boolean;
  exchanges: QaExchange[];
  busy: boolean;
  errorMessage: string | null;
  onAskQuestion: (question: string) => Promise<void>;
  voiceState: CoachVoiceState;
  onPlayAudio: (text: string, role: VoiceRole) => void;
  onPauseAudio: () => void;
  isGuestMode?: boolean;
}

const SUGGESTED_QUESTIONS = [
  "Why does separating an event from a verdict help?",
  "Does loosening identity mean lowering my standards?",
  "How does what I shared in Check-In connect here?",
];

export function AskCocoDrawer({
  open,
  onClose,
  onCloseAndResumeLesson,
  hasInterruptedLessonAudio = false,
  scope,
  micRecordingActive,
  exchanges,
  busy,
  errorMessage,
  onAskQuestion,
  voiceState,
  onPlayAudio,
  onPauseAudio,
  isGuestMode = false,
}: AskCocoDrawerProps) {
  const [draft, setDraft] = useState("");

  if (!open) return null;

  const submit = async (q: string) => {
    const clean = q.trim();
    if (!clean || busy || micRecordingActive) return;
    setDraft("");
    await onAskQuestion(clean);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Ask Coco"
    >
      <div className="flex h-full w-full max-w-lg flex-col border-l border-emeraldStrongBorder bg-emeraldCanvas shadow-2xl">
        <div className="flex items-center justify-between border-b border-emeraldBorder bg-emeraldSurface px-5 py-4">
          <div className="flex items-center gap-2.5">
            <MessageCircleQuestion className="h-5 w-5 text-mintAccent" />
            <div>
              <h2 className="font-display text-base font-semibold text-creamInk">Ask Coco</h2>
              <p className="text-[11px] text-mutedSage">
                Scoped to your current step • {scope.currentStageLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasInterruptedLessonAudio && onCloseAndResumeLesson ? (
              <button
                type="button"
                onClick={onCloseAndResumeLesson}
                className="inline-flex items-center gap-1.5 rounded-full border border-mintAccent/70 bg-emeraldField px-3 py-1.5 text-xs font-semibold text-mintAccent hover:bg-emeraldRaised"
              >
                <Play className="h-3 w-3" />
                Resume Lesson
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Ask Coco"
              className="rounded-full p-1.5 text-mutedSage hover:bg-emeraldRaised hover:text-creamInk"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-emeraldBorder bg-emeraldSurface p-3 text-xs text-mutedSage">
            {isGuestMode
              ? "Guest Review Mode: Coco answers are clearly labeled simulations scoped to your current guest progress and conversation turns."
              : "Coco remembers your recent questions in this conversation and answers from the steps you have reached so far—without spoiling upcoming material."}
          </div>

          {micRecordingActive ? (
            <div className="rounded-xl border border-warmGold/50 bg-emeraldRaised p-3 text-xs text-warmGold">
              Finish or stop your active microphone recording before asking Coco a question.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy || micRecordingActive}
                onClick={() => submit(q)}
                className="rounded-full border border-emeraldStrongBorder bg-emeraldRaised px-3 py-1.5 text-left text-xs text-softMintInk hover:border-mintAccent disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {errorMessage ? (
            <div className="rounded-xl border border-softCoral/50 bg-coralContainer/70 p-3 text-xs text-coralOnContainer">
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-4">
            {exchanges.map((ex) => (
              <div key={ex.id} className="space-y-2.5">
                <div
                  data-testid="ask-coco-learner-message"
                  className="ml-6 rounded-2xl border border-emeraldStrongBorder bg-emeraldField px-4 py-2.5 text-sm text-creamInk"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-mintAccent">
                    You asked
                  </p>
                  <p className="mt-0.5">{ex.question}</p>
                </div>

                {ex.status === "thinking" ? (
                  <CocoThinkingCard
                    label="Coco is thinking…"
                    detail="Connecting your question to this conversation and your current step."
                  />
                ) : ex.answer ? (
                  <CocoAudioPanel
                    title="Coco's Answer"
                    badge={isGuestMode ? "Simulated (Guest Mode)" : undefined}
                    text={ex.answer}
                    role="COCO"
                    voiceState={voiceState}
                    onPlay={onPlayAudio}
                    onPause={onPauseAudio}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
          className="border-t border-emeraldBorder bg-emeraldSurface p-4"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy || micRecordingActive}
              placeholder="Ask Coco anything about this step…"
              className="flex-1 rounded-full border border-emeraldStrongBorder bg-emeraldCanvas px-4 py-2.5 text-sm text-creamInk placeholder:text-mutedSage/60 focus:border-mintAccent focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || micRecordingActive || !draft.trim()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-sagePill px-4 py-2 text-xs font-semibold text-sageInk hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
              {busy ? "Thinking…" : "Ask"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
