"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  spatialApi,
  type ComponentLocateTargetDto,
} from "@/lib/api/spatial-api";
import { LocateDialog } from "./locate-dialog";

export interface LocateButtonProps {
  componentId: string;
  locationId?: string;
  componentSku?: string;
  componentName?: string;
  unit?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "xs" | "icon" | "icon-xs";
  className?: string;
  children?: React.ReactNode;
  onLocateError?: (error: string) => void;
}

export function LocateButton({
  componentId,
  locationId,
  componentSku,
  componentName,
  unit,
  variant = "outline",
  size = "sm",
  className,
  children,
  onLocateError,
}: LocateButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [targets, setTargets] = React.useState<ComponentLocateTargetDto[]>([]);

  const handleLocate = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (loading) return;

    setLoading(true);
    try {
      if (locationId) {
        // Direct resolution for specific location
        const target = await spatialApi.resolveLocationLocate(
          locationId,
          componentId,
        );
        router.push(target.locateUrl);
      } else {
        // Full component stock resolution
        const resolution = await spatialApi.resolveComponentLocate(componentId);
        if (resolution.targets.length === 0) {
          onLocateError?.(
            "This component currently has no physical stock on hand to locate.",
          );
        } else if (resolution.targets.length === 1 && resolution.targets[0]) {
          router.push(resolution.targets[0].locateUrl);
        } else {
          setTargets(resolution.targets);
          setDialogOpen(true);
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to resolve spatial location";
      onLocateError?.(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleLocate}
        disabled={loading}
        className={className}
        title={
          locationId
            ? "Locate in spatial storage"
            : "Locate component physical stock"
        }
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <MapPin className="size-3.5" />
        )}
        {children ?? <span>Locate</span>}
      </Button>

      {dialogOpen && targets.length > 1 && (
        <LocateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          componentSku={componentSku}
          componentName={componentName}
          targets={targets}
          unit={unit}
        />
      )}
    </>
  );
}
