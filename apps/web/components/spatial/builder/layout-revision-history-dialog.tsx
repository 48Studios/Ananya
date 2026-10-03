"use client";

import * as React from "react";
import { History, Calendar, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { spatialLayoutsApi } from "@/lib/api/spatial-layouts-api";
import type { SpatialLayoutRevisionRecordProps } from "@ananya/inventory";

export interface LayoutRevisionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  layoutId: string | null;
  layoutCode?: string | null;
}

export function LayoutRevisionHistoryDialog({
  isOpen,
  onClose,
  layoutId,
  layoutCode,
}: LayoutRevisionHistoryDialogProps) {
  const [revisions, setRevisions] = React.useState<
    SpatialLayoutRevisionRecordProps[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [expandedRevId, setExpandedRevId] = React.useState<string | null>(null);

  const fetchRevisions = React.useCallback(async () => {
    if (!layoutId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await spatialLayoutsApi.getRevisions(layoutId);
      // Sort newest first
      setRevisions([...data].sort((a, b) => b.revisionNumber - a.revisionNumber));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load revision history.",
      );
    } finally {
      setLoading(false);
    }
  }, [layoutId]);

  React.useEffect(() => {
    if (isOpen && layoutId) {
      fetchRevisions();
      setExpandedRevId(null);
    }
  }, [isOpen, layoutId, fetchRevisions]);

  if (!isOpen || !layoutId) return null;

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={`Revision Audit History — ${layoutCode || "Layout"}`}
      description="Immutable historical revision snapshots and topology change log."
      size="lg"
    >
      <DialogShellBody className="space-y-4 max-h-[560px] overflow-y-auto">
        {loading && (
          <div className="py-12 flex justify-center">
            <LoadingState message="Loading immutable revision audit snapshots..." />
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-xs text-destructive flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRevisions}
              className="h-7 text-xs"
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && revisions.length === 0 && (
          <EmptyState
            icon={History}
            title="No Revisions Recorded"
            description="Revisions are automatically appended whenever layout parameters or mappings are saved, published, or archived."
          />
        )}

        {!loading && !error && revisions.length > 0 && (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {revisions.map((rev) => {
              const diffAction = (rev.diffSummary as { action?: string })?.action;
              const isPublish = diffAction === "PUBLISH";
              const isArchive = diffAction === "ARCHIVE";
              const isExpanded = expandedRevId === rev.id;

              return (
                <div key={rev.id} className="relative group">
                  {/* Timeline bullet */}
                  <div
                    className={`absolute -left-[27px] top-1.5 size-4 rounded-full border-2 bg-background flex items-center justify-center ${
                      isPublish
                        ? "border-emerald-500 text-emerald-500"
                        : isArchive
                          ? "border-amber-500 text-amber-500"
                          : "border-primary text-primary"
                    }`}
                  >
                    <div
                      className={`size-1.5 rounded-full ${
                        isPublish
                          ? "bg-emerald-500"
                          : isArchive
                            ? "bg-amber-500"
                            : "bg-primary"
                      }`}
                    />
                  </div>

                  <div className="p-3.5 rounded-lg border border-border bg-card hover:border-border/80 transition-all text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground font-mono">
                          Revision #{rev.revisionNumber}
                        </span>
                        {isPublish && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            PUBLISHED
                          </span>
                        )}
                        {isArchive && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                            ARCHIVED
                          </span>
                        )}
                        {!isPublish && !isArchive && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            UPDATE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3" />
                          {new Date(rev.createdAt).toLocaleString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedRevId(isExpanded ? null : rev.id)
                          }
                          className="h-6 px-2 text-[11px]"
                        >
                          <Eye className="size-3 mr-1" />
                          {isExpanded ? "Hide Snapshot" : "Inspect Snapshot"}
                        </Button>
                      </div>
                    </div>

                    {rev.changeDescription && (
                      <p className="text-foreground/90 italic">
                        &ldquo;{rev.changeDescription}&rdquo;
                      </p>
                    )}

                    <div className="flex items-center gap-4 text-muted-foreground text-[11px] pt-1 border-t border-border/50">
                      <span>
                        Template:{" "}
                        <strong className="text-foreground font-mono">
                          {rev.configSnapshot?.templateType}
                        </strong>
                      </span>
                      <span>
                        Mapped Locations:{" "}
                        <strong className="text-foreground font-mono">
                          {rev.mappingsSnapshot?.length ?? 0}
                        </strong>
                      </span>
                      {rev.configSnapshot?.dimensions && (
                        <span>
                          Dimensions:{" "}
                          <span className="font-mono text-foreground">
                            {rev.configSnapshot.dimensions.widthMm} ×{" "}
                            {rev.configSnapshot.dimensions.heightMm} ×{" "}
                            {rev.configSnapshot.dimensions.depthMm} mm
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Collapsible Snapshot Detail */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3 bg-muted/30 p-2.5 rounded-md">
                        <div className="font-semibold text-foreground text-[11px]">
                          Snapshot Mappings ({rev.mappingsSnapshot.length}):
                        </div>
                        {rev.mappingsSnapshot.length === 0 ? (
                          <div className="text-muted-foreground italic text-[11px]">
                            No location mappings were recorded at this revision.
                          </div>
                        ) : (
                          <div className="max-h-36 overflow-y-auto divide-y divide-border/60 text-[11px]">
                            {rev.mappingsSnapshot.map((m) => (
                              <div
                                key={m.slotId}
                                className="py-1 flex items-center justify-between"
                              >
                                <span className="font-mono text-primary font-medium">
                                  {m.slotCode} ({m.slotId})
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  Location: {m.locationCode}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton>Close</DialogShellCancelButton>
      </DialogShellFooter>
    </DialogShell>
  );
}
