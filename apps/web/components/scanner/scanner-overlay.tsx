"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { ScannerState } from "@/lib/scanner";

/**
 * The scan target drawn over the camera feed.
 *
 * The square is the decode region, not decoration: `ScannerCamera` measures
 * this exact element and hands those pixels to the decoder, so aiming inside
 * the brackets is what the scanner actually reads. That is also why the size is
 * expressed in viewport units with a cap — the reticle stays square and
 * proportionate on a phone and does not become a giant box on a desktop screen.
 *
 * The sweep line is the only moving part, and it only runs while scanning is
 * live: it is the operator's signal that the camera is looking, not just
 * showing.
 */
export interface ScannerOverlayProps {
  state: ScannerState;
  reticleRef: React.RefObject<HTMLDivElement | null>;
}

const CORNER_CLASS = "absolute size-9 border-white/85";

export function ScannerOverlay({ state, reticleRef }: ScannerOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      data-scanner-state={state}
    >
      <div
        ref={reticleRef}
        className="relative aspect-square w-[min(72vw,72dvh)] max-w-[22rem]"
      >
        <span
          className={`${CORNER_CLASS} left-0 top-0 rounded-tl-xl border-l-2 border-t-2`}
        />
        <span
          className={`${CORNER_CLASS} right-0 top-0 rounded-tr-xl border-r-2 border-t-2`}
        />
        <span
          className={`${CORNER_CLASS} bottom-0 left-0 rounded-bl-xl border-b-2 border-l-2`}
        />
        <span
          className={`${CORNER_CLASS} bottom-0 right-0 rounded-br-xl border-b-2 border-r-2`}
        />

        {state === "scanning" ? (
          <span className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded-full bg-primary/85" />
        ) : null}

        {state === "processing" ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-white/85" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
