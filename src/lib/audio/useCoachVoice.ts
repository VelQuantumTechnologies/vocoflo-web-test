"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callTrustedAiGateway } from "@/lib/ai/gateway-client";
import type { VoiceRole } from "@/types/vocoflo";
import {
  base64ToUint8Array,
  computeNarrationCacheKey,
  ensureWavBytes,
  lookupPreGeneratedAssetUrl,
  prepareTtsTranscript,
} from "./wav";

export interface CoachVoiceState {
  synthesizing: boolean;
  speaking: boolean;
  paused: boolean;
  activeRole: VoiceRole;
  activeText: string;
  sourceLabel: string;
  playbackRate: number;
  audioDefaultEnabled: boolean;
  allowBrowserFallback: boolean;
  autoplayBlocked: boolean;
  unavailableMessage: string | null;
  preGeneratedHits: number;
  cacheHits: number;
  liveTtsCalls: number;
}

export function useCoachVoice(
  onLog?: (msg: string, isError?: boolean) => void,
  isGuestMode = false
) {
  const [state, setState] = useState<CoachVoiceState>({
    synthesizing: false,
    speaking: false,
    paused: false,
    activeRole: "COCO",
    activeText: "",
    sourceLabel: "Coco",
    playbackRate: 1.15,
    audioDefaultEnabled: true,
    allowBrowserFallback: false,
    autoplayBlocked: false,
    unavailableMessage: null,
    preGeneratedHits: 0,
    cacheHits: 0,
    liveTtsCalls: 0,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheUrlsRef = useRef<Map<string, string>>(new Map());
  const requestCounterRef = useRef(0);

  const stopAudioOnly = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // ignore
      }
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    const cacheMap = cacheUrlsRef.current;
    return () => {
      requestCounterRef.current += 1;
      stopAudioOnly();
      cacheMap.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
  }, [stopAudioOnly]);

  const playUrl = useCallback(
    async (
      url: string,
      role: VoiceRole,
      text: string,
      rate: number,
      label: string,
      reqId: number
    ) => {
      if (reqId !== requestCounterRef.current) {
        return;
      }
      stopAudioOnly();
      const audio = new Audio(url);
      audio.playbackRate = role === "COCO" ? rate : 1.0;
      (audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      audioRef.current = audio;

      audio.onended = () => {
        if (reqId !== requestCounterRef.current) return;
        setState((prev) => ({
          ...prev,
          speaking: false,
          synthesizing: false,
          paused: false,
        }));
      };
      audio.onerror = () => {
        if (reqId !== requestCounterRef.current) return;
        setState((prev) => ({
          ...prev,
          speaking: false,
          synthesizing: false,
          unavailableMessage:
            "Audio playback could not start in this browser; readable text is shown below.",
        }));
      };

      try {
        await audio.play();
        if (reqId !== requestCounterRef.current) {
          stopAudioOnly();
          return;
        }
        setState((prev) => ({
          ...prev,
          synthesizing: false,
          speaking: true,
          paused: false,
          autoplayBlocked: false,
          activeRole: role,
          activeText: text,
          sourceLabel: label,
          unavailableMessage: null,
        }));
      } catch (err) {
        if (reqId !== requestCounterRef.current) {
          stopAudioOnly();
          return;
        }
        const msg = err instanceof Error ? err.message : "Autoplay blocked";
        setState((prev) => ({
          ...prev,
          synthesizing: false,
          speaking: false,
          paused: true,
          autoplayBlocked: true,
          activeRole: role,
          activeText: text,
          sourceLabel: label,
          unavailableMessage:
            "Press Play Audio whenever you are ready to listen.",
        }));
        onLog?.(`Audio playback deferred (${msg})`);
      }
    },
    [onLog, stopAudioOnly]
  );

  const speak = useCallback(
    async (rawText: string, role: VoiceRole = "COCO") => {
      const clean = rawText.trim();
      const transcript = prepareTtsTranscript(clean);
      if (!transcript) return;

      const reqId = ++requestCounterRef.current;
      stopAudioOnly();

      setState((prev) => ({
        ...prev,
        synthesizing: true,
        speaking: false,
        paused: false,
        autoplayBlocked: false,
        activeRole: role,
        activeText: clean,
        unavailableMessage: null,
      }));

      // 1. Pre-generated WAV asset (0 live API calls)
      const assetUrl = await lookupPreGeneratedAssetUrl(role, clean);
      if (reqId !== requestCounterRef.current) return;

      if (assetUrl) {
        const label = role === "COCO" ? "Coco" : "Conversation Partner";
        setState((prev) => ({ ...prev, preGeneratedHits: prev.preGeneratedHits + 1 }));
        onLog?.(`Voice cache hit (pre-generated): ${assetUrl}`);
        await playUrl(assetUrl, role, clean, state.playbackRate, label, reqId);
        return;
      }

      // 2. Session blob cache (0 live API calls)
      const cacheKey = await computeNarrationCacheKey(role, clean);
      if (reqId !== requestCounterRef.current) return;

      const cachedUrl = cacheUrlsRef.current.get(cacheKey);
      if (cachedUrl) {
        const label = role === "COCO" ? "Coco" : "Conversation Partner";
        setState((prev) => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
        await playUrl(cachedUrl, role, clean, state.playbackRate, label, reqId);
        return;
      }

      // 3. Guest Review Mode never invokes live TTS
      if (isGuestMode) {
        if (reqId !== requestCounterRef.current) return;
        if (
          state.allowBrowserFallback &&
          typeof window !== "undefined" &&
          "speechSynthesis" in window
        ) {
          const utter = new SpeechSynthesisUtterance(transcript);
          utter.rate = role === "COCO" ? state.playbackRate : 1.0;
          utter.pitch = role === "COCO" ? 1.0 : 0.9;
          utter.onend = () => {
            if (reqId !== requestCounterRef.current) return;
            setState((p) => ({ ...p, speaking: false, synthesizing: false }));
          };
          window.speechSynthesis.speak(utter);
          setState((p) => ({
            ...p,
            synthesizing: false,
            speaking: true,
            sourceLabel: "Coco (Simulated Voice)",
            unavailableMessage: null,
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          synthesizing: false,
          speaking: false,
          sourceLabel: "Guest Mode • Simulated Response",
          unavailableMessage: null,
        }));
        onLog?.("Guest Review Mode: skipped live TTS call; displaying simulated text.");
        return;
      }

      // 4. Live TTS via /api/ai-gateway -> vocofloAiGateway (authenticated only)
      setState((prev) => ({ ...prev, liveTtsCalls: prev.liveTtsCalls + 1 }));
      const res = await callTrustedAiGateway({
        action: "tts_synthesize",
        purpose: "coco_tts",
        attemptOrSessionId: "web_tts",
        operationId: `op_tts_${cacheKey}`,
        payload: { role, text: transcript },
      });
      if (reqId !== requestCounterRef.current) return;

      if (!res.ok || !res.audioBase64) {
        const errMsg = res.errorMessage || "Voice audio unavailable right now.";
        onLog?.(`Live TTS failed: ${errMsg}`, true);

        if (
          state.allowBrowserFallback &&
          typeof window !== "undefined" &&
          "speechSynthesis" in window
        ) {
          const utter = new SpeechSynthesisUtterance(transcript);
          utter.rate = role === "COCO" ? state.playbackRate : 1.0;
          utter.pitch = role === "COCO" ? 1.0 : 0.9;
          utter.onend = () => {
            if (reqId !== requestCounterRef.current) return;
            setState((p) => ({ ...p, speaking: false, synthesizing: false }));
          };
          window.speechSynthesis.speak(utter);
          setState((p) => ({
            ...p,
            synthesizing: false,
            speaking: true,
            sourceLabel: "Browser Speech Fallback",
            unavailableMessage: "Using browser speech fallback because live voice was unavailable.",
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          synthesizing: false,
          speaking: false,
          sourceLabel: "Text Visible",
          unavailableMessage: "Voice audio is unavailable for this response; full text is shown below.",
        }));
        return;
      }

      const rawBytes = base64ToUint8Array(res.audioBase64);
      const wavBytes = ensureWavBytes(rawBytes, res.audioMimeType);
      const blob = new Blob([wavBytes.buffer as ArrayBuffer], { type: "audio/wav" });
      const blobUrl = URL.createObjectURL(blob);
      cacheUrlsRef.current.set(cacheKey, blobUrl);

      if (reqId !== requestCounterRef.current) return;
      const label = role === "COCO" ? "Coco" : "Conversation Partner";
      await playUrl(blobUrl, role, clean, state.playbackRate, label, reqId);
    },
    [isGuestMode, onLog, playUrl, state.allowBrowserFallback, state.playbackRate, stopAudioOnly]
  );

  const pauseOrStop = useCallback(() => {
    requestCounterRef.current += 1;
    stopAudioOnly();
    setState((prev) => ({
      ...prev,
      synthesizing: false,
      speaking: false,
      paused: Boolean(prev.activeText),
    }));
  }, [stopAudioOnly]);

  const stopBeforeMic = useCallback(() => {
    requestCounterRef.current += 1;
    stopAudioOnly();
    setState((prev) => ({
      ...prev,
      synthesizing: false,
      speaking: false,
      paused: false,
    }));
  }, [stopAudioOnly]);

  const getRequestEpoch = useCallback(() => requestCounterRef.current, []);

  const invalidatePendingRequests = useCallback(() => {
    requestCounterRef.current += 1;
  }, []);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      if (audioRef.current && state.activeRole === "COCO") {
        audioRef.current.playbackRate = rate;
      }
      setState((prev) => ({ ...prev, playbackRate: rate }));
    },
    [state.activeRole]
  );

  const setAudioDefaultEnabled = useCallback(
    (enabled: boolean) => {
      if (!enabled) pauseOrStop();
      setState((prev) => ({ ...prev, audioDefaultEnabled: enabled }));
    },
    [pauseOrStop]
  );

  const setAllowBrowserFallback = useCallback((allowed: boolean) => {
    setState((prev) => ({ ...prev, allowBrowserFallback: allowed }));
  }, []);

  return {
    state,
    speak,
    pauseOrStop,
    stopBeforeMic,
    getRequestEpoch,
    invalidatePendingRequests,
    setPlaybackRate,
    setAudioDefaultEnabled,
    setAllowBrowserFallback,
  };
}
