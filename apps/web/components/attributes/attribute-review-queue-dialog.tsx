"use client";

import * as React from "react";
import {
  Sparkles,
  FolderTree,
  Copy,
  ListOrdered,
  HelpCircle,
  Check,
  X,
  Edit3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Unlink,
  Layers,
  ArrowRight,
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
} from "@/lib/api/attributes-api";

type FilterTabId =
  | "ALL"
  | "BINDINGS"
  | "DUPLICATES"
  | "SUSPICIOUS"
  | "UNUSED"
  | "ENUMS";

function matchesTab(itemType: string, tabId: FilterTabId): boolean {
  if (tabId === "ALL") return true;
  if (tabId === "BINDINGS") {
    return (
      itemType === "SUGGESTED_BINDING" ||
      itemType === "MISSING_EXPECTED_ATTRIBUTE" ||
      itemType === "MISSING_ATTRIBUTE"
    );
  }
  if (tabId === "DUPLICATES") {
    return (
      itemType === "POSSIBLE_DUPLICATE" ||
      itemType === "DUPLICATE_ATTRIBUTE" ||
      itemType === "DUPLICATE"
    );
  }
  if (tabId === "SUSPICIOUS") {
    return itemType === "SUSPICIOUS_BINDING";
  }
  if (tabId === "UNUSED") {
    return itemType === "UNUSED_ATTRIBUTE";
  }
  if (tabId === "ENUMS") {
    return (
      itemType === "SUGGESTED_ENUM_VALUE" ||
      itemType === "ENUM_INCONSISTENCY"
    );
  }
  return false;
}

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
  const [filterType, setFilterType] = React.useState<FilterTabId>("ALL");
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
      setStatusMessage("Failed to load attribute review queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      loadQueue();
      setStatusMessage(null);
    }
  }, [isOpen, loadQueue]);

  const handleRunAudit = async () => {
    setAuditing(true);
    setStatusMessage(null);
    try {
      const res = await attributesApi.auditLibrary();
      const count =
        res.summary.issuesCount ??
        (res.issues ? res.issues.length : 0);
      setStatusMessage(
        `Audit completed: ${count} finding${count === 1 ? "" : "s"} across ${res.summary.totalAttributes} attributes.`,
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
    const isBinding = matchesTab(item.type, "BINDINGS");
    const isSuspicious = matchesTab(item.type, "SUSPICIOUS");
    const isEnum = matchesTab(item.type, "ENUMS");

    try {
      let resolvedAttributeId = item.attributeId || null;

      if (isBinding && item.categoryId) {
        if (!resolvedAttributeId) {
          try {
            const allAttributes = await attributesApi.getAll();
            const normName = (item.attributeName || "").trim().toLowerCase();
            const normCode = (item.attributeCode || String(item.payload?.canonicalCode || "")).trim().toLowerCase();
            const found = allAttributes.find(
              (a) =>
                (normCode && a.code.toLowerCase() === normCode) ||
                (normName && a.name.toLowerCase() === normName) ||
                (a.aliases && a.aliases.some((al) => al.toLowerCase() === normName || al.toLowerCase() === normCode)),
            );
            if (found) {
              resolvedAttributeId = found.id;
            }
          } catch {
            // fallback error ignored
          }
        }

        if (resolvedAttributeId) {
          // Bind existing attribute to category
          await attributesApi.bindCategory(resolvedAttributeId, {
            categoryId: item.categoryId,
            isRequired: Boolean(item.payload?.suggestedRequired),
          });
        } else if (item.payload?.canonicalCode || item.attributeCode) {
          // If attribute definition does not exist yet, create canonical definition and bind
          const codeToUse = String(item.payload?.canonicalCode || item.attributeCode)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_");
          const nameToUse = item.attributeName || String(item.payload?.canonicalCode || codeToUse);

          const newAttr = await attributesApi.createDefinition({
            name: nameToUse,
            code: codeToUse,
            dataType:
              (item.payload?.dataType as
                | "TEXT"
                | "NUMBER"
                | "INTEGER"
                | "BOOLEAN"
                | "SELECT"
                | "MULTI_SELECT"
                | "QUANTITY"
                | "DATE") || "QUANTITY",
            unitCategory: item.payload?.unitCategory
              ? String(item.payload.unitCategory)
              : undefined,
            defaultUnit: item.payload?.defaultUnit
              ? String(item.payload.defaultUnit)
              : undefined,
            groupName: item.payload?.group
              ? String(item.payload.group)
              : undefined,
          });
          resolvedAttributeId = newAttr.id;
          await attributesApi.bindCategory(newAttr.id, {
            categoryId: item.categoryId,
            isRequired: Boolean(item.payload?.suggestedRequired),
          });
        } else {
          throw new Error(
            `Unable to bind attribute: no definition found or specified for "${item.attributeName || item.title}".`,
          );
        }
      } else if (isSuspicious && item.attributeId && item.categoryId) {
        await attributesApi.unbindCategory(item.attributeId, item.categoryId);
      } else if (
        isEnum &&
        item.attributeId &&
        item.payload?.code
      ) {
        await attributesApi.addOption(item.attributeId, {
          code: String(item.payload.code),
          label: String(item.payload.label || item.payload.code),
        });
      } else {
        throw new Error(
          `Action cannot be applied: missing target identifiers for "${item.title || item.reason}".`,
        );
      }

      await attributesApi
        .recordFeedback({
          attributeDefinitionId: resolvedAttributeId || item.attributeId || undefined,
          categoryId: item.categoryId || undefined,
          items: [
            {
              suggestionType: item.type,
              field: "queue_item",
              userAction: "ACCEPTED",
              predictedValue: item.title || item.reason,
              finalValue: item.title || item.reason,
              confidenceLevel: item.confidenceLevel,
            },
          ],
        })
        .catch(() => { });

      setStatusMessage(
        `Applied decision: "${item.title || item.attributeName || item.reason}".`,
      );
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
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : `Failed to apply "${item.title || item.attributeName || item.reason}".`,
      );
    } finally {
      setActionInProgress((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleRejectItem = async (item: ReviewQueueItemDto) => {
    setActionInProgress((prev) => ({ ...prev, [item.id]: true }));
    try {
      await attributesApi
        .recordFeedback({
          attributeDefinitionId: item.attributeId || undefined,
          categoryId: item.categoryId || undefined,
          items: [
            {
              suggestionType: item.type,
              field: "queue_item",
              userAction: "REJECTED",
              predictedValue: item.title || item.reason,
              finalValue: null,
              confidenceLevel: item.confidenceLevel,
            },
          ],
        })
        .catch(() => { });

      setStatusMessage(
        `Dismissed proposal: "${item.title || item.attributeName || item.reason}".`,
      );
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

  const items = React.useMemo(() => queueData?.items || [], [queueData?.items]);

  // Dynamically compute exact counts from loaded items to avoid undefined values
  const counts = React.useMemo(() => {
    return {
      all: items.length,
      bindings: items.filter((i) => matchesTab(i.type, "BINDINGS")).length,
      duplicates: items.filter((i) => matchesTab(i.type, "DUPLICATES")).length,
      suspicious: items.filter((i) => matchesTab(i.type, "SUSPICIOUS")).length,
      unused: items.filter((i) => matchesTab(i.type, "UNUSED")).length,
      enums: items.filter((i) => matchesTab(i.type, "ENUMS")).length,
    };
  }, [items]);

  const filteredItems = React.useMemo(() => {
    if (filterType === "ALL") return items;
    return items.filter((i) => matchesTab(i.type, filterType));
  }, [items, filterType]);

  const filterTabs: Array<{ id: FilterTabId; label: string; count: number }> = [
    { id: "ALL", label: "All", count: counts.all },
    { id: "BINDINGS", label: "Bindings", count: counts.bindings },
    { id: "DUPLICATES", label: "Duplicates", count: counts.duplicates },
    { id: "SUSPICIOUS", label: "Suspicious", count: counts.suspicious },
    { id: "UNUSED", label: "Unused", count: counts.unused },
    { id: "ENUMS", label: "Enums", count: counts.enums },
  ];

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
          <div className="space-y-1 flex gap-3 items-center">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary/15 text-primary border border-primary/25 m-0">
              <Sparkles className="size-5" />
            </div>
            <div className="gap-2">
              <span className="font-semibold text-xs text-foreground">
                {counts.all} Pending Review Item{counts.all === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground font-mono">
                <span>{counts.bindings} bindings</span>
                <span>•</span>
                <span>{counts.duplicates} duplicates</span>
                <span>•</span>
                <span>{counts.suspicious} suspicious</span>
                <span>•</span>
                <span>{counts.unused} unused</span>
                {counts.enums > 0 && (
                  <>
                    <span>•</span>
                    <span>{counts.enums} enum values</span>
                  </>
                )}
              </div>
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

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 ${filterType === tab.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
            >
              {tab.label} ({tab.count})
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
          <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden shadow-2xs max-h-[460px] overflow-y-auto">
            {filteredItems.map((item) => {
              const isWhyExpanded = Boolean(expandedWhy[item.id]);
              const inProgress = Boolean(actionInProgress[item.id]);

              const isBinding = matchesTab(item.type, "BINDINGS");
              const isDuplicate = matchesTab(item.type, "DUPLICATES");
              const isSuspicious = matchesTab(item.type, "SUSPICIOUS");
              const isUnused = matchesTab(item.type, "UNUSED");
              const isEnum = matchesTab(item.type, "ENUMS");

              // Clear headline describing the decision
              const displayTitle =
                item.title ||
                (isBinding
                  ? `Bind "${item.attributeName || "Attribute"}" to category "${item.categoryName || "Category"}"`
                  : isSuspicious
                    ? `Unbind suspicious "${item.attributeName || "Attribute"}" from "${item.categoryName || "Category"}"`
                    : isDuplicate
                      ? `Possible Duplicate: "${item.attributeName || "Attribute"}"`
                      : isUnused
                        ? `Unused Attribute: "${item.attributeName || "Attribute"}"`
                        : item.reason || "Review item");

              const displaySubtitle = item.subtitle || item.reason || "";
              const attrCode =
                item.attributeCode ||
                (item.payload?.canonicalCode as string | undefined);
              const dataType = item.payload?.dataType as string | undefined;
              const defaultUnit = item.payload?.defaultUnit as
                | string
                | undefined;

              return (
                <div
                  key={item.id}
                  className="p-4 space-y-2.5 hover:bg-muted/15 transition-colors"
                >
                  {/* Top Bar: Badges, Title, and Action Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isBinding && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-medium">
                            <FolderTree className="size-3" /> BINDING PROPOSAL
                          </span>
                        )}
                        {isDuplicate && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                            <Copy className="size-3" /> DUPLICATE DETECTED
                          </span>
                        )}
                        {isSuspicious && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-medium">
                            <ShieldAlert className="size-3" /> SUSPICIOUS BINDING
                          </span>
                        )}
                        {isUnused && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 font-medium">
                            <Layers className="size-3" /> UNUSED ATTRIBUTE
                          </span>
                        )}
                        {isEnum && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 font-medium">
                            <ListOrdered className="size-3" /> ENUM OPTION
                          </span>
                        )}

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

                      {/* Clear, Bold Action Title */}
                      <h4 className="text-sm font-semibold text-foreground tracking-tight">
                        {displayTitle}
                      </h4>

                      {/* Human-readable Reason / Subtitle */}
                      {displaySubtitle && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {displaySubtitle}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0 pt-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleWhy(item.id)}
                        className={`text-muted-foreground hover:text-foreground ${isWhyExpanded ? "bg-muted text-foreground" : ""
                          }`}
                        title="View reasoning evidence"
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
                        title="Dismiss proposal"
                      >
                        <X className="size-3.5" />
                      </Button>

                      {/* Primary Action Button Contextualized */}
                      {isBinding && (
                        <Button
                          type="button"
                          size="xs"
                          disabled={inProgress}
                          onClick={() => handleAcceptItem(item)}
                          className="h-7 text-xs px-2.5 bg-primary text-primary-foreground hover:bg-primary/90 gap-1 font-medium"
                        >
                          {inProgress ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3" />
                          )}
                          Accept Binding
                        </Button>
                      )}

                      {isSuspicious && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={inProgress}
                          onClick={() => handleAcceptItem(item)}
                          className="h-7 text-xs px-2.5 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 gap-1 font-medium"
                        >
                          {inProgress ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Unlink className="size-3" />
                          )}
                          Unbind
                        </Button>
                      )}

                      {isEnum && (
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
                          Add Option
                        </Button>
                      )}

                      {(isDuplicate || isUnused) && item.attributeId && onEditAttribute && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            onClose();
                            onEditAttribute(item.attributeId!);
                          }}
                          className="h-7 text-xs px-2.5 border-border hover:bg-muted gap-1 font-medium"
                        >
                          <Edit3 className="size-3" />
                          Inspect
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Relevant Data Grid / Context Details */}
                  <div className="flex justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/70 text-xs">
                    {/* Attribute Column */}
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <Sliders className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-foreground/80">Attribute:</span>
                      <span className="font-semibold text-foreground truncate">
                        {item.attributeName || "—"}
                      </span>
                      {attrCode && (
                        <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background border border-border text-muted-foreground">
                          {attrCode}
                        </code>
                      )}
                      {dataType && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          ({dataType}
                          {defaultUnit ? `: ${defaultUnit}` : ""})
                        </span>
                      )}
                    </div>

                    {/* Target / Association Details Column */}
                    {item.categoryName ? (
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-foreground/80">
                          {isSuspicious ? "Bound Category:" : "Target Category:"}
                        </span>
                        <span className="font-semibold text-foreground truncate">
                          {item.categoryName}
                        </span>
                        {item.payload?.suggestedRequired ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                            Required
                          </span>
                        ) : isBinding ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border font-medium">
                            Optional
                          </span>
                        ) : null}
                      </div>
                    ) : item.payload?.targetAttributeName ? (
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-foreground/80">Matches:</span>
                        <span className="font-semibold text-foreground truncate">
                          {String(item.payload.targetAttributeName)}
                        </span>
                        {Boolean(item.payload?.similarity) && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                            {Math.round(Number(item.payload?.similarity) * 100)}% match
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Layers className="size-3.5 shrink-0" />
                        <span className="text-[11px]">
                          0 category bindings • 0 ledger references
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Why Evidence Accordion */}
                  {isWhyExpanded && (
                    <div className="pt-2 border-t border-border/60 text-[11px] space-y-1.5 animate-in fade-in-50 duration-150">
                      <span className="font-semibold text-foreground text-[10px] uppercase tracking-wider block">
                        Reasoning Evidence & Grounding:
                      </span>
                      {item.evidence && item.evidence.length > 0 ? (
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          {item.evidence.map((ev, idx) => (
                            <li key={idx} className="leading-normal">
                              <span className="text-foreground">{ev.description}</span>
                              {ev.source && (
                                <span className="ml-1.5 text-[9px] font-mono text-muted-foreground/80 px-1 py-0.2 rounded bg-muted border border-border/50">
                                  {ev.source}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          {item.reason || "Determined via attribute taxonomy and category heuristics."}
                        </p>
                      )}
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
              {filterType === "ALL"
                ? "Review queue is clear"
                : `No items in ${filterType.toLowerCase()} filter`}
            </p>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
              {filterType === "ALL"
                ? "All attribute proposals have been reviewed. Run a library audit to scan for new configuration improvements."
                : `There are currently 0 pending items matching the ${filterType.toLowerCase()} queue category.`}
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
