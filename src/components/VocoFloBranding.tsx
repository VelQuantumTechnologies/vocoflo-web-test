"use client";

import React from "react";

export function VocoFloWordmark({ size = 32 }: { size?: number }) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-label="VocoFlo Held Breath emblem"
      >
        <path
          d="M14.3 14.3A25 25 0 1 1 14.3 49.7"
          stroke="#6FD1AD"
          strokeWidth="4.4"
          strokeLinecap="round"
        />
        <path
          d="M20.7 20.7A16 16 0 1 1 20.7 43.3"
          stroke="#E1ECD6"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <circle cx="32" cy="32" r="4.2" fill="#F9DF9C" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="font-display text-lg font-semibold tracking-tight text-creamInk">
          VocoFlo
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-mutedSage">
          Web Test Harness
        </span>
      </div>
    </div>
  );
}

export function CocoOrb({
  mode = "idle",
  size = 44,
}: {
  mode?: "idle" | "thinking" | "speaking";
  size?: number;
}) {
  const ringClass =
    mode === "speaking"
      ? "ring-2 ring-mintAccent/70 scale-105"
      : mode === "thinking"
        ? "ring-2 ring-warmGold/60 animate-pulse"
        : "ring-1 ring-emeraldBorder";

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-mintAccent/40 via-emeraldField to-deskGreen transition-all duration-300 ${ringClass}`}
      aria-hidden="true"
    >
      <div className="h-[62%] w-[62%] rounded-full bg-gradient-to-tr from-mintDeep via-mintAccent/75 to-mintHighlight/80 shadow-inner" />
    </div>
  );
}

export function ParkCafeSceneCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-emeraldBorder bg-emeraldSurface">
      <div className="border-b border-emeraldBorder/70 bg-emeraldRaised px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-mintAccent">
          Scene to Describe • Sunny Neighbourhood Park & Corner Cafe
        </p>
      </div>
      <div className="p-4">
        <svg
          viewBox="0 0 640 280"
          className="h-auto w-full rounded-xl border border-emeraldBorder/60 bg-[#0D1E19]"
          role="img"
          aria-label="Illustration of a sunny neighbourhood park and corner cafe with two steaming coffee cups on a sidewalk table, a chalkboard menu, a person reading with a small brown dog on a wooden bench, a cyclist near a flowering tree, a pond with a yellow duck, and a clock tower showing 9 o'clock."
        >
          {/* Sky & Sun */}
          <rect width="640" height="190" fill="#132922" />
          <circle cx="560" cy="48" r="24" fill="#F9DF9C" opacity="0.9" />
          {/* Clock Tower */}
          <rect x="470" y="34" width="38" height="126" fill="#1F3E34" stroke="#547463" />
          <polygon points="466,34 489,12 512,34" fill="#284237" />
          <circle cx="489" cy="62" r="13" fill="#F1F0E6" />
          <line x1="489" y1="62" x2="489" y2="53" stroke="#09291E" strokeWidth="2" />
          <line x1="489" y1="62" x2="496" y2="62" stroke="#09291E" strokeWidth="2" />
          {/* Ground & Path */}
          <rect y="185" width="640" height="95" fill="#10392C" />
          <path d="M 190 280 Q 320 220 640 230 L 640 280 Z" fill="#1D4336" />
          {/* Corner Cafe */}
          <rect x="24" y="70" width="160" height="115" fill="#162A24" stroke="#547463" />
          <path d="M 18 72 L 190 72 L 198 96 L 10 96 Z" fill="#6FD1AD" opacity="0.85" />
          <path d="M 42 72 L 62 72 L 62 96 L 42 96 Z M 94 72 L 114 72 L 114 96 L 94 96 Z M 146 72 L 166 72 L 166 96 L 146 96 Z" fill="#10392C" />
          {/* Sidewalk Table & Cups */}
          <rect x="84" y="198" width="56" height="6" rx="2" fill="#E1ECD6" />
          <line x1="112" y1="204" x2="112" y2="235" stroke="#A5C2B3" strokeWidth="4" />
          <rect x="92" y="187" width="11" height="11" rx="2" fill="#F1F0E6" />
          <rect x="108" y="187" width="11" height="11" rx="2" fill="#F1F0E6" />
          <circle cx="130" cy="193" r="6" fill="#F9DF9C" />
          {/* Chalkboard Menu */}
          <rect x="194" y="142" width="32" height="44" rx="3" fill="#09291E" stroke="#E1ECD6" strokeWidth="2" />
          <line x1="201" y1="154" x2="219" y2="154" stroke="#A5C2B3" strokeWidth="2" />
          <line x1="201" y1="163" x2="217" y2="163" stroke="#A5C2B3" strokeWidth="2" />
          {/* Bench, Reader & Brown Dog */}
          <rect x="275" y="168" width="96" height="10" rx="2" fill="#8C6D46" />
          <rect x="282" y="178" width="82" height="16" fill="#735837" />
          <circle cx="312" cy="144" r="10" fill="#F9DF9C" />
          <rect x="301" y="154" width="22" height="22" rx="4" fill="#6FD1AD" />
          <rect x="320" y="156" width="16" height="11" fill="#F1F0E6" />
          {/* Brown Dog */}
          <ellipse cx="394" cy="192" rx="13" ry="8" fill="#B67C4B" />
          <circle cx="406" cy="184" r="6" fill="#B67C4B" />
          <line x1="371" y1="176" x2="401" y2="186" stroke="#E1ECD6" strokeWidth="1.5" />
          {/* Flowering Tree & Cyclist */}
          <rect x="432" y="110" width="12" height="75" fill="#6F5338" />
          <circle cx="438" cy="100" r="32" fill="#1D8A68" />
          <circle cx="424" cy="92" r="5" fill="#F29B92" />
          <circle cx="450" cy="105" r="5" fill="#F29B92" />
          <circle cx="440" cy="82" r="4" fill="#F9DF9C" />
          {/* Cyclist */}
          <circle cx="515" cy="214" r="14" stroke="#E1ECD6" strokeWidth="2.5" fill="none" />
          <circle cx="555" cy="214" r="14" stroke="#E1ECD6" strokeWidth="2.5" fill="none" />
          <polyline points="515,214 534,196 555,214 532,214 515,214" stroke="#6FD1AD" strokeWidth="2.5" fill="none" />
          <circle cx="534" cy="176" r="7" fill="#F9DF9C" />
          {/* Pond & Duck */}
          <ellipse cx="566" cy="252" rx="58" ry="18" fill="#235F53" stroke="#6FD1AD" strokeWidth="1.2" />
          <ellipse cx="566" cy="249" rx="7" ry="4.5" fill="#F9DF9C" />
          <circle cx="573" cy="245" r="3.5" fill="#F9DF9C" />
        </svg>
        <p className="mt-2.5 text-xs text-mutedSage">
          Describe whatever catches your eye in your own words and order.
        </p>
      </div>
    </div>
  );
}
