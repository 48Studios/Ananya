"use client";

import * as React from "react";
import { BarcodeLookupResult } from "@/lib/api/barcodes-api";
import {
  INITIAL_SCAN_GATE_STATE,
  SCAN_ERROR_VISIBLE_MS,
  ScanFailure,
  ScanGateState,
  ScannerState,
  describeScanFailure,
  isScannerBusy,
  normalizeScannedValue,
  noteDetection,
  noteEmptyFrame,
  resolveScannedCode,
  shouldHandleDetection,
  suppressAfterHandledScan,
} from "@/lib/scanner";

/**
 * The scanner's result handler: detections in, a resolved record out.
 *
 * This is where the "one lookup per code" rule lives. The camera reports the
 * same code on every frame it is visible in — twenty times in half a second is
 * normal — so detections pass through two gates before anything is fetched:
 *
 * 1. a synchronous in-flight lock, set before the first `await`, which makes a
 *    burst a single request even if every frame arrives in the same tick;
 * 2. a suppression window on the value that was just handled, which survives
 *    the lock being released, so closing the details modal while the label is
 *    still under the lens does not immediately reopen it.
 *
 * The only side effect of a successful scan is the details modal opening over
 * the scanner: the surface never navigates, so `showing-details` is a state of
 * the scanner rather than a route.
 */
export interface ScanResultHandler {
  scannerState: ScannerState;
  scanFailure: ScanFailure | null;
  detectedResult: BarcodeLookupResult | null;
  detailsOpen: boolean;
  /** Called for every detection the camera reports. */
  handleDetection: (value: string) => void;
  /** Programmatic resolution, for the `?code=` a printed label carries. */
  resolveCode: (value: string) => void;
  /** The details modal closed: back to scanning. */
  closeDetails: () => void;
  /** The operator dismissed a failed scan. */
  dismissFailure: () => void;
  /** The camera is live, so detections are worth handling. */
  startScanning: () => void;
  /** A frame in which nothing was decoded — how the gate re-arms. */
  handleEmptyFrame: () => void;
}

/**
 * Confirmation tone on a successful scan, mirroring the ERP's own scan dialog.
 *
 * The operator is looking at the label, not the screen, so a short beep is the
 * fastest confirmation that the code was read. iOS only allows an audio context
 * to start from a user gesture, and a blocked one is not a failure here.
 */
function playScanConfirmation(): void {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.2, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.08);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  } catch {
    // Audio is a nicety: a restricted audio context must not break a scan.
  }
}

export function useScanResultHandler(): ScanResultHandler {
  const [scannerState, setScannerState] = React.useState<ScannerState>("idle");
  const [scanFailure, setScanFailure] = React.useState<ScanFailure | null>(null);
  const [detectedResult, setDetectedResult] =
    React.useState<BarcodeLookupResult | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  /** Mirrors `scannerState` for the synchronous gates, which cannot await a render. */
  const stateRef = React.useRef<ScannerState>("idle");
  const gateRef = React.useRef<ScanGateState>(INITIAL_SCAN_GATE_STATE);
  const inFlightRef = React.useRef(false);
  const failureTimerRef = React.useRef<number | null>(null);

  const transition = React.useCallback((next: ScannerState) => {
    stateRef.current = next;
    setScannerState(next);
  }, []);

  const clearFailureTimer = React.useCallback(() => {
    if (failureTimerRef.current !== null) {
      window.clearTimeout(failureTimerRef.current);
      failureTimerRef.current = null;
    }
  }, []);

  // A pending "clear the message" timer must not outlive the surface.
  React.useEffect(() => clearFailureTimer, [clearFailureTimer]);

  const resolveCode = React.useCallback(
    (rawValue: string) => {
      const code = normalizeScannedValue(rawValue);
      if (!code || inFlightRef.current) return;

      inFlightRef.current = true;
      clearFailureTimer();
      setScanFailure(null);
      setDetectedResult(null);
      transition("processing");

      void (async () => {
        try {
          const result = await resolveScannedCode(code);
          gateRef.current = suppressAfterHandledScan(code);
          playScanConfirmation();
          setDetectedResult(result);
          setDetailsOpen(true);
          transition("showing-details");
        } catch (error) {
          gateRef.current = suppressAfterHandledScan(code);
          setScanFailure(describeScanFailure(error, code));
          transition("error");

          // The camera keeps scanning under the message, so a failed scan costs
          // the operator a glance rather than an interaction.
          failureTimerRef.current = window.setTimeout(() => {
            failureTimerRef.current = null;
            if (stateRef.current !== "error") return;
            setScanFailure(null);
            transition("scanning");
          }, SCAN_ERROR_VISIBLE_MS);
        } finally {
          inFlightRef.current = false;
        }
      })();
    },
    [clearFailureTimer, transition],
  );

  const handleDetection = React.useCallback(
    (value: string) => {
      // Whatever this detection is, the frame is not clear — which is what
      // stops a single missed frame from re-arming the gate.
      gateRef.current = noteDetection(gateRef.current);

      const state = stateRef.current;
      // A lookup is running or its record is on screen: the frames that keep
      // arriving are the same label, so they must not start anything.
      if (isScannerBusy(state) || state === "idle") return;
      if (!shouldHandleDetection(gateRef.current, value)) return;
      resolveCode(value);
    },
    [resolveCode],
  );

  const handleEmptyFrame = React.useCallback(() => {
    gateRef.current = noteEmptyFrame(gateRef.current);
  }, []);

  const startScanning = React.useCallback(() => {
    if (stateRef.current === "idle") transition("scanning");
  }, [transition]);

  const closeDetails = React.useCallback(() => {
    setDetailsOpen(false);
    setDetectedResult(null);
    setScanFailure(null);
    transition("scanning");
  }, [transition]);

  const dismissFailure = React.useCallback(() => {
    clearFailureTimer();
    setScanFailure(null);
    if (stateRef.current === "error") transition("scanning");
  }, [clearFailureTimer, transition]);

  return {
    scannerState,
    scanFailure,
    detectedResult,
    detailsOpen,
    handleDetection,
    resolveCode,
    closeDetails,
    dismissFailure,
    startScanning,
    handleEmptyFrame,
  };
}
