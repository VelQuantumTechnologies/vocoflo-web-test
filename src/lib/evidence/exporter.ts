import type { EvidenceLogEntry, SpeechAttempt, SpeechEvent } from "@/types/vocoflo";

export interface EvidenceExportOptions {
  includeTranscripts: boolean;
}

export interface PrivacyConsciousTestReport {
  exportedAtIso: string;
  harnessVersion: string;
  privacyNote: string;
  userUidPrefix: string | null;
  includeTranscripts: boolean;
  summary: {
    totalUiAndSystemEvents: number;
    totalGatewayCalls: number;
    failedGatewayCalls: number;
    totalCocoResponses: number;
    recordedAttemptsCount: number;
    speechEventsCount: number;
  };
  attempts: Array<{
    id: string;
    sourceContext: string;
    activityOrSectionId: string;
    durationSeconds: number;
    analysisStatus: string;
    analysisModel?: string;
    summaryObservation?: string | null;
    disfluentTranscript?: string;
    selfReportEffort?: number | null;
    createdAtIso: string;
  }>;
  speechEvents: Array<{
    id: string;
    attemptId: string;
    startSeconds: number;
    endSeconds: number;
    eventType: string;
    sourceKind: string;
    reviewState: string;
    correctedLabel?: string | null;
  }>;
  timeline: EvidenceLogEntry[];
}

export function buildPrivacyConsciousReport(params: {
  uid: string | null;
  entries: EvidenceLogEntry[];
  attempts: SpeechAttempt[];
  speechEvents: SpeechEvent[];
  options: EvidenceExportOptions;
}): PrivacyConsciousTestReport {
  const { uid, entries, attempts, speechEvents, options } = params;
  const gatewayCalls = entries.filter((e) => e.kind === "gateway_call");
  const failedGatewayCalls = gatewayCalls.filter(
    (e) => (e.httpStatus && e.httpStatus >= 400) || Boolean(e.errorMessage)
  );
  const cocoResponses = entries.filter((e) => e.kind === "coco_response");

  return {
    exportedAtIso: new Date().toISOString(),
    harnessVersion: "vocoflo-web-test-0.1.0",
    privacyNote: options.includeTranscripts
      ? "User opted in to include disfluent transcripts in this export. Raw audio bytes and credentials are never embedded in JSON/Markdown reports."
      : "Transcripts omitted by default per learner privacy settings. Raw audio bytes and credentials are never embedded in JSON/Markdown reports.",
    userUidPrefix: uid ? `${uid.slice(0, 6)}...` : null,
    includeTranscripts: options.includeTranscripts,
    summary: {
      totalUiAndSystemEvents: entries.length,
      totalGatewayCalls: gatewayCalls.length,
      failedGatewayCalls: failedGatewayCalls.length,
      totalCocoResponses: cocoResponses.length,
      recordedAttemptsCount: attempts.length,
      speechEventsCount: speechEvents.length,
    },
    attempts: attempts.map((a) => ({
      id: a.id,
      sourceContext: a.sourceContext,
      activityOrSectionId: a.activityOrSectionId,
      durationSeconds: a.durationSeconds,
      analysisStatus: a.analysisStatus,
      analysisModel: a.analysisModel,
      summaryObservation: a.summaryObservation ?? null,
      ...(options.includeTranscripts && a.disfluentTranscript
        ? { disfluentTranscript: a.disfluentTranscript }
        : {}),
      selfReportEffort: a.selfReportEffort ?? null,
      createdAtIso: a.createdAtIso,
    })),
    speechEvents: speechEvents.map((ev) => ({
      id: ev.id,
      attemptId: ev.attemptId,
      startSeconds: ev.startSeconds,
      endSeconds: ev.endSeconds,
      eventType: ev.eventType,
      sourceKind: ev.sourceKind,
      reviewState: ev.reviewState,
      correctedLabel: ev.correctedLabel ?? null,
    })),
    timeline: entries.map((entry) => ({ ...entry })),
  };
}

export function formatReportAsMarkdown(report: PrivacyConsciousTestReport): string {
  const lines: string[] = [
    "# VocoFlo Web Test Harness — Independent Evaluation Evidence",
    "",
    `- **Exported:** ${report.exportedAtIso}`,
    `- **Harness:** ${report.harnessVersion}`,
    `- **Test Account (prefix):** ${report.userUidPrefix || "signed-out"}`,
    `- **Privacy Policy:** ${report.privacyNote}`,
    "",
    "## Summary",
    `- Total timeline events: ${report.summary.totalUiAndSystemEvents}`,
    `- AI gateway calls: ${report.summary.totalGatewayCalls} (Failures: ${report.summary.failedGatewayCalls})`,
    `- Coco / Partner responses: ${report.summary.totalCocoResponses}`,
    `- Recorded speaking attempts: ${report.summary.recordedAttemptsCount}`,
    `- Speech moment annotations: ${report.summary.speechEventsCount}`,
    "",
    "## Speaking Attempts",
  ];

  if (report.attempts.length === 0) {
    lines.push("- None recorded.");
  } else {
    for (const att of report.attempts) {
      lines.push(
        `- **${att.activityOrSectionId}** (${att.sourceContext}, ${att.durationSeconds.toFixed(1)}s, status: \`${att.analysisStatus}\`, effort: ${att.selfReportEffort ?? "skipped"})`
      );
      if (att.summaryObservation) {
        lines.push(`  - Acoustic summary: ${att.summaryObservation}`);
      }
      if (report.includeTranscripts && att.disfluentTranscript) {
        lines.push(`  - Transcript (opt-in): "${att.disfluentTranscript}"`);
      }
    }
  }

  lines.push("", "## Chronological Evidence Log");
  for (const e of report.timeline) {
    const meta = [
      e.model ? `model=${e.model}` : null,
      typeof e.httpStatus === "number" ? `http=${e.httpStatus}` : null,
      typeof e.latencyMs === "number" ? `${e.latencyMs}ms` : null,
    ]
      .filter(Boolean)
      .join(", ");
    lines.push(
      `- \`${e.timestampIso}\` **[${e.kind}]** (${e.stage})${meta ? ` [${meta}]` : ""}: ${e.summary}`
    );
    if (e.cocoText) {
      lines.push(`  > ${e.cocoText}`);
    }
    if (e.errorMessage) {
      lines.push(`  - Error: \`${e.errorMessage}\``);
    }
  }

  return lines.join("\n");
}
