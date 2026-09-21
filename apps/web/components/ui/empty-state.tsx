"use client";

import * as React from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: {
    label: string;
    onClick: () => void;
  };
  /**
   * Renders the state at a section's natural height.
   *
   * For empty collections nested inside an already-framed section (a detail
   * page's documentation list, for example) the full p-12 treatment with its
   * icon medallion and duplicate card border is more chrome than content. The
   * compact variant keeps the same copy and action but drops the medallion and
   * the outer border, so an empty section reads as one line rather than as a
   * placeholder standing in for a table.
   */
  compact?: boolean;
}

export function EmptyState({
  title = "No records found",
  description = "There are no entries to display at this moment.",
  icon: Icon = Inbox,
  action,
  compact = false,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-2 py-6 text-center">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            {description}
          </p>
        </div>
        {action && (
          <Button size="sm" variant="outline" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center p-12 text-center bg-card border border-border rounded-xl">
      <div className="p-3 bg-muted/50 rounded-full text-muted-foreground mb-3">
        <Icon className="w-8 h-8 text-muted-foreground/70" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        {description}
      </p>
      {action && (
        <div className="mt-4">
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
