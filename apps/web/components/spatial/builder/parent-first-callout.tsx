"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContainerIdentity } from "./parametric-preview-2d";

export interface ParentFirstCalloutProps {
  /** Shared parent-first condition: true once the container location is assigned. */
  isParentAssigned: boolean;
  containerIdentity?: ContainerIdentity | null;
  onSelectContainer: () => void;
  /** Test id prefix so the 2D and 3D instances can be asserted separately. */
  testId: string;
  className?: string;
}

/**
 * Persistent parent-first instruction shared by the 2D and 3D previews.
 *
 * Both views render this from the same `isParentAssigned` condition, so the
 * workflow copy and the enabled/disabled state cannot drift apart. The state is
 * conveyed with text (and an aria-live status region), never colour alone.
 */
export function ParentFirstCallout({
  isParentAssigned,
  containerIdentity,
  onSelectContainer,
  testId,
  className,
}: ParentFirstCalloutProps) {
  if (isParentAssigned) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid={`${testId}-complete`}
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 border-b border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-800 dark:text-emerald-300",
          className,
        )}
      >
        <span className="inline-flex items-center gap-1 font-semibold">
          <CheckCircle2 className="size-3.5" />
          <span>Step 1 complete</span>
        </span>
        <span className="text-muted-foreground">
          Parent container assigned
          {containerIdentity ? (
            <>
              :{" "}
              <span className="font-mono text-foreground">
                {containerIdentity.code}
              </span>{" "}
              — {containerIdentity.name}
            </>
          ) : null}
          . Drawer and compartment selection and mapping are enabled.
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 border-b border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-900 dark:text-amber-200",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1 font-semibold">
        <AlertCircle className="size-3.5" />
        <span>Step 1: Select the parent container</span>
      </span>
      <span className="text-amber-800/90 dark:text-amber-200/80">
        Assign an Ananya location to the outer container to enable drawer and
        compartment mapping.
      </span>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={onSelectContainer}
        className="h-6 gap-1 border-amber-500/50 bg-card/80 text-[11px] text-amber-900 hover:bg-amber-500/20 dark:text-amber-200"
      >
        <Box className="size-3" />
        <span>Select outer container</span>
      </Button>
    </div>
  );
}
