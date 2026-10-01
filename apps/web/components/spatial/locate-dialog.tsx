"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, ArrowRight, CheckCircle2, Box } from "lucide-react";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Button } from "@/components/ui/button";
import type { ComponentLocateTargetDto } from "@/lib/api/spatial-api";

export interface LocateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentSku?: string;
  componentName?: string;
  targets: ComponentLocateTargetDto[];
  unit?: string;
}

export function LocateDialog({
  open,
  onOpenChange,
  componentSku,
  componentName,
  targets,
  unit = "units",
}: LocateDialogProps) {
  const router = useRouter();

  const handleSelect = (target: ComponentLocateTargetDto) => {
    onOpenChange(false);
    router.push(target.locateUrl);
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      icon={<MapPin className="size-5 text-primary" />}
      title={
        componentSku
          ? `Locate ${componentSku} in Storage`
          : "Choose Physical Stock Location"
      }
      description={
        componentName
          ? `Stock is held across ${targets.length} physical locations. Select a location to open the spatial view.`
          : `Select one of ${targets.length} physical locations to locate.`
      }
    >
      <div className="space-y-3 py-1">
        <div className="divide-y divide-border/60 rounded-lg border border-border bg-card">
          {targets.map((target) => (
            <div
              key={target.locationId}
              className="flex items-center justify-between p-3.5 gap-4 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {target.locationCode}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {target.locationName}
                  </span>
                  {target.hasSpatialView ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                      <CheckCircle2 className="size-2.5" />
                      2D View
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.2 rounded border border-border">
                      <Box className="size-2.5" />
                      Standard List
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                  <MapPin className="size-3 shrink-0 text-muted-foreground/70" />
                  <span className="truncate">{target.path}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-foreground block">
                    {target.onHand.toLocaleString()} {unit}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {target.available.toLocaleString()} available
                  </span>
                </div>

                <Button
                  size="sm"
                  onClick={() => handleSelect(target)}
                  className="gap-1.5 text-xs font-medium"
                >
                  <span>Locate</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DialogShell>
  );
}
