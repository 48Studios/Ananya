"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Scan,
  Loader2,
  AlertCircle,
  Camera,
  Search,
  Plus,
  Upload,
  Play,
  RefreshCw,
} from "lucide-react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { barcodesApi, BarcodeLookupResult } from "@/lib/api/barcodes-api";
import { ScannedEntityModal } from "@/components/barcodes/scanned-entity-modal";

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
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // Audio context may be restricted by user agent policy
  }
}

function ScanView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("code") || searchParams.get("target");

  const [inputCode, setInputCode] = React.useState(codeParam || "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<BarcodeLookupResult | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = React.useState(false);

  const [isCameraActive, setIsCameraActive] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [facingMode, setFacingMode] = React.useState<"environment" | "user">(
    "environment",
  );
  const [scannedFormat, setScannedFormat] = React.useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const isScanningRef = React.useRef<boolean>(false);
  const animationFrameRef = React.useRef<number | null>(null);
  const lastScannedCodeRef = React.useRef<string>("");
  const lastScanTimeRef = React.useRef<number>(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  const executeLookup = React.useCallback(
    async (codeToLookup: string, formatDetected?: string) => {
      const target = codeToLookup.trim();
      if (!target) return;

      const now = Date.now();
      if (
        lastScannedCodeRef.current === target &&
        now - lastScanTimeRef.current < 1200
      ) {
        return;
      }
      lastScannedCodeRef.current = target;
      lastScanTimeRef.current = now;

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
        stopCameraStream();
        setIsDetailsModalOpen(true);
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
    [stopCameraStream],
  );

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

          if (!foundCode && ctx) {
            try {
              const cropW = Math.min(vw * 0.75, 480);
              const cropH = Math.min(vh * 0.65, 360);
              const cropX = (vw - cropW) / 2;
              const cropY = (vh - cropH) / 2;

              canvas.width = cropW;
              canvas.height = cropH;
              ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

              const cropImageData = ctx.getImageData(0, 0, cropW, cropH);
              const qrCrop = jsQR(
                cropImageData.data,
                cropImageData.width,
                cropImageData.height,
                { inversionAttempts: "dontInvert" },
              );

              if (qrCrop && qrCrop.data && qrCrop.data.trim()) {
                foundCode = qrCrop.data.trim();
                foundFmt = "QR_CODE";
              } else {
                const maxFullW = 640;
                const scale = Math.min(1, maxFullW / vw);
                const fullW = Math.round(vw * scale);
                const fullH = Math.round(vh * scale);

                canvas.width = fullW;
                canvas.height = fullH;
                ctx.drawImage(video, 0, 0, fullW, fullH);

                const fullImageData = ctx.getImageData(0, 0, fullW, fullH);
                const qrFull = jsQR(
                  fullImageData.data,
                  fullImageData.width,
                  fullImageData.height,
                  { inversionAttempts: "attemptBoth" },
                );

                if (qrFull && qrFull.data && qrFull.data.trim()) {
                  foundCode = qrFull.data.trim();
                  foundFmt = "QR_CODE";
                }
              }
            } catch {
              // Frame reading skipped
            }
          }

          if (foundCode) {
            executeLookup(foundCode, foundFmt);
            return;
          }
        }

        if (isScanningRef.current) {
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
            .catch(() => {});
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

  // If URL has code param from external camera scan, immediately look it up
  React.useEffect(() => {
    if (codeParam) {
      executeLookup(codeParam, "EXTERNAL_CAMERA");
    } else {
      // Auto-start camera if opened directly on mobile
      startCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [codeParam, executeLookup, startCameraStream, stopCameraStream]);

  const handleScanAnother = React.useCallback(() => {
    setIsDetailsModalOpen(false);
    setResult(null);
    setError(null);
    setInputCode("");
    lastScannedCodeRef.current = "";
    setTimeout(() => {
      startCameraStream();
    }, 150);
  }, [startCameraStream]);

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
    <div className="container max-w-2xl py-8 px-4 space-y-6">
      {/* Header */}
      <div className="space-y-1 text-center sm:text-left">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center justify-center sm:justify-start gap-2">
          <Scan className="size-6 text-primary" />
          Barcode & QR Scanner
        </h1>
        <p className="text-xs text-muted-foreground">
          Point your device camera at any location or component tag, enter code manually, or upload an image.
        </p>
      </div>

      {/* Camera Viewport */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wider text-foreground">
              Camera Viewfinder
            </span>
            {scannedFormat && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                {scannedFormat}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={toggleCameraFacing}
              disabled={!isCameraActive}
            >
              <RefreshCw className="size-3 mr-1" />
              Flip Camera
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3 mr-1" />
              Upload Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-border bg-black aspect-video flex items-center justify-center shadow-sm">
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
                {cameraError || "Camera scanner is idle."}
              </p>
              <Button size="sm" onClick={startCameraStream}>
                <Play className="size-3.5 mr-1.5" />
                Activate Camera
              </Button>
            </div>
          )}

          {isCameraActive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-44 border-2 border-primary/90 rounded-xl relative flex items-center justify-center shadow-lg">
                <div className="w-full h-0.5 bg-primary animate-pulse absolute top-1/2 -translate-y-1/2" />
                <span className="text-[10px] font-mono text-primary bg-background/80 px-2.5 py-0.5 rounded font-semibold">
                  Align Barcode or QR
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Input Form */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground block">
          Manual Code / SKU Entry
        </label>
        <div className="flex gap-2">
          <div className="relative flex items-center flex-1">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  executeLookup(inputCode, "MANUAL_ENTRY");
                }
              }}
              placeholder="e.g. LOC-A01, SKU-1002, or QR payload..."
              className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-input/40 border border-border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
            />
            <Scan className="w-4 h-4 absolute left-3 text-muted-foreground" />
          </div>
          <Button
            type="button"
            disabled={loading || !inputCode.trim()}
            onClick={() => executeLookup(inputCode, "MANUAL_ENTRY")}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <Search className="size-3.5 mr-1.5" />
            )}
            Lookup
          </Button>
        </div>
      </div>

      {/* Error Message with Quick Actions */}
      {error && (
        <div className="p-4 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">{error}</span>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-destructive/20">
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                router.push(`/components?search=${encodeURIComponent(inputCode)}`)
              }
            >
              <Search className="w-3 h-3 mr-1" />
              Search Global Catalog
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                router.push(`/components/new?sku=${encodeURIComponent(inputCode)}`)
              }
            >
              <Plus className="w-3 h-3 mr-1" />
              Create Component
            </Button>
          </div>
        </div>
      )}

      {/* Scanned Entity Modal */}
      <ScannedEntityModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          startCameraStream();
        }}
        result={result}
        onScanAnother={handleScanAnother}
      />
    </div>
  );
}

export default function ScanPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ScanView />
    </React.Suspense>
  );
}
