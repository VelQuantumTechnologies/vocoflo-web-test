"use client";

import React from "react";
import { ShieldCheck, Mic, X } from "lucide-react";

interface ConsentDialogProps {
  open: boolean;
  alreadyAuthorized: boolean;
  isGuestMode?: boolean;
  onClose: () => void;
  onAuthorizeAndProceed: () => void;
  onRevoke?: () => void;
}

export function ConsentDialog({
  open,
  alreadyAuthorized,
  isGuestMode = false,
  onClose,
  onAuthorizeAndProceed,
  onRevoke,
}: ConsentDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-dialog-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-emeraldStrongBorder bg-emeraldSurface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emeraldField text-mintAccent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="consent-dialog-title"
                className="font-display text-lg font-semibold text-creamInk"
              >
                Microphone &amp; Speech Processing Notice
              </h2>
              <p className="text-xs text-mutedSage">
                {isGuestMode
                  ? "Guest Review Mode • Local browser audio only"
                  : "Explicit consent before audio capture"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-mutedSage hover:bg-emeraldRaised hover:text-creamInk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-softMintInk">
          <p>
            When you tap <strong>Start Speaking</strong>, your browser requests microphone
            access only while you are actively recording and this tab stays in focus.
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-xs text-mutedSage">
            <li>
              <strong className="text-creamInk">Local browser playback:</strong> Recorded clips
              stay in your browser session memory so you can replay them or download them
              manually if you choose. Raw audio files are not uploaded to cloud storage.
            </li>
            {isGuestMode ? (
              <li>
                <strong className="text-creamInk">Guest Mode simulation only:</strong> In Guest
                Review Mode, audio is never sent to VocoFlo AI or Firestore. Optional speech
                observations and Coco responses are simulated locally in your browser.
              </li>
            ) : (
              <li>
                <strong className="text-creamInk">Transient speech processing:</strong> When you
                submit a recording, audio bytes are sent over encrypted HTTPS through VocoFlo&rsquo;s
                authenticated gateway to the{" "}
                <strong className="text-creamInk">VocoFlo speech detection model</strong> for
                verbatim transcription, optional tentative moment markers, and Coco&rsquo;s reply.
              </li>
            )}
            <li>
              <strong className="text-creamInk">Your control:</strong> You can disable
              acoustic analysis per clip, use &ldquo;Type Instead&rdquo; at any step, or revoke
              microphone authorization anytime.
            </li>
          </ul>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
          {alreadyAuthorized && onRevoke ? (
            <button
              type="button"
              onClick={() => {
                onRevoke();
                onClose();
              }}
              className="mr-auto rounded-full border border-softCoral/50 px-4 py-2 text-xs font-medium text-softCoral hover:bg-coralContainer/50"
            >
              Revoke Mic Consent
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-full border border-emeraldStrongBorder px-4 py-2 text-xs font-medium text-creamInk hover:bg-emeraldRaised"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAuthorizeAndProceed}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-sagePill px-5 py-2 text-xs font-semibold text-sageInk transition hover:opacity-90"
          >
            <Mic className="h-4 w-4" />
            {alreadyAuthorized ? "Continue Speaking" : "Agree & Start Speaking"}
          </button>
        </div>
      </div>
    </div>
  );
}
