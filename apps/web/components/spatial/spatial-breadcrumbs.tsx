"use client";

import * as React from "react";
import { ChevronRight, ArrowUp, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DetailChip } from "@/components/ui/detail-field";
import type { SpatialBreadcrumbEntry } from "@/lib/spatial/spatial-hierarchy";

export interface SpatialBreadcrumbsProps {
  breadcrumbs: SpatialBreadcrumbEntry[];
  onNavigate: (locationId: string) => void;
  onUpOneLevel?: () => void;
  canGoUp?: boolean;
  className?: string;
}

export function SpatialBreadcrumbs({
  breadcrumbs,
  onNavigate,
  onUpOneLevel,
  canGoUp,
  className,
}: SpatialBreadcrumbsProps) {
  if (breadcrumbs.length === 0) return null;

  return (
    <nav
      aria-label="Physical storage hierarchy"
      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-card border border-border shadow-2xs ${className || ""}`}
    >
      {/* Breadcrumb Trail */}
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1 text-muted-foreground/80">
          <MapPin className="size-3.5 text-muted-foreground" />
          <span className="sr-only">Physical Path:</span>
        </li>

        {breadcrumbs.map((entry, index) => {
          const isLast = entry.isCurrent || index === breadcrumbs.length - 1;

          return (
            <li key={entry.id} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="size-3 text-muted-foreground/60 shrink-0"
                  aria-hidden="true"
                />
              )}

              {isLast ? (
                <span
                  className="flex items-center gap-1.5 font-semibold text-foreground font-mono"
                  aria-current="location"
                >
                  <span>{entry.code}</span>
                  {entry.kind && (
                    <DetailChip className="capitalize text-[10px] py-0 px-1.5 font-sans font-normal">
                      {entry.kind}
                    </DetailChip>
                  )}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(entry.id)}
                  className="flex items-center gap-1 font-mono hover:text-foreground hover:underline transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring rounded px-1 -mx-1"
                  title={`Navigate up to ${entry.name || entry.code}`}
                >
                  <span>{entry.code}</span>
                  {entry.kind && (
                    <span className="text-[10px] text-muted-foreground/70 capitalize font-sans">
                      ({entry.kind})
                    </span>
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {/* Up One Level Action */}
      {canGoUp && onUpOneLevel && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onUpOneLevel}
          className="h-6 px-2 text-xs font-medium gap-1 shrink-0 ml-auto"
          title="Navigate to parent location"
        >
          <ArrowUp className="size-3" />
          <span>Up one level</span>
        </Button>
      )}
    </nav>
  );
}
