"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import {
  ArrowRight,
  ClipboardList,
  LogIn,
  LogOut,
  MessageCircleQuestion,
  ShieldAlert,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  buildLessonQaPrompt,
  getP01SectionsForBeat,
  sanitizeCocoOutput,
} from "@/lib/ai/coco-prompts";
import { callTrustedAiGateway } from "@/lib/ai/gateway-client";
import { blobToBase64, MAX_WEB_AUDIO_UPLOAD_BYTES } from "@/lib/audio/recorder";
import { useCoachVoice } from "@/lib/audio/useCoachVoice";
import { useMicRecorder } from "@/lib/audio/useMicRecorder";
import {
  ensureWebAppCheck,
  getFirebaseClientAuth,
  getGoogleProvider,
  getWebFirebaseStatus,
} from "@/lib/firebase/client";
import {
  loadLearnerContext,
  loadOrCreateLearnerProfile,
  persistCoachMemory,
  persistP01Progress,
  persistSpeechAttempt,
  persistSpeechEvent,
  persistTransferPlan,
  updateLearnerProfileFields,
  updateSpeechAttemptFields,
  updateSpeechEventReviewInFirestore,
} from "@/lib/firebase/repository";
import {
  mergeSpeechEventsPreservingReviews,
  parseSpeechAnalysisResponse,
} from "@/lib/speech/validation";
import type {
  CoachMemoryItem,
  EvidenceLogEntry,
  JourneyScope,
  LearnerProfile,
  LocalAudioClip,
  P01BeatId,
  SpeechAttempt,
  SpeechEvent,
  SpeechEventReviewState,
  SpeechEventType,
  SpeechTermMode,
} from "@/types/vocoflo";
import { AskCocoDrawer, type QaExchange } from "./AskCocoDrawer";
import { CheckInView } from "./CheckInView";
import { ConsentDialog } from "./ConsentDialog";
import { EvidenceExportModal } from "./EvidenceExportModal";
import { P01View } from "./P01View";
import { VocoFloWordmark } from "./VocoFloBranding";

const ONBOARDING_STEPS = [
  {
    step: 1,
    title: "Share Your Everyday Speaking Context",
    body: "Start with a relaxed Free Check-In across four real speaking conditions—personal sharing, describing a scene, reading aloud, and a live two-way catch-up—with zero grading or time pressure.",
  },
  {
    step: 2,
    title: "Speak First, Explore One Idea at a Time",
    body: "In Module P01, speak naturally before any concept is introduced, then explore separating a single speaking event from a wider verdict about who you are.",
  },
  {
    step: 3,
    title: "Optional Acoustic Mirror & Evidence Review",
    body: "Listen back to your clips, confirm or adjust tentative markers anytime, ask Coco questions scoped to your step, and export privacy-conscious evaluation logs.",
  },
];

