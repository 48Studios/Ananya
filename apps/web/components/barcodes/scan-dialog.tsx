"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Scan,
  X,
  Loader2,
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  RefreshCw,
  Search,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

export interface ScanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess?: (result: BarcodeLookupResult) => void;
  title?: string;
  description?: string;
}

export function ScanDialog({
  isOpen,
  onClose,
  onScanSuccess,
  title = "Quick Barcode & QR Scan",
  description = "Scan any Code 128, Code 39, EAN-13, UPC, or QR Code using camera or hardware scanner.",
}: ScanDialogProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
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

  // Stop camera tracks and release video stream cleanly
  const stopCameraStream = React.useCallback(() => {
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
    onClose();
  }, [stopCameraStream, onClose]);

  // Execute barcode / QR code lookup via backend search infrastructure
  const executeLookup = React.useCallback(
    async (codeToLookup: string, formatDetected?: string) => {
      const target = codeToLookup.trim();
      if (!target) return;

      // Cooldown prevention: Ignore duplicate scans within 1.5 seconds
      const now = Date.now();
      if (
        lastScannedCodeRef.current === target &&
        now - lastScanTimeRef.current < 1500
      ) {
        return;
      }
      lastScannedCodeRef.current = target;
      lastScanTimeRef.current = now;

      setLoading(true);
      setError(null);
      setResult(null);
      if (formatDetected) {
        setScannedFormat(formatDetected.toUpperCase());
      }

      try {
        const res = await barcodesApi.lookup(target);
        setResult(res);
        if (onScanSuccess) {
          onScanSuccess(res);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(`No ERP entity matched scanned barcode "${target}".`);
        }
      } finally {
        setLoading(false);
      }
    },
    [onScanSuccess],
  );

  // Start real device camera stream
  const startCameraStream = React.useCallback(async () => {
    setCameraError(null);
    setError(null);

    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        "Camera access is not supported in this browser environment. Please use manual entry.",
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Permission denied") ||
        msg.includes("NotAllowedError")
      ) {
        setCameraError(
          "Camera permission denied. Please enable camera access in browser settings.",
        );
      } else {
        setCameraError(
          "Unable to access device camera. Please check camera connection or use manual entry.",
        );
      }
      setIsCameraActive(false);
    }
  }, [facingMode, stopCameraStream]);

  // Bind active media stream to video element when mounted
  React.useEffect(() => {
    if (isCameraActive && videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.play().catch(() => {
        // Ignore autoplay policy interruption if any
      });
    }
  }, [isCameraActive]);

  // Continuous frame processing loop using native BarcodeDetector
  React.useEffect(() => {
    if (!isCameraActive || !videoRef.current) return;

    let isActive = true;
    let detector: NativeBarcodeDetector | null = null;

    if (typeof window !== "undefined" && window.BarcodeDetector) {
      try {
        detector = new window.BarcodeDetector({
          formats: [
            "code_128",
            "code_39",
            "ean_13",
            "ean_8",
            "upc_a",
            "upc_e",
            "qr_code",
            "data_matrix",
          ],
        });
      } catch {
        detector = null;
      }
    }

    const processFrame = async () => {
      if (!isActive || !videoRef.current || videoRef.current.readyState < 2) {
        if (isActive) {
          animationFrameRef.current = requestAnimationFrame(processFrame);
        }
        return;
      }

      if (detector) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0 && barcodes[0]?.rawValue) {
            const code = barcodes[0].rawValue;
            const fmt = barcodes[0].format || "BARCODE";
            executeLookup(code, fmt);
          }
        } catch {
          // Ignore transient frame detection errors
        }
      }

      if (isActive) {
        // Sample frames at ~10 FPS for optimal performance & CPU efficiency
        setTimeout(() => {
          if (isActive) {
            animationFrameRef.current = requestAnimationFrame(processFrame);
          }
        }, 100);
      }
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      isActive = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCameraActive, executeLookup]);

  // Reset dialog state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setInputCode("");
      setError(null);
      setResult(null);
      setCameraError(null);
      setScannedFormat(null);
      lastScannedCodeRef.current = "";
    } else {
      stopCameraStream();
    }
  }, [isOpen, stopCameraStream]);

  // Clean up stream on unmount
  React.useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, [stopCameraStream]);

  // Buffer hardware HID barcode scanner keypresses
  React.useEffect(() => {
    if (!isOpen) return;

    let buffer = "";
    let timeoutId: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        document.activeElement !== inputRef.current &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if (e.key === "Enter") {
        if (buffer.trim()) {
          const scanned = buffer.trim();
          buffer = "";
          setInputCode(scanned);
          executeLookup(scanned, "HARDWARE_SCANNER");
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          buffer = "";
        }, 300);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timeoutId);
    };
  }, [isOpen, executeLookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeLookup(inputCode, "MANUAL_ENTRY");
  };

  const handleNavigate = () => {
    if (result) {
      handleClose();
      router.push(result.targetUrl);
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
    if (isCameraActive) {
      setTimeout(() => startCameraStream(), 100);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {title}
              </h3>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md"
            aria-label="Close barcode scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Manual Barcode & Hardware Scanner Input */}
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>Scan or Enter Barcode / QR Payload</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                HID Hardware Scanner Ready
              </span>
            </label>
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Scan hardware barcode or type SKU, PO#, WO#, Loc Code..."
                className="w-full pl-9 pr-24 py-2.5 text-xs font-mono bg-input/40 border border-border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
              />
              <Scan className="w-4 h-4 absolute left-3 text-muted-foreground" />
              <Button
                type="submit"
                size="xs"
                disabled={loading || !inputCode.trim()}
                className="absolute right-1.5"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  "Lookup"
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* Live Camera Video Feed Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-muted/20 border border-border rounded-lg text-xs">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-primary" />
              <span className="text-foreground font-medium">
                Device Camera Scanner
              </span>
              {scannedFormat && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                  {scannedFormat}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isCameraActive && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={toggleCameraFacing}
                  title="Switch camera"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button
                variant={isCameraActive ? "outline" : "default"}
                size="xs"
                onClick={isCameraActive ? stopCameraStream : startCameraStream}
              >
                {isCameraActive ? "Stop Camera" : "Activate Camera"}
              </Button>
            </div>
          </div>

          {/* Camera Stream Viewport */}
          {isCameraActive && (
            <div className="relative rounded-xl overflow-hidden border border-border bg-black aspect-video flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Reticle Overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-28 border-2 border-primary/80 rounded-lg relative flex items-center justify-center shadow-lg">
                  <div className="w-full h-0.5 bg-primary animate-pulse absolute top-1/2 -translate-y-1/2" />
                  <span className="text-[10px] font-mono text-primary bg-background/80 px-2 py-0.5 rounded shadow-xs">
                    Target Code
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Camera Error Messaging */}
          {cameraError && (
            <div className="p-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}
        </div>

        {/* Scan Error Result Alert */}
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
                onClick={() =>
                  router.push(
                    `/components?search=${encodeURIComponent(inputCode)}`,
                  )
                }
              >
                <Search className="w-3 h-3 mr-1" />
                Search Global Catalog
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  router.push(
                    `/components/new?sku=${encodeURIComponent(inputCode)}`,
                  )
                }
              >
                <Plus className="w-3 h-3 mr-1" />
                Create Component with SKU
              </Button>
            </div>
          </div>
        )}

        {/* Lookup Result Card */}
        {result && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold font-mono uppercase bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded">
                  {result.entityType} MATCHED
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-foreground">
                {result.code}
              </span>
            </div>

            <div>
              <h4 className="text-sm font-bold text-foreground">
                {result.name}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {result.subtitle}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-500/20">
              <Button size="xs" onClick={handleNavigate}>
                Open Entity Page
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
