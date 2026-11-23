export const MIN_AUDIBLE_PEAK_16BIT = 150;
export const MIN_AUDIBLE_RMS_16BIT = 30.0;
export const MAX_WEB_AUDIO_UPLOAD_BYTES = 2_400_000;

export interface SignalInspectionResult {
  peakAmplitude16Bit: number;
  rmsAmplitude16Bit: number;
  isEffectivelySilent: boolean;
  decodedDurationSeconds: number;
}

export function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

export async function inspectAudioBlobSignal(blob: Blob): Promise<SignalInspectionResult | null> {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  const ctx = new AudioCtx();
  try {
    const buffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buffer);
    const channelData = audioBuffer.getChannelData(0);
    if (!channelData || channelData.length === 0) {
      return {
        peakAmplitude16Bit: 0,
        rmsAmplitude16Bit: 0,
        isEffectivelySilent: true,
        decodedDurationSeconds: 0,
      };
    }

    let peakFloat = 0;
    let sumSq = 0;
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.abs(channelData[i]);
      if (sample > peakFloat) peakFloat = sample;
      sumSq += sample * sample;
    }
    const rmsFloat = Math.sqrt(sumSq / channelData.length);
    const peak16 = Math.round(peakFloat * 32767);
    const rms16 = rmsFloat * 32767;

    return {
      peakAmplitude16Bit: peak16,
      rmsAmplitude16Bit: Number(rms16.toFixed(1)),
      isEffectivelySilent: peak16 < MIN_AUDIBLE_PEAK_16BIT && rms16 < MIN_AUDIBLE_RMS_16BIT,
      decodedDurationSeconds: Number(audioBuffer.duration.toFixed(2)),
    };
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
