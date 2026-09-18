"use client";

import * as React from "react";
import {
  Sparkles,
  AlertTriangle,
  FolderTree,
  Copy,
  ListOrdered,
  HelpCircle,
  Check,
  X,
  Edit3,
  Loader2,
  RefreshCw,
  Layers,
  ShieldAlert,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellCancelButton,
} from "@/components/ui/dialog-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  attributesApi,
  type AttributeReviewQueueResponseDto,
  type ReviewQueueItemDto,
  type AttributeLibraryAuditResponseDto,
} from "@/lib/api/attributes-api";

interface AttributeReviewQueueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onActionComplete?: () => void;
  onEditAttribute?: (attributeId: string) => void;
}

export function AttributeReviewQueueDialog({
  isOpen,
  onClose,
  onActionComplete,
  onEditAttribute,
}: AttributeReviewQueueDialogProps) {
  const [queueData, setQueueData] =
    React.useState<AttributeReviewQueueResponseDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [auditing, setAuditing] = React.useState(false);
  const [auditResult, setAuditResult] =
    React.useState<AttributeLibraryAuditResponseDto | null>(null);
  const [filterType, setFilterType] = React.useState<string>("ALL");
  const [expandedWhy, setExpandedWhy] = React.useState<Record<string, boolean>>(
    {},
  );
  const [actionInProgress, setActionInProgress] = React.useState<
    Record<string, boolean>
  >({});
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const loadQueue = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await attributesApi.getReviewQueue();
      setQueueData(data);
    } catch {
      // silently fallback
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      loadQueue();
      setAuditResult(null);
      setStatusMessage(null);
    }
  }, [isOpen, loadQueue]);

  const handleRunAudit = async () => {
    setAuditing(true);
    setStatusMessage(null);
    try {
      const res = await attributesApi.auditLibrary();
      setAuditResult(res);
      setStatusMessage(
        `Audit completed: ${res.summary.issuesCount} findings across ${res.summary.totalAttributes} attributes.`,
      );
      await loadQueue();
      onActionComplete?.();
    } catch {
      setStatusMessage("Failed to execute library audit.");
    } finally {
      setAuditing(false);
    }
  };

  const toggleWhy = (itemId: string) => {
    setExpandedWhy((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleAcceptItem = async (item: ReviewQueueItemDto) => {
    setActionInProgress((prev) => ({ ...prev, [item.id]: true }));
    try {
      if (item.type === "SUGGESTED_BINDING" && item.attributeId && item.categoryId) {
        await attributesApi.bindCategory(item.attributeId, {
          categoryId: item.categoryId,
          isRequired: Boolean(item.payload.suggestedRequired),
        });
      } else if (item.type === "SUSPICIOUS_BINDING" && item.attributeId && item.categoryId) {
        await attributesApi.unbindCategory(item.attributeId, item.categoryId);
      } else if (item.type === "SUGGESTED_ENUM_VALUE" && item.attributeId && item.payload.code) {
        await attributesApi.addOption(item.attributeId, {
          code: String(item.payload.code),
          label: String(item.payload.label || item.payload.code),
        });
      }

      await attributesApi
        .recordFeedback({
          attributeDefinitionId: item.attributeId,
          categoryId: item.categoryId,
          items: [
            {
              suggestionType: item.type,
              field: "queue_item",
              userAction: "ACCEPTED",
              predictedValue: item.title,
              finalValue: item.title,
              confidenceLevel: item.confidenceLevel,
            },
          ],
        })
        .catch(() => {});

      setStatusMessage(`Accepted proposal: "${item.title}".`);
      setQueueData((prev) =>
        prev
          ? {
              ...prev,
              summary: {
                ...prev.summary,
                total: Math.max(0, prev.summary.total - 1),
              },
              items: prev.items.filter((i) => i.id !== item.id),
            }
          : null,
      );
      onActionComplete?.();
    } catch {
      setStatusMessage(`Failed to apply "${item.title}".`);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleRejectItem = async (item: ReviewQueueItemDto) => {
    setActionInProgress((prev) => ({ ...prev, [item.id]: true }));
    try {
      await attributesApi
        .recordFeedback({
          attributeDefinitionId: item.attributeId,
          categoryId: item.categoryId,
          items: [
            {
              suggestionType: item.type,
              field: "queue_item",
              userAction: "REJECTED",
              predictedValue: item.title,
              finalValue: null,
              confidenceLevel: item.confidenceLevel,
            },
          ],
        })
        .catch(() => {});

      setStatusMessage(`Dismissed proposal: "${item.title}".`);
      setQueueData((prev) =>
        prev
          ? {
              ...prev,
              summary: {
                ...prev.summary,
                total: Math.max(0, prev.summary.total - 1),
              },
              items: prev.items.filter((i) => i.id !== item.id),
            }
          : null,
      );
      onActionComplete?.();
    } finally {
      setActionInProgress((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const items = queueData?.items || [];
  const filteredItems = React.useMemo(() => {
    if (filterType === "ALL") return items;
    return items.filter((i) => i.type === filterType);
  }, [items, filterType]);

  const summary = queueData?.summary || {
    total: 0,
    suggestedBindings: 0,
    possibleDuplicates: 0,
    suspiciousBindings: 0,
    suggestedEnumValues: 0,
  };

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Attribute Intelligence Review Queue"
      description="Supervised AI proposals for category bindings, duplicates, suspicious relationships, and enum values."
      size="lg"
    >
      <DialogShellBody className="space-y-4">
        {/* Status Alert */}
        {statusMessage && (
          <div className="p-3 text-xs bg-primary/10 border border-primary/20 text-foreground rounded-lg flex items-center justify-between">
            <span>{statusMessage}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setStatusMessage(null)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {/* Header Summary & On-Demand Audit Trigger */}
        <div className="p-4 bg-muted/40 border border-border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary border border-primary/25">
                <Sparkles className="size-3.5" />
              </div>
              <span className="font-semibold text-xs text-foreground">
                {summary.total} Pending Review Items
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground font-mono">
              <span>{summary.suggestedBindings} bindings</span>
              <span>•</span>
              <span>{summary.possibleDuplicates} duplicates</span>
              <span>•</span>
              <span>{summary.suspiciousBindings} suspicious</span>
              <span>•</span>
              <span>{summary.suggestedEnumValues} enum values</span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={loadQueue}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={auditing}
              onClick={handleRunAudit}
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {auditing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sliders className="size-3.5" />
              )}
              Run Library Audit
            </Button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: "ALL", label: `All (${items.length})` },
            { id: "SUGGESTED_BINDING", label: `Bindings (${summary.suggestedBindings})` },
            { id: "POSSIBLE_DUPLICATE", label: `Duplicates (${summary.possibleDuplicates})` },
            { id: "SUSPICIOUS_BINDING", label: `Suspicious (${summary.suspiciousBindings})` },
            { id: "SUGGESTED_ENUM_VALUE", label: `Enums (${summary.suggestedEnumValues})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                filterType === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Items List */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span>Scanning attribute intelligence queue...</span>
          </div>
        ) : filteredItems.length > 0 ? (
          <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden shadow-2xs max-h-[420px] overflow-y-auto">
            {filteredItems.map((item) => {
              const isWhyExpanded = Boolean(expandedWhy[item.id]);
              const inProgress = Boolean(actionInProgress[item.id]);

              return (
                <div
                  key={item.id}
                  className="p-3.5 space-y-2.5 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.type === "SUGGESTED_BINDING" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">
                            <FolderTree className="size-3" /> BINDING
                          </span>
                        )}
                        {item.type === "POSSIBLE_DUPLICATE" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                            <Copy className="size-3" /> DUPLICATE
                          </span>
                        )}
                        {item.type === "SUSPICIOUS_BINDING" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-medium">
                            <ShieldAlert className="size-3" /> SUSPICIOUS
                          </span>
                        )}
                        {item.type === "SUGGESTED_ENUM_VALUE" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-medium">
                            <ListOrdered className="size-3" /> ENUM
                          </span>
                        )}

                        <span className="font-semibold text-xs text-foreground">
                          {item.title}
                        </span>

                        <StatusBadge
                          status={
                            item.confidenceLevel === "HIGH"
                              ? "SUCCESS"
                              : item.confidenceLevel === "MEDIUM"
                              ? "IN_REVIEW"
                              : "DRAFT"
                          }
                          label={`${item.confidenceLevel} CONFIDENCE`}
                        />
                      </div>

                      {item.subtitle && (
                        <p className="text-[11px] text-muted-foreground">
                          {item.subtitle}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleWhy(item.id)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Why this suggestion?"
                      >
                        <HelpCircle className="size-3.5" />
                      </Button>

                      {item.attributeId && onEditAttribute && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            onClose();
                            onEditAttribute(item.attributeId!);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Edit attribute definition"
                        >
                          <Edit3 className="size-3.5" />
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        disabled={inProgress}
                        onClick={() => handleRejectItem(item)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Reject suggestion"
                      >
                        <X className="size-3.5" />
                      </Button>

                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={inProgress}
                        onClick={() => handleAcceptItem(item)}
                        className="h-7 text-xs px-2.5 border-primary/30 text-primary hover:bg-primary/10 gap-1 font-medium"
                      >
                        {inProgress ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                        Accept
                      </Button>
                    </div>
                  </div>

                  {/* Why Evidence Accordion */}
                  {isWhyExpanded && (
                    <div className="pt-2 border-t border-border/60 text-[11px] space-y-1 animate-in fade-in-50 duration-150">
                      <span className="font-semibold text-foreground text-[10px] uppercase tracking-wider block">
                        Reasoning Evidence:
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                        {item.evidence.map((ev, idx) => (
                          <li key={idx}>
                            <span className="text-foreground">{ev.description}</span>
                            {ev.source && (
                              <span className="ml-1 text-[9px] font-mono text-muted-foreground">
                                [{ev.source}]
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center border border-dashed border-border rounded-xl bg-muted/5 space-y-2">
            <Sparkles className="size-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs font-semibold text-foreground">
              Review queue is clear
            </p>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
              All attribute proposals have been reviewed. Run a library audit to scan for new configuration improvements.
            </p>
          </div>
        )}
      </DialogShellBody>

      <DialogShellFooter>
        <DialogShellCancelButton onClick={onClose}>
          Close
        </DialogShellCancelButton>
      </DialogShellFooter>
    </DialogShell>
  );
}
