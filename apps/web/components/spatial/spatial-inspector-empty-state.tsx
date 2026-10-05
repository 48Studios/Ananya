"use client";

import { MousePointerClick } from "lucide-react";

export interface SpatialInspectorEmptyStateProps {
  /** Anchor authoring replaces the inspector; explain why it is empty. */
  isAuthoring?: boolean;
}

/**
 * Placeholder shown by the spatial location inspector while nothing is
 * selected. Keeping the sidebar mounted with an empty state means selection
 * changes only swap its contents — never its position or existence.
 */
export function SpatialInspectorEmptyState({
  isAuthoring = false,
}: SpatialInspectorEmptyStateProps) {
  return (
    <div
      data-testid="spatial-inspector-empty"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-center"
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-border bg-muted/40">
        <MousePointerClick className="size-4 text-muted-foreground" />
      </span>
      <p className="text-sm font-medium text-foreground">
        {isAuthoring ? "Anchor authoring in progress" : "Select a location"}
      </p>
      <p className="max-w-[16rem] text-xs text-muted-foreground">
        {isAuthoring
          ? "Exit anchor authoring to inspect a compartment's inventory and mapping details."
          : "Select a drawer, bin, cabinet, or other spatial location to inspect its inventory and mapping details."}
      </p>
    </div>
  );
}
