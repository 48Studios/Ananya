"use client";

import * as React from "react";
import jsQR from "jsqr";
import { ScannerControls } from "./scanner-controls";
import {
  CAMERA_UNSUPPORTED_FAILURE,
  CameraFailure,
  SourceCrop,
  describeCameraFailure,
  displayRectToVideoCrop,
  normalizeScannedValue,
} from "@/lib/scanner";

/**
 * Camera and decoding for the scanner surface.
 *
 * Three decisions shape this component:
 *
 * 1. **The stream is opened once and kept.** Pausing detection while the details
 *    modal is open is a boolean, not a teardown — closing the modal starts
 *    decoding on the very next frame instead of re-opening the camera, which on
 *    iOS costs about a second and flashes the viewfinder black. The tracks are
 *    stopped when the surface unmounts, when the camera fails, and when the
 *    camera is flipped.
 * 2. **The reticle is the decode region.** `ScannerOverlay` draws it, this
 *    component measures it and maps it onto the frame (`object-cover` means the
 *    preview is a crop of the source, not the whole source), so the scanner
 *    reads where the operator aims instead of hoping the code is in the middle
 *    of the frame. A throttled full-frame pass follows, so a code held outside
 *    the brackets still resolves.
 * 3. **`jsqr` is the decoder**, the same one the ERP's own scan dialog uses;
 *    the browser's native `BarcodeDetector` is used first when it exists
 *    (Android Chrome), and silently dropped when it does not (iOS Safari).
 */

/** Decode attempts per second — enough to feel instant without burning a phone's battery. */
const FRAME_INTERVAL_MS = 50;
/** How often the full-frame fallback pass runs, and how wide it is scaled to. */
const FULL_FRAME_INTERVAL_MS = 400;
const FULL_FRAME_MAX_WIDTH = 960;
/** The reticle is re-measured at most this often; layout does not move per frame. */
const GEOMETRY_TTL_MS = 250;

/** The subset of the native `BarcodeDetector` this component uses. */
interface NativeBarcodeDetector {
  detect(
    source: HTMLVideoElement,
  ): Promise<Array<{ rawValue?: string; format?: string }>>;
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats: string[] }): NativeBarcodeDetector;
}

export type ScannerCameraStatus = "starting" | "active" | "stopped";

export interface ScannerCameraProps {
  /** Suspends decoding while a lookup is in flight or its result owns the screen. */
  paused: boolean;
  /** The element whose box is the decode target (drawn by `ScannerOverlay`). */
  reticleRef: React.RefObject<HTMLDivElement | null>;
  onDetected: (value: string, format: string) => void;
  /**
   * A completed pass in which nothing was decoded.
   *
   * Not noise: the scan gate needs to know the code has left the frame before
   * it will read that code again, and this is the only place that can tell.
   */
  onEmptyFrame: () => void;
  onStatusChange: (status: ScannerCameraStatus) => void;
  onFailure: (failure: CameraFailure) => void;
}

/**
 * The browser's own detector, where it exists.
 *
 * Android Chrome has one and it is both faster and format-richer than a JS
 * decoder; iOS Safari does not, so `null` is the expected answer on the device
 * this surface was built for. A browser that has the constructor but rejects
 * these formats is treated as having none.
 */
function createNativeBarcodeDetector(): NativeBarcodeDetector | null {
  if (typeof window === "undefined") return null;

  const Detector = (
    window as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor }
  ).BarcodeDetector;
  if (!Detector) return null;

  try {
    return new Detector({
      formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a"],
    });
  } catch {
    return null;
  }
}

/**
 * Reads one region of the frame and asks jsQR for a QR code in it.
 *
 * The region is drawn 1:1 into the scratch canvas, which is what makes the
 * reticle pass cheap: only the pixels the operator aimed at are binarised.
 * Inverted codes are attempted too, because a dark label printed with a light
 * QR is a normal Ananya label rather than an error.
 */
function decodeRegion(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  region: SourceCrop,
  scale = 1,
): string | null {
  try {
    const width = Math.max(1, Math.round(region.width * scale));
    const height = Math.max(1, Math.round(region.height * scale));

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(
      video,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      width,
      height,
    );

    const image = ctx.getImageData(0, 0, width, height);
    const qr = jsQR(image.data, width, height, {
      inversionAttempts: "attemptBoth",
    });

    return qr?.data ? normalizeScannedValue(qr.data) || null : null;
  } catch {
    // A frame that cannot be read is not an error: the next one is 50ms away.
    return null;
  }
}

