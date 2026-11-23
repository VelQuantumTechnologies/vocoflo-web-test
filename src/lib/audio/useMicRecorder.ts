"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  inspectAudioBlobSignal,
  MAX_WEB_AUDIO_UPLOAD_BYTES,
  pickSupportedAudioMimeType,
} from "./recorder";

export type MicRecordingState =
  | { status: "idle" }
  | { status: "recording"; elapsedSeconds: number; level: number }
  | {
      status: "completed";
      blob: Blob;
      blobUrl: string;
      mimeType: string;
      durationSeconds: number;
      isSilent: boolean;
      warning: string | null;
    }
  | { status: "error"; message: string };

export function useMicRecorder(onLog?: (msg: string, isError?: boolean) => void) {
  const [state, setState] = useState<MicRecordingState>({ status: "idle" });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cancelledRef = useRef<boolean>(false);
  const activeUrlRef = useRef<string | null>(null);

  const cleanupStreams = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    cleanupStreams();
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
    setState({ status: "idle" });
  }, [cleanupStreams]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && mediaRecorderRef.current?.state === "recording") {
        onLog?.("Microphone stopped cleanly when tab lost focus (no background capture).");
        mediaRecorderRef.current.stop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      reset();
    };
  }, [onLog, reset]);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState({
        status: "error",
        message: "Browser microphone capture (MediaRecorder / getUserMedia) is unavailable here.",
      });
      return;
    }

    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }

    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
      }

      const preferredMime = pickSupportedAudioMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime, audioBitsPerSecond: 64_000 })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const elapsed = Math.max(0.4, (performance.now() - startedAtRef.current) / 1000);
        const finalMime = recorder.mimeType || preferredMime || "audio/webm";
        cleanupStreams();

        if (cancelledRef.current) {
          return;
        }

        const blob = new Blob(chunksRef.current, { type: finalMime });
        if (blob.size === 0) {
          setState({
            status: "error",
            message: "No audio bytes were captured. Check your microphone input and try again.",
          });
          return;
        }

        const signal = await inspectAudioBlobSignal(blob);
        const durationSeconds =
          signal && signal.decodedDurationSeconds > 0
            ? signal.decodedDurationSeconds
            : Number(elapsed.toFixed(1));

        let warning: string | null = null;
        if (signal?.isEffectivelySilent) {
          warning =
            "Recording appears quiet/silent (RMS below threshold). You can re-record or check your mic input.";
        } else if (blob.size > MAX_WEB_AUDIO_UPLOAD_BYTES) {
          warning =
            "Recording exceeds the 2.4 MB browser upload target for the staging proxy; try a shorter clip (~20–60s).";
        }

        const blobUrl = URL.createObjectURL(blob);
        activeUrlRef.current = blobUrl;

        onLog?.(
          `Mic recording finished (${durationSeconds.toFixed(1)}s, ${(blob.size / 1024).toFixed(0)} KB, mime=${finalMime}${signal ? `, rms=${signal.rmsAmplitude16Bit}` : ""})`
        );

        setState({
          status: "completed",
          blob,
          blobUrl,
          mimeType: finalMime,
          durationSeconds,
          isSilent: Boolean(signal?.isEffectivelySilent),
          warning,
        });
      };

      startedAtRef.current = performance.now();
      recorder.start(250);
      setState({ status: "recording", elapsedSeconds: 0, level: 0 });
      onLog?.("Microphone started explicitly by user.");

      const buf = new Uint8Array(128);
      timerRef.current = window.setInterval(() => {
        const secs = Math.floor((performance.now() - startedAtRef.current) / 1000);
        let level = 0;
        if (analyserRef.current) {
          analyserRef.current.getByteTimeDomainData(buf);
          let maxDev = 0;
          for (let i = 0; i < buf.length; i++) {
            const dev = Math.abs(buf[i] - 128);
            if (dev > maxDev) maxDev = dev;
          }
          level = Math.min(1, maxDev / 64);
        }
        setState({ status: "recording", elapsedSeconds: secs, level });
      }, 150);
    } catch (err) {
      cleanupStreams();
      const msg =
        err instanceof Error
          ? err.message
          : "Microphone permission was denied or no mic device was found.";
      onLog?.(`Mic error: ${msg}`, true);
      setState({
        status: "error",
        message: `${msg} You can grant mic permission or use the typed fallback below.`,
      });
    }
  }, [cleanupStreams, onLog]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { state, start, stop, reset };
}
