"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CameraOff, Loader2, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CameraFailure,
  ScannerState,
  isScannerBusy,
  isStandaloneDisplay,
} from "@/lib/scanner";
import { ScannerCamera, ScannerCameraStatus } from "./scanner-camera";
import { ScannerDetailsModal } from "./scanner-details-modal";
import { ScannerOverlay } from "./scanner-overlay";
import { useScanResultHandler } from "./scan-result-handler";

/**
 * The standalone scanner application.
 *
 * This is the whole of `/scan`: a camera, a scan target, one line of
 * instruction, and the ERP's details modal over the top. It is what the iPhone
 * Home Screen opens — there is no navigation rail, no sidebar, no breadcrumb
 * and no route change, because a scan is a lookup, not a page visit. Closing
 * the modal returns the operator to a live camera, ready for the next label.
 *
 * It fills the viewport and never scrolls (the page behind it is a camera
 * feed), and every piece of chrome is inset by `env(safe-area-inset-*)` so the
 * Dynamic Island, the notch and the home indicator cannot cover a control.
 */

const SCANNER_CAPTIONS: Record<ScannerState, string> = {
  idle: "Starting camera…",
  scanning: "Point your camera at a QR code",
  processing: "Reading code…",
  "showing-details": "Showing details",
  // A failed scan leaves the camera running, so the instruction stands.
  error: "Point your camera at a QR code",
};

export function ScannerApp() {
  const searchParams = useSearchParams();
  // A printed label encodes `/scan?code=…`, which is what the phone's own
  // camera app opens. That code is resolved immediately; the scanner is live
  // behind the modal, so the operator can carry straight on scanning.
  const deepLinkCode =
    searchParams.get("code") ?? searchParams.get("target") ?? "";

  const reticleRef = React.useRef<HTMLDivElement | null>(null);

  const {
    scannerState,
    scanFailure,
    detectedResult,
    detailsOpen,
    handleDetection,
    handleEmptyFrame,
    resolveCode,
    closeDetails,
    dismissFailure,
    startScanning,
  } = useScanResultHandler();

  const [cameraFailure, setCameraFailure] = React.useState<CameraFailure | null>(
    null,
  );
  const [cameraStatus, setCameraStatus] =
    React.useState<ScannerCameraStatus>("starting");
  /** Remounting the camera is the retry: a fresh stream, a fresh attempt. */
  const [cameraAttempt, setCameraAttempt] = React.useState(0);
  const [standalone, setStandalone] = React.useState(false);

  React.useEffect(() => {
    setStandalone(isStandaloneDisplay());
  }, []);

  React.useEffect(() => {
    if (deepLinkCode) resolveCode(deepLinkCode);
  }, [deepLinkCode, resolveCode]);

  const handleCameraStatus = React.useCallback(
    (status: ScannerCameraStatus) => {
      setCameraStatus(status);
      if (status === "active") startScanning();
    },
    [startScanning],
  );

  const retryCamera = React.useCallback(() => {
    setCameraFailure(null);
    setCameraAttempt((attempt) => attempt + 1);
  }, []);

  const caption = SCANNER_CAPTIONS[scannerState];

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden overscroll-none bg-black text-white touch-manipulation"
      data-scanner-state={scannerState}
    >
      {cameraFailure ? (
        <CameraFailurePanel failure={cameraFailure} onRetry={retryCamera} />
      ) : (
        <>
          <ScannerCamera
            key={cameraAttempt}
            paused={isScannerBusy(scannerState)}
            reticleRef={reticleRef}
            onDetected={handleDetection}
            onEmptyFrame={handleEmptyFrame}
            onStatusChange={handleCameraStatus}
            onFailure={setCameraFailure}
          />
          <ScannerOverlay state={scannerState} reticleRef={reticleRef} />
          {cameraStatus === "stopped" ? (
            <StartCameraPanel onStart={retryCamera} />
          ) : null}
        </>
      )}

      {/* Identity — the installed app must say what it is. */}
      <div className="pointer-events-none absolute left-[calc(env(safe-area-inset-left)+1rem)] top-[calc(env(safe-area-inset-top)+1rem)] z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5">
        <ScanLine className="size-3.5 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/85">
          Ananya Scanner
        </span>
      </div>

      <footer className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        {scanFailure ? (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-amber-400/30 bg-black/85 px-4 py-3 text-left"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {scanFailure.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/70">
                {scanFailure.description}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissFailure}
              aria-label="Dismiss message"
              className="-mr-1 -mt-1 rounded-md p-1 text-white/60 transition-colors hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2">
          {scannerState === "processing" ? (
            <Loader2 className="size-3.5 animate-spin text-primary" />
          ) : null}
          <p className="text-sm font-medium text-white">{caption}</p>
        </div>

        {/* No browser chrome to escape from in an installed app, so the way
            back to the ERP only exists where there is somewhere to go back to. */}
        {standalone ? null : (
          <Link
            href="/dashboard"
            className="pointer-events-auto text-[11px] text-white/55 underline underline-offset-4"
          >
            Exit to dashboard
          </Link>
        )}
      </footer>

      <ScannerDetailsModal
        open={detailsOpen}
        result={detectedResult}
        onClose={closeDetails}
      />
    </div>
  );
}

/**
 * Shown when the camera is not running and did not report a failure.
 *
 * A scanner that silently shows nothing is indistinguishable from a broken
 * one, so the surface always offers an explicit way to (re)start the camera —
 * which also gives a browser that wants a gesture before opening the camera one
 * to work with.
 */
function StartCameraPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
      <div className="w-full max-w-xs space-y-3 rounded-2xl border border-white/10 bg-neutral-900 p-5 text-center">
        <p className="text-xs leading-relaxed text-white/70">
          The camera is not running.
        </p>
        <Button type="button" size="sm" className="w-full" onClick={onStart}>
          Start camera
        </Button>
      </div>
    </div>
  );
}

/**
 * Shown instead of the viewfinder when the camera cannot be opened.
 *
 * A black screen with no explanation is the worst outcome for a scanner, so the
 * failure states are explicit about what happened and always offer a retry.
 */
function CameraFailurePanel({
  failure,
  onRetry,
}: {
  failure: CameraFailure;
  onRetry: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-neutral-900 p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-white/5">
          <CameraOff className="size-5 text-white/60" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-sm font-semibold text-white">{failure.title}</h2>
          <p className="text-xs leading-relaxed text-white/60">
            {failure.description}
          </p>
        </div>
        <Button type="button" size="sm" className="w-full" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}
