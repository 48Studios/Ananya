"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Scan,
  Loader2,
  AlertCircle,
  Camera,
  RefreshCw,
  Search,
  Plus,
  Upload,
  Play,
  QrCode,
} from "lucide-react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { ScannedEntityModal } from "./scanned-entity-modal";
import { barcodesApi, BarcodeLookupResult } from "@/lib/api/barcodes-api";

// Declare native BarcodeDetector interface for browser compatibility
interface NativeBarcodeDetector {
  detect(
    image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<Array<{ rawValue: string; format: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats: string[] }): NativeBarcodeDetector;
      getSupportedFormats?(): Promise<string[]>;
    };
  }
}

/**
 * The bars of the reticle's barcode skeleton: `[x, width]` pairs in the strip's
 * own 96-unit viewBox, drawn in `currentColor` so the guide takes the studio's
 * primary colour. Drawn rather than taken from the icon set because the
 * `Barcode` glyph is five evenly spaced bars, which reads as ruled lines at this
 * size — a barcode silhouette needs uneven bar widths.
 */
const RETICLE_BARCODE_BARS: ReadonlyArray<readonly [number, number]> = [
  [0, 3],
  [6, 2],
  [11, 5],
  [19, 2],
  [24, 4],
  [31, 3],
  [37, 2],
  [42, 5],
  [50, 2],
  [55, 4],
  [62, 3],
  [68, 2],
  [73, 5],
  [81, 3],
  [87, 2],
  [92, 4],
];

export interface ScanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess?: (result: BarcodeLookupResult) => void;
  title?: string;
  description?: string;
}

// Play POS scanner confirmation beep
function playScanBeep() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // Ignore audio permission/context restriction
  }
}