export function VocoFloHarness() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [memories, setMemories] = useState<CoachMemoryItem[]>([]);
  const [attempts, setAttempts] = useState<SpeechAttempt[]>([]);
  const [events, setEvents] = useState<SpeechEvent[]>([]);
  const [localClips, setLocalClips] = useState<Record<string, LocalAudioClip>>({});
  const [evidenceEntries, setEvidenceEntries] = useState<EvidenceLogEntry[]>([]);

  const [view, setView] = useState<"hub" | "check_in" | "p01">("hub");
  const [introPage, setIntroPage] = useState(0);
  const [speechTermMode, setSpeechTermMode] = useState<SpeechTermMode>("stammering");
  const [showSettings, setShowSettings] = useState(false);

  // Consent state
  const [consentAuthorized, setConsentAuthorized] = useState(false);
  const [consentModalOpen, setConsentModalOpen] = useState(false);
  const pendingMicStartRef = useRef<(() => void) | null>(null);

  // Ask Coco Drawer state
  const [askCocoOpen, setAskCocoOpen] = useState(false);
  const [qaExchanges, setQaExchanges] = useState<QaExchange[]>([]);
  const [qaBusy, setQaBusy] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // JourneyScope tracking for Ask Coco
  const [activeP01Beat, setActiveP01Beat] = useState<P01BeatId>("p01_beat_1_mirror");
  const [scopeLabel, setScopeLabel] = useState("Hub & Orientation");
  const [completedStepTitles, setCompletedStepTitles] = useState<string[]>([]);
  const [unreachedStepTitles, setUnreachedStepTitles] = useState<string[]>([
    "Free Check-In",
    "P01 Lesson",
  ]);

  const firebaseStatus = useMemo(() => getWebFirebaseStatus(), []);

  const appendEvidence = useCallback(
    (entry: Omit<EvidenceLogEntry, "id" | "timestampIso">) => {
      setEvidenceEntries((prev) => [
        ...prev,
        {
          ...entry,
          id: `ev_${crypto.randomUUID().slice(0, 8)}`,
          timestampIso: new Date().toISOString(),
        },
      ]);
    },
    []
  );

  const voice = useCoachVoice(
    useCallback(
      (msg: string, isErr?: boolean) => {
        appendEvidence({
          kind: isErr ? "error" : "audio_event",
          stage: "Coach Voice",
          summary: msg,
          ...(isErr ? { errorMessage: msg } : {}),
        });
      },
      [appendEvidence]
    )
  );

  const mic = useMicRecorder(
    useCallback(
      (msg: string, isErr?: boolean) => {
        appendEvidence({
          kind: isErr ? "error" : "audio_event",
          stage: "Microphone",
          summary: msg,
          ...(isErr ? { errorMessage: msg } : {}),
        });
      },
      [appendEvidence]
    )
  );

  // Clean up dedicated local clip blob URLs on unmount
  const clipUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    const urls = clipUrlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  // Initialize Firebase Auth & Web App Check listener
  useEffect(() => {
    ensureWebAppCheck();
    const auth = getFirebaseClientAuth();
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthReady(true);

      if (!user) {
        setProfile(null);
        setMemories([]);
        setAttempts([]);
        setEvents([]);
        setConsentAuthorized(false);
        return;
      }

      const savedConsent = window.localStorage.getItem(`vocoflo_web_mic_consent_${user.uid}`);
      setConsentAuthorized(savedConsent === "granted");

      setLoadingProfile(true);
      try {
        const prof = await loadOrCreateLearnerProfile(
          user.uid,
          user.displayName || user.email?.split("@")[0] || "Test Reviewer"
        );
        const ctx = await loadLearnerContext(user.uid);
        setProfile(prof);
        setMemories(ctx.memories);
        setAttempts(ctx.attempts);
        setEvents(ctx.events);

        appendEvidence({
          kind: "ui_event",
          stage: "Auth & Firestore",
          summary: `Loaded isolated profile (completedCheckIn=${prof.completedCheckIn}, memories=${ctx.memories.length}, attempts=${ctx.attempts.length})`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not load Firestore profile.";
        setAuthError(msg);
        appendEvidence({
          kind: "error",
          stage: "Firestore Load",
          summary: "Profile load failed",
          errorMessage: msg,
        });
      } finally {
        setLoadingProfile(false);
      }
    });

    return () => unsub();
  }, [appendEvidence]);

  const handleSignIn = async () => {
    const auth = getFirebaseClientAuth();
    if (!auth) {
      setAuthError("Firebase Web configuration is incomplete.");
      return;
    }
    setAuthError(null);
    const provider = getGoogleProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string })?.code || "";
      if (code === "auth/popup-blocked") {
        await signInWithRedirect(auth, provider);
      } else {
        setAuthError(err instanceof Error ? err.message : "Google Sign-In failed.");
      }
    }
  };

  const handleSaveAttemptClip = useCallback(
    async (attempt: SpeechAttempt, blob?: Blob, mimeType?: string) => {
      setAttempts((prev) => [attempt, ...prev]);

      if (blob) {
        const clipUrl = URL.createObjectURL(blob);
        clipUrlsRef.current.push(clipUrl);
        setLocalClips((prev) => ({
          ...prev,
          [attempt.id]: {
            attemptId: attempt.id,
            label: `${attempt.activityOrSectionId} (${attempt.sourceContext})`,
            blobUrl: clipUrl,
            mimeType: mimeType || blob.type || "audio/webm",
            durationSeconds: attempt.durationSeconds,
            byteSize: blob.size,
            createdAtIso: attempt.createdAtIso,
          },
        }));
      }

      try {
        await persistSpeechAttempt(attempt);
      } catch (err) {
        appendEvidence({
          kind: "error",
          stage: "Firestore Attempt",
          summary: "Could not persist speech attempt",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [appendEvidence]
  );

  const handleRunSpeechAnalysis = useCallback(
    async (
      attempt: SpeechAttempt,
      blob: Blob,
      mimeType: string,
      purpose: "assessment_analysis" | "lesson_analysis" | "requested_inspection"
    ) => {
      if (blob.size > MAX_WEB_AUDIO_UPLOAD_BYTES) {
        const msg = "Clip exceeded 2.4 MB browser upload target; try a shorter recording.";
        setAttempts((prev) =>
          prev.map((a) =>
            a.id === attempt.id ? { ...a, analysisStatus: "failed", analysisError: msg } : a
          )
        );
        return {
          ok: false,
          transcript: null,
          summaryObservation: null,
          events: [] as SpeechEvent[],
          error: msg,
        };
      }

      const base64 = await blobToBase64(blob);
      const res = await callTrustedAiGateway({
        action: "speech_analysis",
        purpose,
        attemptOrSessionId: attempt.id,
        payload: {
          audioBase64: base64,
          mimeType,
          durationSeconds: attempt.durationSeconds,
          prompt: `Context: ${attempt.promptText.slice(0, 300)}`,
        },
        onLog: (log) =>
          appendEvidence({
            kind: log.kind,
            stage: `Speech Analysis (${attempt.activityOrSectionId})`,
            summary: log.summary,
            model: log.model,
            latencyMs: log.latencyMs,
            httpStatus: log.httpStatus,
            errorMessage: log.errorMessage,
          }),
      });

      if (!res.ok) {
        const errMsg = res.errorMessage || "Speech analysis unavailable.";
        setAttempts((prev) =>
          prev.map((a) =>
            a.id === attempt.id ? { ...a, analysisStatus: "failed", analysisError: errMsg } : a
          )
        );
        await updateSpeechAttemptFields(attempt.userId, attempt.id, {
          analysisStatus: "failed",
          analysisError: errMsg,
        }).catch(() => {});
        return {
          ok: false,
          transcript: null,
          summaryObservation: null,
          events: [] as SpeechEvent[],
          error: errMsg,
        };
      }

      try {
        const parsed = parseSpeechAnalysisResponse(res.text, Math.max(0.5, attempt.durationSeconds));
        const newEvents: SpeechEvent[] = parsed.events.map((ev, idx) => ({
          id: `sev_${attempt.id}_${idx}_${crypto.randomUUID().slice(0, 5)}`,
          userId: attempt.userId,
          attemptId: attempt.id,
          startSeconds: ev.startSeconds,
          endSeconds: ev.endSeconds,
          eventType: ev.eventType,
          wordOrSound: ev.wordOrSound,
          tentativeObservation: ev.tentativeObservation,
          sourceKind: "ai_observed",
          reviewState: "unreviewed",
        }));

        const existingForAttempt = events.filter((e) => e.attemptId === attempt.id);
        const { eventIdsToDelete, eventsToInsert } = mergeSpeechEventsPreservingReviews(
          existingForAttempt,
          newEvents
        );

        setEvents((prev) => [
          ...prev.filter((e) => !eventIdsToDelete.includes(e.id)),
          ...eventsToInsert,
        ]);

        setAttempts((prev) =>
          prev.map((a) =>
            a.id === attempt.id
              ? {
                  ...a,
                  analysisStatus: "success",
                  analysisModel: res.model,
                  disfluentTranscript: parsed.disfluentTranscript,
                  summaryObservation: parsed.summaryObservation,
                  analysisError: null,
                }
              : a
          )
        );

        await updateSpeechAttemptFields(attempt.userId, attempt.id, {
          analysisStatus: "success",
          analysisModel: res.model,
          ...(parsed.disfluentTranscript
            ? { disfluentTranscript: parsed.disfluentTranscript }
            : {}),
          summaryObservation: parsed.summaryObservation,
        }).catch(() => {});

        await Promise.all(eventsToInsert.map((e) => persistSpeechEvent(e).catch(() => {})));

        return {
          ok: true,
          transcript: parsed.disfluentTranscript,
          summaryObservation: parsed.summaryObservation,
          events: eventsToInsert,
          error: null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unexpected analysis format.";
        setAttempts((prev) =>
          prev.map((a) =>
            a.id === attempt.id ? { ...a, analysisStatus: "failed", analysisError: msg } : a
          )
        );
        return {
          ok: false,
          transcript: null,
          summaryObservation: null,
          events: [] as SpeechEvent[],
          error: msg,
        };
      }
    },
    [appendEvidence, events]
  );

  const handleUpdateEventReview = useCallback(
    (
      eventId: string,
      reviewState: SpeechEventReviewState,
      eventType?: SpeechEventType,
      correctedLabel?: string,
      correctionNote?: string
    ) => {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === eventId
            ? {
                ...ev,
                reviewState,
                ...(eventType ? { eventType } : {}),
                ...(correctedLabel ? { correctedLabel } : {}),
                ...(correctionNote ? { correctionNote } : {}),
              }
            : ev
        )
      );
      if (authUser) {
        updateSpeechEventReviewInFirestore(
          authUser.uid,
          eventId,
          reviewState,
          eventType,
          correctedLabel,
          correctionNote
        ).catch(() => {});
      }
      appendEvidence({
        kind: "ui_event",
        stage: "Acoustic Mirror",
        summary: `Learner marked moment ${eventId.slice(0, 10)} as ${reviewState}`,
      });
    },
    [appendEvidence, authUser]
  );

  const handleAddUserMoment = useCallback(
    (attemptId: string, startSeconds: number, wordOrSound: string, note: string) => {
      if (!authUser) return;
      const newEvt: SpeechEvent = {
        id: `sev_user_${crypto.randomUUID().slice(0, 8)}`,
        userId: authUser.uid,
        attemptId,
        startSeconds,
        endSeconds: Number((startSeconds + 0.5).toFixed(2)),
        eventType: "user_reported_block",
        wordOrSound: wordOrSound || null,
        tentativeObservation: note,
        sourceKind: "user_reported",
        reviewState: "confirmed",
      };
      setEvents((prev) => [...prev, newEvt]);
      persistSpeechEvent(newEvt).catch(() => {});
      appendEvidence({
        kind: "ui_event",
        stage: "Acoustic Mirror",
        summary: `Learner added user-reported moment at ${startSeconds.toFixed(1)}s`,
      });
    },
    [appendEvidence, authUser]
  );

  const journeyScope: JourneyScope = useMemo(
    () => ({
      checkInCompleted: Boolean(profile?.completedCheckIn),
      currentStageLabel: scopeLabel,
      completedStepTitles,
      unreachedStepTitles,
      reachedSectionSummaries: view === "p01" ? getP01SectionsForBeat(activeP01Beat) : [],
      recentAttempts: attempts.slice(0, 6),
      speechEvents: events.slice(0, 20),
      sharedMemories: memories,
      speechTermMode,
    }),
    [
      activeP01Beat,
      attempts,
      completedStepTitles,
      events,
      memories,
      profile?.completedCheckIn,
      scopeLabel,
      speechTermMode,
      unreachedStepTitles,
      view,
    ]
  );

  const handleAskCoco = async (question: string) => {
    setQaBusy(true);
    setQaError(null);
    try {
      const prompt = buildLessonQaPrompt(journeyScope, question);
      const res = await callTrustedAiGateway({
        action: "coach_generate",
        purpose: "coco_qa",
        attemptOrSessionId: `qa_${view}`,
        payload: { prompt },
      });
      if (!res.ok) {
        setQaError(res.errorMessage || "Ask Coco could not reply right now.");
        return;
      }
      const clean = sanitizeCocoOutput(res.text);
      setQaExchanges((prev) => [
        ...prev,
        {
          id: `qa_${crypto.randomUUID().slice(0, 6)}`,
          question,
          answer: clean,
          timestampIso: new Date().toISOString(),
        },
      ]);
      appendEvidence({
        kind: "coco_response",
        stage: `Ask Coco (${scopeLabel})`,
        summary: `Coco answered learner question: "${question.slice(0, 60)}"`,
        model: res.model,
        latencyMs: res.latencyMs,
        cocoText: clean,
      });
      if (voice.state.audioDefaultEnabled && clean) {
        voice.speak(clean, "COCO");
      }
    } finally {
      setQaBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-emeraldCanvas text-creamInk">
      {/* Staging & Fidelity Top Notice */}
      <div className="border-b border-emeraldBorder bg-deskGreen px-4 py-2 text-center text-[11px] text-softMintInk/90">
        <span className="font-semibold text-mintAccent">Private Staging Test Harness</span> •
        Separate Next.js web evaluation environment (`vocoflo-web-test`). Android app &amp;
        `www.vocoflo.com` remain untouched. Browser audio fidelity has not yet been compared to
        Android.
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-emeraldBorder bg-emeraldCanvas/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              voice.pauseOrStop();
              mic.reset();
              setView("hub");
              setScopeLabel("Hub & Orientation");
            }}
            className="text-left"
          >
            <VocoFloWordmark />
          </button>

          {authUser ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAskCocoOpen(true)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-emeraldStrongBorder bg-emeraldSurface px-3.5 py-1.5 text-xs font-semibold text-mintAccent hover:bg-emeraldRaised"
              >
                <MessageCircleQuestion className="h-4 w-4" />
                Ask Coco
              </button>

              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-emeraldStrongBorder bg-emeraldSurface px-3.5 py-1.5 text-xs font-semibold text-creamInk hover:bg-emeraldRaised"
              >
                <ClipboardList className="h-4 w-4 text-warmGold" />
                Evidence &amp; Export ({evidenceEntries.length})
              </button>

              <button
                type="button"
                onClick={() => setShowSettings((s) => !s)}
                aria-label="Audio and Privacy Controls"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-full border border-emeraldBorder px-3 py-1.5 text-xs text-mutedSage hover:text-creamInk"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Controls
              </button>

              <button
                type="button"
                onClick={() => {
                  const auth = getFirebaseClientAuth();
                  if (auth) signOut(auth);
                }}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-full border border-emeraldBorder px-3 py-1.5 text-xs text-mutedSage hover:text-softCoral"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          ) : null}
        </div>

        {/* Collapsible Voice / Speed / Consent Settings Bar */}
        {showSettings && authUser ? (
          <div className="border-t border-emeraldBorder bg-emeraldSurface px-4 py-3">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => voice.setAudioDefaultEnabled(!voice.state.audioDefaultEnabled)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emeraldStrongBorder px-3 py-1 text-softMintInk"
                >
                  {voice.state.audioDefaultEnabled ? (
                    <Volume2 className="h-3.5 w-3.5 text-mintAccent" />
                  ) : (
                    <VolumeX className="h-3.5 w-3.5 text-mutedSage" />
                  )}
                  Audio Default: {voice.state.audioDefaultEnabled ? "ON" : "Text First"}
                </button>

                <div className="flex items-center gap-1">
                  <span className="text-mutedSage">Coco Speed:</span>
                  {[1.1, 1.15, 1.2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => voice.setPlaybackRate(spd)}
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] ${
                        voice.state.playbackRate === spd
                          ? "bg-mintAccent font-semibold text-sageInk"
                          : "border border-emeraldBorder text-mutedSage"
                      }`}
                    >
                      {spd.toFixed(2)}x
                    </button>
                  ))}
                </div>

                <label className="flex cursor-pointer items-center gap-1.5 text-mutedSage">
                  <input
                    type="checkbox"
                    checked={voice.state.allowBrowserFallback}
                    onChange={(e) => voice.setAllowBrowserFallback(e.target.checked)}
                    className="accent-mintAccent"
                  />
                  Browser speech fallback if TTS unavailable
                </label>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-mutedSage">
                  TTS Cache: {voice.state.preGeneratedHits} bundled / {voice.state.liveTtsCalls}{" "}
                  live
                </span>
                <button
                  type="button"
                  onClick={() => setConsentModalOpen(true)}
                  className="text-mintAccent underline"
                >
                  Mic Consent ({consentAuthorized ? "Granted" : "Not Granted"})
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Diagnostic Warning if Web App Check / Firebase isn't ready */}
        {!firebaseStatus.appCheckConfigured ? (
          <div className="mb-6 rounded-2xl border border-warmGold/60 bg-emeraldSurface p-4 text-xs text-warmGold">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  Web App Check Not Yet Active (`NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` unset)
                </p>
                <p className="mt-1 text-mutedSage">
                  Sign-in and UI navigation can be inspected, but live AI calls (`/api/ai-gateway`)
                  require a valid Web App Check reCAPTCHA Enterprise site key (or local dev debug
                  token). Missing: {firebaseStatus.missingItems.join(", ")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {authError ? (
          <div className="mb-6 rounded-2xl border border-softCoral/50 bg-coralContainer/70 p-4 text-xs text-coralOnContainer">
            {authError}
          </div>
        ) : null}

        {!authReady ? (
          <div className="rounded-2xl border border-emeraldBorder bg-emeraldSurface p-8 text-center text-sm text-mutedSage">
            Checking test session…
          </div>
        ) : !authUser ? (
          /* WELCOME & SIGN-IN SCREEN */
          <div className="grid gap-6 md:grid-cols-5">
            <div className="space-y-5 rounded-3xl border border-emeraldStrongBorder bg-emeraldSurface p-6 md:col-span-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-emeraldField px-3 py-1 text-xs font-medium text-mintAccent">
                Independent Browser Evaluation Harness
              </div>
              <h1 className="font-display text-3xl font-semibold leading-tight text-creamInk">
                VocoFlo — Calm Speaking Coaching With Coco
              </h1>
              <p className="text-sm leading-relaxed text-softMintInk">
                Test the full Free Speaking Check-In and Module P01 (&ldquo;Your Identity With Your
                Speech&rdquo;) directly in your browser using Coco&rsquo;s Sulafat voice, Orus
                partner voice, real microphone recording, and privacy-conscious evidence export.
              </p>

              <div className="rounded-2xl border border-warmGold/40 bg-emeraldCanvas p-4 text-xs text-softMintInk">
                <p className="font-semibold text-warmGold">Use an Isolated Test Account</p>
                <p className="mt-1 text-mutedSage">
                  Sign in with a dedicated test Google account so you do not overwrite your personal
                  Android Check-In history or memories.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSignIn}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-sagePill px-6 py-3 text-sm font-semibold text-sageInk transition hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                Sign In With Test Google Account
              </button>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-3xl border border-emeraldBorder bg-emeraldSurface p-5 md:col-span-2">
              <Image
                src="/images/coco-studio.jpg"
                alt="Warm calm VocoFlo studio aesthetic"
                width={640}
                height={420}
                className="h-52 w-full rounded-2xl object-cover"
              />
              <div className="space-y-2 text-xs text-mutedSage">
                <p className="font-semibold text-creamInk">Environment Diagnostics</p>
                <p>
                  Firebase Web App:{" "}
                  <span className="text-mintAccent">
                    {firebaseStatus.firebaseConfigured ? "Configured" : "Missing keys"}
                  </span>
                </p>
                <p>
                  Web App Check Mode:{" "}
                  <span className="font-mono text-creamInk">{firebaseStatus.appCheckMode}</span>
                </p>
              </div>
            </div>
          </div>
        ) : loadingProfile ? (
          <div className="rounded-2xl border border-emeraldBorder bg-emeraldSurface p-8 text-center text-sm text-mutedSage">
            Loading isolated Firestore learner profile…
          </div>
        ) : view === "hub" ? (
          /* SIGNED-IN HUB WITH 3-STEP PAGED INTRO + FLOW SELECTION */
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emeraldBorder bg-emeraldSurface p-5">
              <div>
                <p className="text-xs text-mutedSage">
                  Signed in as <strong className="text-creamInk">{authUser.email}</strong>
                </p>
                <p className="mt-1 text-xs text-mintAccent">
                  Check-In: {profile?.completedCheckIn ? "Completed" : "Not yet completed"} •
                  Memories: {memories.length} • Attempts: {attempts.length}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setView("check_in");
                    setScopeLabel("Free Check-In • Orientation");
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-sagePill px-5 py-2 text-xs font-semibold text-sageInk hover:opacity-90"
                >
                  Start Free Check-In
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView("p01");
                    setActiveP01Beat("p01_beat_1_mirror");
                    setScopeLabel("P01 • Beat 1: The Mirror");
                  }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-emeraldStrongBorder px-5 py-2 text-xs font-semibold text-creamInk hover:bg-emeraldRaised"
                >
                  Open Module P01
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Paged 3-Step Rhythm (1 step per page with Next Step button) */}
            <div className="rounded-3xl border border-emeraldStrongBorder bg-emeraldSurface p-6">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
                  How VocoFlo Works • Step {ONBOARDING_STEPS[introPage].step} of 3
                </p>
                <div className="flex gap-1.5">
                  {ONBOARDING_STEPS.map((s, i) => (
                    <button
                      key={s.step}
                      type="button"
                      onClick={() => setIntroPage(i)}
                      aria-label={`Step ${s.step}`}
                      className={`h-2.5 w-8 rounded-full transition ${
                        i === introPage ? "bg-mintAccent" : "bg-emeraldBorder"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <h2 className="mt-4 font-display text-2xl font-semibold text-creamInk">
                {ONBOARDING_STEPS[introPage].title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-softMintInk">
                {ONBOARDING_STEPS[introPage].body}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                {introPage > 0 ? (
                  <button
                    type="button"
                    onClick={() => setIntroPage((p) => p - 1)}
                    className="rounded-full border border-emeraldStrongBorder px-4 py-2 text-xs text-creamInk hover:bg-emeraldRaised"
                  >
                    Previous
                  </button>
                ) : (
                  <span />
                )}

                {introPage < ONBOARDING_STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setIntroPage((p) => p + 1)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-sagePill px-5 py-2 text-xs font-semibold text-sageInk hover:opacity-90"
                  >
                    Next Step
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setView("check_in");
                      setScopeLabel("Free Check-In • Orientation");
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-sagePill px-5 py-2 text-xs font-semibold text-sageInk hover:opacity-90"
                  >
                    Begin Free Check-In
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : view === "check_in" ? (
          <CheckInView
            uid={authUser.uid}
            speechTermMode={speechTermMode}
            onChangeSpeechTermMode={setSpeechTermMode}
            initialGoals={profile?.chosenGoals || []}
            initialSituations={profile?.importantSituations || []}
            attempts={attempts}
            events={events}
            localClips={localClips}
            voiceState={voice.state}
            onPlayAudio={(txt, role) => voice.speak(txt, role)}
            onPauseAudio={() => voice.pauseOrStop()}
            micState={mic.state}
            audioConsentAuthorized={consentAuthorized}
            onRequestConsent={(onReady) => {
              pendingMicStartRef.current = onReady;
              setConsentModalOpen(true);
            }}
            onBeforeStartMic={() => voice.stopBeforeMic()}
            onStartMic={() => mic.start()}
            onStopMic={() => mic.stop()}
            onResetMic={() => mic.reset()}
            onSaveContext={async (goals, situations) => {
              await updateLearnerProfileFields(authUser.uid, {
                chosenGoals: goals,
                importantSituations: situations,
              });
              setProfile((p) =>
                p ? { ...p, chosenGoals: goals, importantSituations: situations } : p
              );
              const newMemories: CoachMemoryItem[] = [];
              if (situations.length > 0) {
                newMemories.push({
                  id: "mem_checkin_situations",
                  userId: authUser.uid,
                  category: "context",
                  fact: `Important speaking situations: ${situations.join(", ")}`,
                  sourceKind: "user_report",
                  sourceReference: "web_check_in_context",
                });
              }
              if (goals.length > 0) {
                newMemories.push({
                  id: "mem_checkin_goals",
                  userId: authUser.uid,
                  category: "goal",
                  fact: `Goal: ${goals.join(", ")}`,
                  sourceKind: "user_report",
                  sourceReference: "web_check_in_context",
                });
              }
              await Promise.all(newMemories.map((m) => persistCoachMemory(m).catch(() => {})));
              setMemories((prev) => {
                const map = new Map(prev.map((m) => [m.id, m]));
                newMemories.forEach((m) => map.set(m.id, m));
                return Array.from(map.values());
              });
            }}
            onSaveAttemptClip={handleSaveAttemptClip}
            onUpdateAttemptEffort={async (attId, effort) => {
              setAttempts((prev) =>
                prev.map((a) => (a.id === attId ? { ...a, selfReportEffort: effort } : a))
              );
              await updateSpeechAttemptFields(authUser.uid, attId, {
                selfReportEffort: effort,
              }).catch(() => {});
            }}
            onRunSpeechAnalysis={handleRunSpeechAnalysis}
            onUpdateEventReview={handleUpdateEventReview}
            onAddUserMoment={handleAddUserMoment}
            onCompleteCheckIn={async (debrief) => {
              await updateLearnerProfileFields(authUser.uid, {
                completedCheckIn: true,
                onboardingSeen: true,
              });
              setProfile((p) => (p ? { ...p, completedCheckIn: true } : p));
              appendEvidence({
                kind: "ui_event",
                stage: "Free Check-In",
                summary: `Check-In marked complete (debrief ${debrief.length} chars)`,
              });
            }}
            onLogEvidence={appendEvidence}
            onStageChange={(label, comp, unr) => {
              setScopeLabel(label);
              setCompletedStepTitles(comp);
              setUnreachedStepTitles(unr);
            }}
            onGoToP01={() => {
              voice.pauseOrStop();
              mic.reset();
              setView("p01");
              setActiveP01Beat("p01_beat_1_mirror");
              setScopeLabel("P01 • Beat 1: The Mirror");
            }}
          />
        ) : (
          <P01View
            uid={authUser.uid}
            profile={profile}
            memories={memories}
            attempts={attempts}
            events={events}
            localClips={localClips}
            speechTermMode={speechTermMode}
            voiceState={voice.state}
            onPlayAudio={(txt, role) => voice.speak(txt, role)}
            onPauseAudio={() => voice.pauseOrStop()}
            micState={mic.state}
            audioConsentAuthorized={consentAuthorized}
            onRequestConsent={(onReady) => {
              pendingMicStartRef.current = onReady;
              setConsentModalOpen(true);
            }}
            onBeforeStartMic={() => voice.stopBeforeMic()}
            onStartMic={() => mic.start()}
            onStopMic={() => mic.stop()}
            onResetMic={() => mic.reset()}
            onSaveAttemptClip={handleSaveAttemptClip}
            onRunSpeechAnalysis={handleRunSpeechAnalysis}
            onUpdateEventReview={handleUpdateEventReview}
            onAddUserMoment={handleAddUserMoment}
            onSaveP01Progress={async (beatIdx, comp, skip, completed, reviewChoice) => {
              await persistP01Progress(
                authUser.uid,
                beatIdx,
                comp,
                skip,
                completed,
                reviewChoice
              ).catch(() => {});
            }}
            onSaveTransferPlanAndMemory={async (plan, saveMem) => {
              await persistTransferPlan(plan).catch(() => {});
              if (saveMem) {
                const mem: CoachMemoryItem = {
                  id: `mem_p01_transfer_${crypto.randomUUID().slice(0, 6)}`,
                  userId: authUser.uid,
                  category: "transfer_plan",
                  fact: `${plan.situation}: ${plan.smallAction}`,
                  sourceKind: "user_confirmed",
                  sourceReference: "P01_beat_5",
                };
                await persistCoachMemory(mem).catch(() => {});
                setMemories((prev) => [...prev, mem]);
              }
            }}
            onLogEvidence={appendEvidence}
            onSyncScope={(beatId, comp, unr) => {
              setActiveP01Beat(beatId);
              setScopeLabel(`P01 • ${beatId}`);
              setCompletedStepTitles(comp);
              setUnreachedStepTitles(unr);
            }}
          />
        )}
      </main>

      <ConsentDialog
        open={consentModalOpen}
        alreadyAuthorized={consentAuthorized}
        onClose={() => {
          pendingMicStartRef.current = null;
          setConsentModalOpen(false);
        }}
        onAuthorizeAndProceed={() => {
          if (authUser) {
            window.localStorage.setItem(`vocoflo_web_mic_consent_${authUser.uid}`, "granted");
          }
          setConsentAuthorized(true);
          setConsentModalOpen(false);
          appendEvidence({
            kind: "ui_event",
            stage: "Mic Consent",
            summary: "Learner granted explicit mic capture and speech-detection disclosure.",
          });
          const pending = pendingMicStartRef.current;
          pendingMicStartRef.current = null;
          if (pending) {
            voice.stopBeforeMic();
            pending();
          }
        }}
        onRevoke={() => {
          if (authUser) {
            window.localStorage.removeItem(`vocoflo_web_mic_consent_${authUser.uid}`);
          }
          setConsentAuthorized(false);
          mic.reset();
        }}
      />

      <AskCocoDrawer
        open={askCocoOpen}
        onClose={() => setAskCocoOpen(false)}
        scope={journeyScope}
        micRecordingActive={mic.state.status === "recording"}
        exchanges={qaExchanges}
        busy={qaBusy}
        errorMessage={qaError}
        onAskQuestion={handleAskCoco}
        voiceState={voice.state}
        onPlayAudio={(txt, role) => voice.speak(txt, role)}
        onPauseAudio={() => voice.pauseOrStop()}
      />

      <EvidenceExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        uid={authUser?.uid || null}
        entries={evidenceEntries}
        attempts={attempts}
        speechEvents={events}
        localClips={Object.values(localClips)}
      />
    </div>
  );
}
