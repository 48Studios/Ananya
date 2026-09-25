"use client";

import { RefreshCw, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Camera controls that float over the viewfinder.
 *
 * Deliberately the only chrome on the camera: the scanner's one job is
 * "point, scan, read", so anything that is not the flash or the camera flip is
 * left out. The flash button only exists when the running track reports a torch
 * — a phone without one, or a desktop webcam, never sees a control that could
 * not work.
 *
 * Both buttons sit inside the top-right safe area, so neither the Dynamic
 * Island nor the notch can cover them.
 */
export interface ScannerControlsProps {
  torchAvailable: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
  onFlipCamera: () => void;
}

const CONTROL_BUTTON_CLASS =
  "rounded-full border-0 bg-black/60 text-white hover:bg-black/80 active:bg-black";

export function ScannerControls({
  torchAvailable,
  torchOn,
  onToggleTorch,
  onFlipCamera,
}: ScannerControlsProps) {
  return (
    <div className="absolute right-[calc(env(safe-area-inset-right)+1rem)] top-[calc(env(safe-area-inset-top)+1rem)] z-20 flex items-center gap-2">
      {torchAvailable ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          onClick={onToggleTorch}
          aria-pressed={torchOn}
          aria-label={torchOn ? "Turn off the flash" : "Turn on the flash"}
          className={
            torchOn
              ? "rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
              : CONTROL_BUTTON_CLASS
          }
        >
          {torchOn ? (
            <Zap className="size-4" />
          ) : (
            <ZapOff className="size-4" />
          )}
        </Button>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="icon-lg"
        onClick={onFlipCamera}
        aria-label="Switch between the rear and front camera"
        className={CONTROL_BUTTON_CLASS}
      >
        <RefreshCw className="size-4" />
      </Button>
    </div>
  );
}