export function ScanDialog({
  isOpen,
  onClose,
  onScanSuccess,
  title = "Quick Barcode & QR Scan",
  description = "Scan any QR code, Code 128, Code 39, or EAN barcode.",
}: ScanDialogProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const isScanningRef = React.useRef<boolean>(false);
  const animationFrameRef = React.useRef<number | null>(null);
  const lastScannedCodeRef = React.useRef<string>("");
  const lastScanTimeRef = React.useRef<number>(0);

  const [inputCode, setInputCode] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BarcodeLookupResult | null>(null);
  const [isCameraActive, setIsCameraActive] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [facingMode, setFacingMode] = React.useState<"environment" | "user">(
    "environment",
  );
  const [scannedFormat, setScannedFormat] = React.useState<string | null>(null);
  const [autoNavigate, setAutoNavigate] = React.useState(false);

  // Dedicated details modal state
  const [isDetailsModalOpen, setIsDetailsModalOpen] = React.useState(false);

  // Stop camera tracks and release video stream cleanly
  const stopCameraStream = React.useCallback(() => {
    isScanningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Close dialog and clean up resources
  const handleClose = React.useCallback(() => {
    stopCameraStream();
    setIsDetailsModalOpen(false);
    onClose();
  }, [stopCameraStream, onClose]);

  const handleDetailsClose = React.useCallback(() => {
    setIsDetailsModalOpen(false);
    handleClose();
  }, [handleClose]);

  // Execute barcode / QR code lookup via backend search infrastructure
  const executeLookup = React.useCallback(
    async (codeToLookup: string, formatDetected?: string) => {
      const target = codeToLookup.trim();
      if (!target) return;

      // Cooldown prevention: Ignore duplicate scans within 1.2 seconds
      const now = Date.now();
      if (
        lastScannedCodeRef.current === target &&
        now - lastScanTimeRef.current < 1200
      ) {
        return;
      }
      lastScannedCodeRef.current = target;
      lastScanTimeRef.current = now;

      // Update text input to reflect scanned value
      setInputCode(target);
      setLoading(true);
      setError(null);

      if (formatDetected) {
        setScannedFormat(formatDetected.toUpperCase());
      }

      try {
        const res = await barcodesApi.lookup(target);
        setResult(res);
        playScanBeep();

        // Stop camera stream and open dedicated details modal
        stopCameraStream();
        setIsDetailsModalOpen(true);

        if (onScanSuccess) {
          onScanSuccess(res);
        }
        if (autoNavigate && res.targetUrl) {
          handleClose();
          router.push(res.targetUrl);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(
            `No ERP entity matched scanned barcode or QR payload "${target}".`,
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [onScanSuccess, autoNavigate, handleClose, router, stopCameraStream],
  );

  // High-performance continuous frame processing loop
  const startScanningLoop = React.useCallback(
    (video: HTMLVideoElement) => {
      isScanningRef.current = true;

      let nativeDetector: NativeBarcodeDetector | null = null;
      if (typeof window !== "undefined" && window.BarcodeDetector) {
        try {
          nativeDetector = new window.BarcodeDetector({
            formats: [
              "qr_code",
              "code_128",
              "code_39",
              "ean_13",
              "ean_8",
              "upc_a",
            ],
          });
        } catch {
          nativeDetector = null;
        }
      }

      if (!canvasRef.current) {
        canvasRef.current = document.createElement("canvas");
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const scanFrame = async () => {
        if (!isScanningRef.current) return;

        if (
          video &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          let foundCode: string | null = null;
          let foundFmt = "QR_CODE";

          // Pass 1: Try native BarcodeDetector if available
          if (nativeDetector) {
            try {
              const barcodes = await nativeDetector.detect(video);
              if (barcodes.length > 0 && barcodes[0]?.rawValue) {
                foundCode = barcodes[0].rawValue;
                foundFmt = barcodes[0].format || "BARCODE";
              }
            } catch {
              // Fallback to jsQR
            }
          }

          // Pass 2: Center crop scan with jsQR (optimal focus where target reticle is located)
          if (!foundCode && ctx) {
            try {
              const minDim = Math.min(vw, vh);
              const cropSize = Math.floor(minDim * 0.75);
              const cropX = Math.floor((vw - cropSize) / 2);
              const cropY = Math.floor((vh - cropSize) / 2);

              canvas.width = cropSize;
              canvas.height = cropSize;

              ctx.drawImage(
                video,
                cropX,
                cropY,
                cropSize,
                cropSize,
                0,
                0,
                cropSize,
                cropSize,
              );

              const imgData = ctx.getImageData(0, 0, cropSize, cropSize);
              const qr = jsQR(imgData.data, cropSize, cropSize, {
                inversionAttempts: "attemptBoth",
              });

              if (qr && qr.data && qr.data.trim()) {
                foundCode = qr.data.trim();
                foundFmt = "QR_CODE";
              }
            } catch {
              // Ignore frame capture error
            }
          }

          // Pass 3: Full-frame scan if center crop didn't find a code
          if (!foundCode && ctx) {
            try {
              canvas.width = vw;
              canvas.height = vh;
              ctx.drawImage(video, 0, 0, vw, vh);
              const fullData = ctx.getImageData(0, 0, vw, vh);
              const fullQr = jsQR(fullData.data, vw, vh, {
                inversionAttempts: "attemptBoth",
              });
              if (fullQr && fullQr.data && fullQr.data.trim()) {
                foundCode = fullQr.data.trim();
                foundFmt = "QR_CODE";
              }
            } catch {
              // Ignore full frame capture error
            }
          }

          if (foundCode) {
            executeLookup(foundCode, foundFmt);
            return; // Loop pauses until user resumes
          }
        }

        if (isScanningRef.current) {
          // Schedule next frame check (~20 FPS)
          setTimeout(() => {
            if (isScanningRef.current) {
              animationFrameRef.current = requestAnimationFrame(scanFrame);
            }
          }, 50);
        }
      };

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    },
    [executeLookup],
  );

  // Start device camera stream
  const startCameraStream = React.useCallback(async () => {
    setCameraError(null);
    setError(null);

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        "Camera access is not supported in this browser. Please use manual entry or file upload.",
      );
      return;
    }

    try {
      stopCameraStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      mediaStreamRef.current = stream;
      setIsCameraActive(true);

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video
            .play()
            .then(() => {
              startScanningLoop(video);
            })
            .catch(() => {
              // Ignore autoplay policy rejection
            });
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Permission denied") ||
        msg.includes("NotAllowedError")
      ) {
        setCameraError(
          "Camera permission was denied. Please allow camera access in your browser address bar.",
        );
      } else {
        setCameraError(
          "Unable to start device camera. Please check your camera connection or use manual entry.",
        );
      }
      setIsCameraActive(false);
    }
  }, [facingMode, stopCameraStream, startScanningLoop]);

  // Handle scan another request from details modal
  const handleScanAnother = React.useCallback(() => {
    setIsDetailsModalOpen(false);
    setResult(null);
    setError(null);
    setInputCode("");
    lastScannedCodeRef.current = "";
    if (typeof document !== "undefined") {
      document.body.style.pointerEvents = "";
    }
    setTimeout(() => {
      startCameraStream();
    }, 150);
  }, [startCameraStream]);

  // Auto-start camera when modal opens
  React.useEffect(() => {
    if (isOpen && !isDetailsModalOpen) {
      setInputCode("");
      setError(null);
      setResult(null);
      setCameraError(null);
      setScannedFormat(null);
      lastScannedCodeRef.current = "";

      // Start camera stream immediately
      startCameraStream();
    } else if (!isOpen) {
      stopCameraStream();
      setIsDetailsModalOpen(false);
    }
  }, [isOpen, isDetailsModalOpen, startCameraStream, stopCameraStream]);

  // Decode QR code from uploaded image file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const qr = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });
          if (qr && qr.data && qr.data.trim()) {
            executeLookup(qr.data.trim(), "IMAGE_UPLOAD");
          } else {
            setError("No readable QR code found in the selected image.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    if (isCameraActive) {
      setTimeout(() => startCameraStream(), 100);
    }
  };

  return (
    <>
      <DialogShell
        open={isOpen && !isDetailsModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleClose();
          }
        }}
        title={title}
        description={description}
        size="sm"
      >
        <DialogShellBody className="space-y-4">
          {/* Controls Bar */}
          {/*
            The label is `w-fit shrink-0` so it is always exactly as wide as its
            checkbox and text, and `flex-wrap` on the row is what keeps that
            honest: without it the label absorbs every pixel of shortfall, and
            measured at a 352px row the text broke onto two lines — three at
            292px — while the checkbox was squeezed to 13px. Wrapping lets the
            label drop to its own line at full width instead of being crushed.
          */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-primary shrink-0">
              <Scan className="size-4" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Live Scanner
              </span>
              {scannedFormat && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                  {scannedFormat}
                </span>
              )}
            </div>
            <label className="flex w-fit shrink-0 items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoNavigate}
                onChange={(e) => setAutoNavigate(e.target.checked)}
                className="size-3.5 shrink-0 rounded border-border text-primary focus:ring-primary"
              />
              <span>Auto-open page on match</span>
            </label>
          </div>

          {/* Camera Viewport (Always rendered in DOM, toggled via style) */}
          {/*
            Square, because that is the region the scanner actually decodes: the
            reading loop crops to a centred square of `min(width, height) * 0.75`
            before jsQR looks at it, and the video element already crops the 16:9
            feed to its centre with `object-cover`. A 16:9 preview therefore
            showed the operator a wide view the decoder never reads, and put the
            part that matters in the middle of it.

            The side is `min(100%, 28rem, 55vh)` rather than a plain `max-w`:
            this is a square, so it has to be capped by the SCREEN as well as by
            the dialog, or on a short window it would be tall enough to push the
            manual input and the buttons below the fold. `min()` keeps it square
            at every size instead of letting a max-height flatten it.
          */}
          <div className="relative mx-auto w-[min(100%,28rem,55vh)] aspect-square flex items-center justify-center rounded-xl overflow-hidden border border-border bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                isCameraActive ? "block" : "hidden"
              }`}
            />

            {!isCameraActive && (
              <div className="p-6 text-center space-y-3">
                <Camera className="size-10 mx-auto text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  Camera is currently idle. Click below to activate live scanner.
                </p>
                <Button size="xs" onClick={startCameraStream}>
                  <Play className="size-3 mr-1" />
                  Activate Camera
                </Button>
              </div>
            )}

            {isCameraActive && (
              <>
                {/* Target Alignment Reticle */}
                {/*
                  The guide names what the scanner reads instead of only framing
                  empty space: a QR skeleton beside a barcode skeleton, so it is
                  obvious that either form fits here. Both are drawn empty — a
                  slot to aim at, not a code — and stay ghosted so the live feed
                  reads through them. QR and barcode share one row so the sweep
                  line crosses both, and the caption sits on the frame's bottom
                  edge, clear of them at any size.

                  The frame is 75% of the preview and square, which is not a
                  stylistic choice: it is the exact centre crop the reading loop
                  decodes first, so aim inside it and the code is where the
                  scanner is already looking.
                */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-3/4 aspect-square relative">
                    {/* Open corners, squared off like a QR's finder patterns. */}
                    <span className="absolute top-0 left-0 size-7 rounded-tl-lg border-t-2 border-l-2 border-primary/90" />
                    <span className="absolute top-0 right-0 size-7 rounded-tr-lg border-t-2 border-r-2 border-primary/90" />
                    <span className="absolute bottom-0 left-0 size-7 rounded-bl-lg border-b-2 border-l-2 border-primary/90" />
                    <span className="absolute bottom-0 right-0 size-7 rounded-br-lg border-b-2 border-r-2 border-primary/90" />

                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex items-center gap-4">
                        <QrCode
                          className="size-14 shrink-0 text-primary/45"
                          strokeWidth={1.5}
                        />
                        <svg
                          viewBox="0 0 96 28"
                          fill="currentColor"
                          className="h-7 w-24 shrink-0 text-primary/45"
                        >
                          {RETICLE_BARCODE_BARS.map(([x, width]) => (
                            <rect key={x} x={x} width={width} height={28} />
                          ))}
                        </svg>
                      </div>
                    </div>

                    <span className="absolute inset-x-0 bottom-[-8px] mx-auto w-fit whitespace-nowrap text-[10px] font-mono text-primary bg-background/80 px-2.5 py-0.5 rounded shadow-xs font-semibold">
                      Hold QR / Barcode Here
                    </span>

                    <div className="w-full h-0.5 bg-primary animate-pulse absolute top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Floating Camera Actions */}
                <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
                  <Button
                    variant="secondary"
                    size="icon-xs"
                    onClick={toggleCameraFacing}
                    title="Switch camera"
                    className="bg-black/60 text-white hover:bg-black/80 border-0"
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={stopCameraStream}
                    className="bg-black/60 text-white hover:bg-black/80 border-0 text-[11px]"
                  >
                    Stop
                  </Button>
                </div>
              </>
            )}
          </div>

          {cameraError && (
            <div className="p-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Manual Input & Image Upload Toolbar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>Enter or Paste Code / Payload</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] text-primary hover:underline flex items-center gap-2 text-left"
              >
                <Upload className="size-3" />
                Scan from image file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative flex items-center flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      executeLookup(inputCode, "MANUAL_ENTRY");
                    }
                  }}
                  placeholder="e.g. ANANYA:V1:LOCATION:id or SKU / code..."
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-input/40 border border-border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                />
                <Scan className="w-4 h-4 absolute left-3 text-muted-foreground" />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={loading || !inputCode.trim()}
                onClick={() => executeLookup(inputCode, "MANUAL_ENTRY")}
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  "Lookup"
                )}
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span className="font-semibold">{error}</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-destructive/20">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    handleClose();
                    router.push(
                      `/components?search=${encodeURIComponent(inputCode)}`,
                    );
                  }}
                >
                  <Search className="w-3 h-3 mr-1" />
                  Search Global Catalog
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    handleClose();
                    router.push(
                      `/components/new?sku=${encodeURIComponent(inputCode)}`,
                    );
                  }}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Create Component
                </Button>
              </div>
            </div>
          )}

        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton>Cancel</DialogShellCancelButton>
        </DialogShellFooter>
      </DialogShell>

      {/* Dedicated Interactive Scanned Entity Details Modal */}
      <ScannedEntityModal
        isOpen={isDetailsModalOpen}
        onClose={handleDetailsClose}
        result={result}
        onScanAnother={handleScanAnother}
      />
    </>
  );
}
