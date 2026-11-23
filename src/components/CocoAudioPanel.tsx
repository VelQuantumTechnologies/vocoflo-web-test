"use client";

import React, { useState } from "react";
import { Pause, Play, RotateCcw, Volume2, Eye, EyeOff } from "lucide-react";
import type { CoachVoiceState } from "@/lib/audio/useCoachVoice";
import type { VoiceRole } from "@/types/vocoflo";
import { CocoOrb } from "./VocoFloBranding";

interface CocoAudioPanelProps {
  title: string;
  text: string;
  role?: VoiceRole;
  voiceState: CoachVoiceState;
  onPlay: (text: string, role: VoiceRole) => void;
  onPause: () => void;
  defaultShowText?: boolean;
  badge?: string;
}

export function CocoAudioPanel({
  title,
  text,
  role = "COCO",
  voiceState,
  onPlay,
  onPause,
  defaultShowText = true,
  badge,
}: CocoAudioPanelProps) {
  const [showText, setShowText] = useState(defaultShowText);
  const cleanText = text.trim();
  const isThisActive = voiceState.activeText === cleanText && voiceState.activeRole === role;
  const isSpeaking = isThisActive && voiceState.speaking;
  const isSynthesizing = isThisActive && voiceState.synthesizing;

  const orbMode = isSpeaking ? "speaking" : isSynthesizing ? "thinking" : "idle";

  return (
    <div className="rounded-2xl border border-emeraldBorder bg-emeraldSurface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {role === "COCO" ? (
            <CocoOrb mode={orbMode} size={40} />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-warmGold/50 bg-emeraldRaised text-warmGold">
              <Volume2 className="h-5 w-5" />
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-creamInk">{title}</h3>
              {badge ? (
                <span className="rounded-full bg-emeraldField px-2.5 py-0.5 text-[11px] font-medium text-mintAccent">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-mutedSage">
              {isSynthesizing
                ? "Preparing voice…"
                : isSpeaking
                  ? `${voiceState.sourceLabel} • Playing`
                  : role === "COCO"
                    ? "Coco (Sulafat)"
                    : "Partner (Orus)"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSpeaking ? (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-sagePill px-3.5 py-1.5 text-xs font-semibold text-sageInk transition hover:opacity-90"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPlay(cleanText, role)}
              disabled={isSynthesizing}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-sagePill px-3.5 py-1.5 text-xs font-semibold text-sageInk transition hover:opacity-90 disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" />
              {isSynthesizing ? "Preparing…" : isThisActive && voiceState.paused ? "Resume" : "Play Audio"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onPlay(cleanText, role)}
            disabled={isSynthesizing}
            title="Replay"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-emeraldStrongBorder px-3 py-1.5 text-xs text-creamInk hover:bg-emeraldRaised disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Replay
          </button>
          <button
            type="button"
            onClick={() => setShowText((s) => !s)}
            className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-emeraldBorder px-3 py-1.5 text-xs text-mutedSage hover:text-creamInk"
          >
            {showText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showText ? "Hide text" : "Read text"}
          </button>
        </div>
      </div>

      {isThisActive && voiceState.unavailableMessage ? (
        <p className="mt-3 rounded-lg border border-warmGold/40 bg-emeraldRaised px-3 py-2 text-xs text-warmGold">
          {voiceState.unavailableMessage}
        </p>
      ) : null}

      {showText ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-softMintInk">
          {cleanText}
        </p>
      ) : (
        <p className="mt-3 text-xs italic text-mutedSage">
          Audio-first mode active — click &ldquo;Read text&rdquo; anytime to view the transcript.
        </p>
      )}
    </div>
  );
}
