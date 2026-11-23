import manifestJson from "@/content/narration-manifest.json";
import type { VoiceRole } from "@/types/vocoflo";

export const TTS_CACHE_VERSION = "tts_v3";

interface NarrationManifestEntry {
  cueId: string;
  role: VoiceRole;
  voiceName: string;
  cacheKey: string;
  assetPath: string;
  text: string;
  status: string;
}

const manifestEntries = (manifestJson.entries || []) as NarrationManifestEntry[];

export function prepareTtsTranscript(rawText: string): string {
  const leadingPrefix = /^(?:Coco|Partner|Coach|Assistant|Speaker\s*\d*)\s*:\s*/i;
  const leakedMeta =
    /^(?:You\s+are\s+Coco\b|Role\s*:|System\s*:|Instructions?\s*:|Voice\s*&\s*Persona\b|Read\s+aloud\s+cleanly\b|STRICT\s+JOURNEY\s+BOUNDARY\b)/i;
  const stageDir =
    /\[(?:pause|warmly|softly|gentle\s+tone|smile|sigh|breathe|breath|coach|coco|partner)[^\]]*\]/gi;

  return rawText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^"|"$/g, "")
        .replace(leadingPrefix, "")
        .replace(stageDir, " ")
        .replace(/[*_`#]+/g, "")
        .trim()
    )
    .filter((line) => line.length > 0 && !leakedMeta.test(line))
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function computeNarrationCacheKey(
  role: VoiceRole,
  rawText: string
): Promise<string> {
  const prepared = prepareTtsTranscript(rawText);
  const input = `${TTS_CACHE_VERSION}:${role}:${prepared}`;
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 24);
}

export async function lookupPreGeneratedAssetUrl(
  role: VoiceRole,
  rawText: string
): Promise<string | null> {
  const key = await computeNarrationCacheKey(role, rawText);
  const match = manifestEntries.find(
    (entry) => entry.cacheKey === key && entry.role === role && entry.status === "bundled"
  );
  if (match) {
    return `/${match.assetPath}`;
  }
  const normalized = prepareTtsTranscript(rawText);
  const textMatch = manifestEntries.find(
    (entry) =>
      entry.role === role &&
      entry.status === "bundled" &&
      prepareTtsTranscript(entry.text) === normalized
  );
  return textMatch ? `/${textMatch.assetPath}` : null;
}

export function extractSampleRateFromMime(mimeType: string | null | undefined): number {
  if (!mimeType) return 24_000;
  const m = /rate=(\d+)/i.exec(mimeType);
  const parsed = m ? Number(m[1]) : 24_000;
  return Number.isFinite(parsed) && parsed >= 8_000 && parsed <= 96_000 ? parsed : 24_000;
}

export function ensureWavBytes(
  rawBytes: Uint8Array,
  mimeType: string | null | undefined
): Uint8Array {
  const isRiff =
    rawBytes.length >= 4 &&
    rawBytes[0] === 0x52 && // R
    rawBytes[1] === 0x49 && // I
    rawBytes[2] === 0x46 && // F
    rawBytes[3] === 0x46; // F

  if (isRiff) {
    return rawBytes;
  }

  const sampleRate = extractSampleRateFromMime(mimeType);
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = rawBytes.byteLength;
  const chunkSize = 36 + dataSize;

  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      out[offset + i] = str.charCodeAt(i);
    }
  };

  ascii(0, "RIFF");
  view.setUint32(4, chunkSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);
  out.set(rawBytes, 44);
  return out;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
