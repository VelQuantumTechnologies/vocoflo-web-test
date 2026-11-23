"use client";

import React, { useState } from "react";
import { Pause, Play, RotateCcw, Volume2, Eye, EyeOff } from "lucide-react";
import type { CoachVoiceState } from "@/lib/audio/useCoachVoice";
import type { VoiceRole } from "@/types/vocoflo";
import { CocoOrb } from "./VocoFloBranding";

export function CocoThinkingCard({
  label = "Coco is thinking…",
  detail = "Crafting a response grounded in what you shared.",
}: {
  label?: string;
  detail?: string;
}) {
  return (
    <div
      data-testid="coco-thinking-card"
      className="flex items-center gap-3.5 rounded-2xl border border-warmGold/45 bg-emeraldSurface p-4 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <CocoOrb mode="thinking" size={40} />
      <div>
        <p className="text-sm font-semibold text-warmGold">{label}</p>
        <p className="text-xs text-mutedSage">{detail}</p>
      </div>
    </div>
  );
}

interface CocoAudioPanelProps {
  title: string;
  text: string;
  role?: VoiceRole;
  voiceState: CoachVoiceState;
  onPlay: (text: string, role: VoiceRole) => void;
  onPause: () => void;
  defaultShowText?: boolean;
  badge?: string;
  preparingVoice?: boolean;
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
  preparingVoice = false,
}: CocoAudioPanelProps) {
  const [showText, setShowText] = useState(defaultShowText);
  const [readNowKey, setReadNowKey] = useState<string | null>(null);
  const cleanText = text.trim();
  const isThisActive = voiceState.activeText === cleanText && voiceState.activeRole === role;
  const isSpeaking = isThisActive && voiceState.speaking;
  const isSynthesizing = (isThisActive && voiceState.synthesizing) || preparingVoice;
  const readNowChosen = readNowKey === cleanText;

  // Priority 2: In audio mode, do not reveal the complete spoken response while voice is preparing,
  // and provide "Read Now" as an accessible alternative.
  const hideWhileVoicePreparing =
    voiceState.audioDefaultEnabled && isSynthesizing && !readNowChosen;

  const orbMode = isSpeaking
    ? "speaking"
    : isSynthesizing
      ? "preparing_voice"
      : "idle";

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
                    ? "Coco"
                    : "Conversation Partner"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSpeaking ? (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-mintAccent/70 bg-emeraldField px-3.5 py-1.5 text-xs font-semibold text-mintAccent transition hover:bg-emeraldRaised"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause Audio
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onPlay(cleanText, role)}
              disabled={isSynthesizing}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-mintAccent/70 bg-emeraldField px-3.5 py-1.5 text-xs font-semibold text-mintAccent transition hover:bg-emeraldRaised disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" />
              {isSynthesizing
                ? "Preparing Voice…"
                : isThisActive && voiceState.paused
                  ? "Resume Audio"
                  : "Listen"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onPlay(cleanText, role)}
            disabled={isSynthesizing}
            title="Replay"
            className="inline-flex min-h-[38px] items-center gap-1 rounded-full border border-emeraldStrongBorder px-3 py-1.5 text-xs text-creamInk hover:bg-emeraldRaised disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Replay
          </button>
          {hideWhileVoicePreparing ? (
            <button
              type="button"
              onClick={() => {
                setReadNowKey(cleanText);
                setShowText(true);
              }}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-full border border-warmGold/70 bg-emeraldRaised px-3.5 py-1.5 text-xs font-semibold text-warmGold hover:bg-emeraldField"
            >
              <Eye className="h-3.5 w-3.5" />
              Read Now
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowText((s) => !s)}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-full border border-emeraldBorder px-3 py-1.5 text-xs text-mutedSage hover:text-creamInk"
            >
              {showText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showText ? "Hide text" : "Read Now"}
            </button>
          )}
        </div>
      </div>

      {isThisActive && voiceState.unavailableMessage ? (
        <p className="mt-3 rounded-lg border border-warmGold/40 bg-emeraldRaised px-3 py-2 text-xs text-warmGold">
          {voiceState.unavailableMessage}
        </p>
      ) : null}

      {hideWhileVoicePreparing ? (
        <div
          data-testid="voice-preparing-banner"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emeraldStrongBorder bg-emeraldCanvas/70 px-3.5 py-2.5 text-xs text-softMintInk"
        >
          <span>Coco&rsquo;s voice is preparing so you can listen first…</span>
          <button
            type="button"
            onClick={() => {
              setReadNowKey(cleanText);
              setShowText(true);
            }}
            className="font-semibold text-mintAccent underline hover:opacity-90"
          >
            Read Now
          </button>
        </div>
      ) : showText ? (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-softMintInk">
          {cleanText}
        </p>
      ) : (
        <p className="mt-3 text-xs italic text-mutedSage">
          Audio-first mode active — click &ldquo;Read Now&rdquo; anytime to view the text.
        </p>
      )}
    </div>
  );
}
