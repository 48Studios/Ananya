"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Scan,
  Loader2,
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  RefreshCw,
  Search,
  Plus,
  Printer,
  Upload,
  Layers,
  MapPin,
} from "lucide-react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { PrintLabelDialog } from "./print-label-dialog";
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

interface ContainingComponentItem {
  componentId: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
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
  description = "Scan any Code 128, Code 39, EAN-13, UPC, or QR Code using camera, file upload, or hardware scanner.",
}: ScanDialogProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
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
  const [autoNavigate, setAutoNavigate] = React.useState(false);

  // Individual label printing modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);

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
        if (autoNavigate && res.targetUrl) {
          handleClose();
          router.push(res.targetUrl);
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(`No ERP entity matched scanned barcode or QR payload "${target}".`);
        }
      } finally {
        setLoading(false);
      }
    },
    [onScanSuccess, autoNavigate, handleClose, router],
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
        "Camera access is not supported in this browser environment. Please use manual entry or file upload.",
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

  // Continuous frame processing loop using native BarcodeDetector or jsQR canvas fallback
  React.useEffect(() => {
    if (!isCameraActive || !videoRef.current) return;

    let isActive = true;
    let nativeDetector: NativeBarcodeDetector | null = null;

    if (typeof window !== "undefined" && window.BarcodeDetector) {
      try {
        nativeDetector = new window.BarcodeDetector({
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
        nativeDetector = null;
      }
    }

    const processFrame = async () => {
      if (!isActive || !videoRef.current || videoRef.current.readyState < 2) {
        if (isActive) {
          animationFrameRef.current = requestAnimationFrame(processFrame);
        }
        return;
      }

      const video = videoRef.current;
      let detectedCode: string | null = null;
      let detectedFormat = "BARCODE";

      // 1. Try native BarcodeDetector if supported
      if (nativeDetector) {
        try {
          const barcodes = await nativeDetector.detect(video);
          if (barcodes.length > 0 && barcodes[0]?.rawValue) {
            detectedCode = barcodes[0].rawValue;
            detectedFormat = barcodes[0].format || "BARCODE";
          }
        } catch {
          // Fall back to canvas jsQR
        }
      }

      // 2. Fallback to universal pure-JS canvas QR code decoder
      if (!detectedCode && video.videoWidth && video.videoHeight) {
        try {
          if (!canvasRef.current) {
            canvasRef.current = document.createElement("canvas");
          }
          const canvas = canvasRef.current;
          // Scale down to max 640px width for fast decoding
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.floor(video.videoWidth * scale);
          canvas.height = Math.floor(video.videoHeight * scale);

          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qrResult = jsQR(imageData.data, imageData.width, imageData.height);
            if (qrResult && qrResult.data) {
              detectedCode = qrResult.data;
              detectedFormat = "QR_CODE";
            }
          }
        } catch {
          // Ignore transient canvas frame errors
        }
      }

      if (detectedCode) {
        executeLookup(detectedCode, detectedFormat);
      }

      if (isActive) {
        // Sample frames at ~10 FPS for optimal battery and CPU performance
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
          const qr = jsQR(imageData.data, imageData.width, imageData.height);
          if (qr && qr.data) {
            setInputCode(qr.data);
            executeLookup(qr.data, "IMAGE_UPLOAD");
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

  const containingComponents = (result?.details?.containingComponents as
    | ContainingComponentItem[]
    | undefined) || [];

  return (
    <>
      <DialogShell
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleClose();
          }
        }}
        title={title}
        description={description}
        size="md"
      >
        <DialogShellBody className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-primary">
              <Scan className="size-5" />
              <span className="text-sm font-medium text-foreground">
                Live Scanner & Hardware HID Lookup
              </span>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoNavigate}
                onChange={(e) => setAutoNavigate(e.target.checked)}
                className="size-3.5 rounded border-border text-primary focus:ring-primary"
              />
              <span>Auto-open page on scan</span>
            </label>
          </div>

          {/* Search / Scan Input Form */}
          <form
            id="scan-dialog-form"
            onSubmit={handleSubmit}
            className="space-y-2"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-medium text-foreground">
                <span>Scan or Enter Barcode / QR Payload</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Hardware Scanner Listening
                </span>
              </div>
              <div className="relative flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  placeholder="Scan QR code, barcode, or type SKU / location code..."
                  className="w-full pl-9 pr-24 py-2.5 text-xs font-mono bg-input/40 border border-border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                />
                <Scan className="w-4 h-4 absolute left-3 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute right-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 bg-muted/60 px-2 py-1 rounded"
                  title="Upload QR Code image"
                >
                  <Upload className="size-3" />
                  Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>
          </form>

          {/* Camera Scanner Viewport */}
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 bg-muted/20 border border-border rounded-lg text-xs">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                <span className="text-foreground font-medium">
                  Camera QR & Barcode Scanner
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

            {isCameraActive && (
              <div className="relative rounded-xl overflow-hidden border border-border bg-black aspect-video flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-36 border-2 border-primary/80 rounded-lg relative flex items-center justify-center shadow-lg">
                    <div className="w-full h-0.5 bg-primary animate-pulse absolute top-1/2 -translate-y-1/2" />
                    <span className="text-[10px] font-mono text-primary bg-background/80 px-2 py-0.5 rounded shadow-xs">
                      Align Barcode or QR
                    </span>
                  </div>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="p-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{cameraError}</span>
              </div>
            )}
          </div>

          {/* Error View */}
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

          {/* Scanned Interactive Result View */}
          {result && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-bold font-mono uppercase bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded">
                    {result.entityType} MATCHED
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setIsPrintModalOpen(true)}
                  >
                    <Printer className="size-3 mr-1" />
                    Print Label
                  </Button>
                  <span className="font-mono text-xs font-bold text-foreground bg-background/60 px-2 py-0.5 rounded border border-border">
                    {result.code}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-base font-bold text-foreground">
                  {result.name}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.subtitle}
                </p>
                {Boolean(result.details?.locationPath) && (
                  <p className="text-xs font-mono text-primary mt-1 flex items-center gap-1">
                    <MapPin className="size-3" />
                    {String(result.details?.locationPath)}
                  </p>
                )}
              </div>

              {/* Location Containing Components Card */}
              {result.entityType === "LOCATION" && (
                <div className="p-3 bg-background/80 border border-border rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Layers className="size-3.5 text-primary" />
                      Containing Components ({containingComponents.length})
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Location Inventory
                    </span>
                  </div>

                  {containingComponents.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto divide-y divide-border border border-border rounded-md text-xs">
                      {containingComponents.map((comp) => (
                        <div
                          key={comp.componentId}
                          className="p-2 flex items-center justify-between hover:bg-muted/40 transition-colors"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <span className="font-mono font-bold text-foreground block truncate">
                              {comp.sku}
                            </span>
                            <span className="text-[11px] text-muted-foreground block truncate">
                              {comp.name}
                            </span>
                          </div>
                          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                            {comp.quantity} {comp.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic py-1">
                      No components currently stored in this location.
                    </p>
                  )}
                </div>
              )}

              {/* Component Stock Details Card */}
              {result.entityType === "COMPONENT" && (
                <div className="p-3 bg-background/80 border border-border rounded-lg grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block">
                      Total On-Hand Stock:
                    </span>
                    <span className="font-mono font-bold text-foreground text-sm">
                      {String(result.details?.totalStock ?? 0)}{" "}
                      {String(result.details?.unit ?? "")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">
                      Assigned Storage:
                    </span>
                    <span className="font-mono text-foreground truncate block">
                      {String(result.details?.defaultLocationPath || "Unassigned")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton>Cancel</DialogShellCancelButton>
          {result ? (
            <Button size="sm" onClick={handleNavigate}>
              Open Interactive Page
              <ArrowRight className="ml-1.5 size-3.5" />
            </Button>
          ) : (
            <Button
              type="submit"
              form="scan-dialog-form"
              size="sm"
              disabled={loading || !inputCode.trim()}
            >
              {loading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Scan className="mr-1.5 size-3.5" />
              )}
              Lookup
            </Button>
          )}
        </DialogShellFooter>
      </DialogShell>

      {/* Embedded Print Label Dialog if triggered directly from scan dialog */}
      {result && (
        <PrintLabelDialog
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          entityType={result.entityType}
          entityId={result.entityId}
        />
      )}
    </>
  );
}