export function ScannerCamera({
  paused,
  reticleRef,
  onDetected,
  onEmptyFrame,
  onStatusChange,
  onFailure,
}: ScannerCameraProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const detectorRef = React.useRef<NativeBarcodeDetector | null>(null);
  const runningRef = React.useRef(false);
  const decodingRef = React.useRef(false);
  const pausedRef = React.useRef(paused);
  const frameTimerRef = React.useRef<number | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const fullFrameAtRef = React.useRef(0);
  const geometryRef = React.useRef<{ measuredAt: number; crop: SourceCrop | null }>(
    { measuredAt: 0, crop: null },
  );
  /**
   * Guards the async camera work: `getUserMedia` and `play()` outlive the
   * effect that started them, so a stream that arrives after a flip, a retry or
   * an unmount must be stopped rather than attached.
   */
  const generationRef = React.useRef(0);
  const callbacksRef = React.useRef({ onDetected, onEmptyFrame, onStatusChange, onFailure });

  const [facingMode, setFacingMode] = React.useState<"environment" | "user">(
    "environment",
  );
  const [torchAvailable, setTorchAvailable] = React.useState(false);
  const [torchOn, setTorchOn] = React.useState(false);
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  React.useEffect(() => {
    callbacksRef.current = { onDetected, onEmptyFrame, onStatusChange, onFailure };
  }, [onDetected, onEmptyFrame, onStatusChange, onFailure]);

  const stopDecoding = React.useCallback(() => {
    runningRef.current = false;
    if (frameTimerRef.current !== null) {
      window.clearTimeout(frameTimerRef.current);
      frameTimerRef.current = null;
    }
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  /** Releases the camera completely: tracks stopped, decoder loop cancelled. */
  const stopCamera = React.useCallback(() => {
    generationRef.current += 1;
    stopDecoding();
    decodingRef.current = false;
    detectorRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    geometryRef.current = { measuredAt: 0, crop: null };
    setActive(false);
    setTorchAvailable(false);
    setTorchOn(false);
    callbacksRef.current.onStatusChange("stopped");
  }, [stopDecoding]);

  const emitDetection = React.useCallback((rawValue: string, format: string) => {
    const value = normalizeScannedValue(rawValue);
    if (!value) return;
    callbacksRef.current.onDetected(value, format);
  }, []);

  /**
   * The reticle in video pixels, cached for `GEOMETRY_TTL_MS`.
   *
   * Re-measuring per frame would force a layout on every decode attempt for a
   * box that only moves when the window does.
   */
  const readCrop = React.useCallback(
    (video: HTMLVideoElement): SourceCrop | null => {
      const now = Date.now();
      const cached = geometryRef.current;
      if (now - cached.measuredAt < GEOMETRY_TTL_MS) return cached.crop;

      const reticle = reticleRef.current;
      const crop = reticle
        ? displayRectToVideoCrop(
            reticle.getBoundingClientRect(),
            video.getBoundingClientRect(),
            { width: video.videoWidth, height: video.videoHeight },
          )
        : null;

      geometryRef.current = { measuredAt: now, crop };
      return crop;
    },
    [reticleRef],
  );

  const decodeFrame = React.useCallback(
    async (video: HTMLVideoElement) => {
      // One decode at a time: the native detector is async, and overlapping
      // frames would queue work the operator cannot see.
      if (decodingRef.current) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) return;

      decodingRef.current = true;
      try {
        const detector = detectorRef.current;
        if (detector) {
          try {
            const codes = await detector.detect(video);
            const match = codes.find(
              (code) => code.rawValue && code.rawValue.trim(),
            );
            if (match?.rawValue) {
              emitDetection(match.rawValue, match.format || "BARCODE");
              return;
            }
          } catch {
            // Unsupported format or a detector that gave up: fall back to jsQR
            // for the rest of the session instead of failing every frame.
            detectorRef.current = null;
          }
        }

        const canvas =
          canvasRef.current ?? (canvasRef.current = document.createElement("canvas"));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        const crop = readCrop(video);
        if (crop) {
          const aimed = decodeRegion(ctx, canvas, video, crop);
          if (aimed) {
            emitDetection(aimed, "QR_CODE");
            return;
          }
        }

        // Fallback: the whole frame, at a cadence and size a phone can afford,
        // so a code held outside the brackets still resolves.
        const now = Date.now();
        if (now - fullFrameAtRef.current >= FULL_FRAME_INTERVAL_MS) {
          fullFrameAtRef.current = now;
          const scale = Math.min(1, FULL_FRAME_MAX_WIDTH / sourceWidth);
          const wide = decodeRegion(
            ctx,
            canvas,
            video,
            { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
            scale,
          );
          if (wide) {
            emitDetection(wide, "QR_CODE");
            return;
          }
        }

        // A whole pass with nothing in it: the frame is clear.
        callbacksRef.current.onEmptyFrame();
      } finally {
        decodingRef.current = false;
      }
    },
    [emitDetection, readCrop],
  );

  const startDecoding = React.useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const tick = () => {
      frameTimerRef.current = null;
      const video = videoRef.current;
      if (!runningRef.current || !video) return;

      if (!pausedRef.current) void decodeFrame(video);

      frameTimerRef.current = window.setTimeout(() => {
        frameTimerRef.current = null;
        if (runningRef.current) frameRef.current = requestAnimationFrame(tick);
      }, FRAME_INTERVAL_MS);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [decodeFrame]);

  const startCamera = React.useCallback(
    async (mode: "environment" | "user") => {
      const callbacks = callbacksRef.current;

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        callbacks.onFailure(CAMERA_UNSUPPORTED_FAILURE);
        callbacks.onStatusChange("stopped");
        return;
      }

      stopCamera();
      const generation = generationRef.current;
      callbacks.onStatusChange("starting");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (generation !== generationRef.current) {
          // A flip, a retry or an unmount happened while the permission prompt
          // was open: this stream is already obsolete, so release it.
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        // The torch is a per-track capability and a mobile-only one. Asking the
        // running track keeps a flash button off devices that have none, which
        // matters because a browser rejects an unsupported constraint outright
        // instead of ignoring it.
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as
          | { torch?: boolean }
          | undefined;
        setTorchAvailable(Boolean(capabilities?.torch));
        setTorchOn(false);

        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((streamTrack) => streamTrack.stop());
          streamRef.current = null;
          callbacks.onStatusChange("stopped");
          return;
        }

        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // Autoplay policies: the stream is attached and will start with the
          // first gesture, so this is not treated as a camera failure.
        }

        detectorRef.current = createNativeBarcodeDetector();
        setActive(true);
        callbacks.onStatusChange("active");
        startDecoding();
      } catch (error) {
        streamRef.current?.getTracks().forEach((streamTrack) => streamTrack.stop());
        streamRef.current = null;
        setActive(false);
        callbacks.onFailure(describeCameraFailure(error));
        callbacks.onStatusChange("stopped");
      }
    },
    [startDecoding, stopCamera],
  );

  // Open the camera on mount, and re-open it whenever the camera is flipped.
  React.useEffect(() => {
    void startCamera(facingMode);
    return () => stopCamera();
  }, [facingMode, startCamera, stopCamera]);

  // iOS suspends the camera while the app is in the background. Coming back to
  // a paused video element looks exactly like a broken scanner, so playback is
  // resumed if the stream is still ours.
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!streamRef.current) return;
      void videoRef.current?.play().catch(() => undefined);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const toggleTorch = React.useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    const next = !torchOn;
    try {
      // `torch` is not part of the constraint set the DOM library models, hence
      // the cast; the track's own settings are read back because a browser that
      // silently drops the constraint must not be reported as a success.
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(track.getSettings().torch ?? next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  const flipCamera = React.useCallback(() => {
    setFacingMode((previous) => (previous === "environment" ? "user" : "environment"));
  }, []);

  return (
    <div className="absolute inset-0">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        disablePictureInPicture
        className="absolute inset-0 size-full object-cover"
      />

      {active ? (
        <ScannerControls
          torchAvailable={torchAvailable}
          torchOn={torchOn}
          onToggleTorch={toggleTorch}
          onFlipCamera={flipCamera}
        />
      ) : null}
    </div>
  );
}
