import { describe, expect, it } from "vitest";
import manifestJson from "@/content/narration-manifest.json";
import {
  computeNarrationCacheKey,
  ensureWavBytes,
  prepareTtsTranscript,
} from "@/lib/audio/wav";
import {
  buildPrivacyConsciousReport,
  formatReportAsMarkdown,
} from "@/lib/evidence/exporter";
import type { SpeechAttempt } from "@/types/vocoflo";

describe("wav utilities and privacy-conscious exporter", () => {
  it("prepends a valid 44-byte RIFF/WAVE header onto raw PCM audio", () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const wav = ensureWavBytes(pcm, "audio/L16;rate=24000");

    expect(wav.length).toBe(48);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...wav.slice(36, 40))).toBe("data");
  });

  it("matches Android narration manifest tts_v3 SHA-256 cacheKeys", async () => {
    const first = manifestJson.entries[0];
    const computed = await computeNarrationCacheKey(
      first.role as "COCO" | "ROLEPLAY_PARTNER",
      first.text
    );
    expect(computed).toBe(first.cacheKey);
    expect(prepareTtsTranscript("Coco: [warmly] Hello there!")).toBe("Hello there!");
  });

  it("omits disfluent transcripts by default in Evidence Export unless opted in", () => {
    const attempt: SpeechAttempt = {
      id: "att_1",
      userId: "user_12345678",
      sourceContext: "lesson_p01",
      activityOrSectionId: "P01-07",
      promptText: "Talk about something you enjoy",
      durationSeconds: 12.5,
      hasLocalAudio: true,
      analysisStatus: "success",
      disfluentTranscript: "I l-like playing chess on Sundays.",
      summaryObservation: "One brief repetition noted.",
      createdAtIso: "2026-11-23T10:00:00.000Z",
    };

    const defaultReport = buildPrivacyConsciousReport({
      uid: "user_12345678",
      entries: [],
      attempts: [attempt],
      speechEvents: [],
      options: { includeTranscripts: false },
    });

    expect(defaultReport.attempts[0].disfluentTranscript).toBeUndefined();
    expect(formatReportAsMarkdown(defaultReport)).not.toContain("I l-like playing chess");

    const optInReport = buildPrivacyConsciousReport({
      uid: "user_12345678",
      entries: [],
      attempts: [attempt],
      speechEvents: [],
      options: { includeTranscripts: true },
    });

    expect(optInReport.attempts[0].disfluentTranscript).toBe(
      "I l-like playing chess on Sundays."
    );
    expect(formatReportAsMarkdown(optInReport)).toContain("I l-like playing chess");
  });
});
