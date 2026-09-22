"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Building2,
  Copy,
  Filter,
  HelpCircle,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Tag,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  componentReviewQueueApi,
  type ComponentReviewFindingDto,
  type ComponentReviewIssueCategory,
  type ComponentReviewIssueType,
  type ComponentReviewQueuePageDto,
  type ConfidenceLevel,
  type ConsolidationResultDto,
} from "@/lib/api/component-review-queue-api";
import { categoriesApi } from "@/lib/api/categories-api";
import { manufacturersApi } from "@/lib/api/manufacturers-api";
import {
  ALL_FILTER_VALUE,
  COMPONENT_WRITE_PERMISSION,
  CONFIDENCE_FILTER_OPTIONS,
  ISSUE_CATEGORY_FILTER_OPTIONS,
  ISSUE_TYPE_FILTER_OPTIONS,
  QUEUE_TABS,
  STATUS_BADGE,
  STATUS_FILTER_OPTIONS,
  applyConsolidationToFinding,
  applyFindingStatusToQueuePage,
  auditUnavailableReason,
  buildFindingValueSummary,
  buildQueueTabCounts,
  componentHref,
  confidenceBadgeStatus,
  deriveReviewPermissions,
  filterValueToParam,
  formatConfidencePercent,
  isDuplicateFinding,
  isStale,
  issueTypeShortLabel,
  matchesQueueTab,
  normalizeEvidence,
  queueCardActions,
  reviewReadOnlyNotice,
  staleExplanation,
  statusLabel,
  summarizeAuditResult,
  type QueueTabId,
  type ReviewReferenceMaps,
} from "@/lib/component-review-queue";
import { ComponentReviewFindingDialog } from "./component-review-queue-finding-dialog";
import { ComponentReviewApplyDialog } from "./component-review-apply-dialog";

interface ComponentReviewQueueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Notifies the host page so it can refresh its pending count. */
  onActionComplete?: () => void;
}

/**
 * Component Intelligence Review Queue.
 *
 * Presents the same interaction model as the Attribute Intelligence Review
 * queue: a single large dialog with a counts header, an audit action, filter
 * tabs, and a scrollable list of finding cards. Selecting a card opens the
 * finding detail (evidence, current/suggested values, duplicate comparison).
 *
 * The queue is a persisted review workflow, so decision, apply, and audit
 * actions require the component-write permission; read-only reviewers get a
 * fully inspectable queue with no write controls. The API enforces the same
 * permission independently.
 */
export function ComponentReviewQueueDialog({
  isOpen,
  onClose,
  onActionComplete,
}: ComponentReviewQueueDialogProps) {
  const { hasPermission } = useAuth();
  const permissions = deriveReviewPermissions(
    hasPermission(COMPONENT_WRITE_PERMISSION),
  );
  const auditReason = auditUnavailableReason(permissions.canAudit);

  const [page, setPage] = React.useState<ComponentReviewQueuePageDto | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [auditing, setAuditing] = React.useState(false);

  const [tab, setTab] = React.useState<QueueTabId>("ALL");
  const [statusFilter, setStatusFilter] = React.useState(ALL_FILTER_VALUE);
  const [categoryFilter, setCategoryFilter] = React.useState(ALL_FILTER_VALUE);
  const [issueTypeFilter, setIssueTypeFilter] =
    React.useState(ALL_FILTER_VALUE);
  const [confidenceFilter, setConfidenceFilter] =
    React.useState(ALL_FILTER_VALUE);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");

  const [expandedWhy, setExpandedWhy] = React.useState<Record<string, boolean>>(
    {},
  );
  const [actionInProgress, setActionInProgress] = React.useState<
    Record<string, boolean>
  >({});
  const [rejectTarget, setRejectTarget] =
    React.useState<ComponentReviewFindingDto | null>(null);
  const [applyTarget, setApplyTarget] =
    React.useState<ComponentReviewFindingDto | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [detailFinding, setDetailFinding] =
    React.useState<ComponentReviewFindingDto | null>(null);
  const [detailFindingId, setDetailFindingId] = React.useState<string | null>(
    null,
  );

  const [refs, setRefs] = React.useState<ReviewReferenceMaps>({});

  const loadQueue = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await componentReviewQueueApi.listFindings({
        status: filterValueToParam(statusFilter),
        issueCategory: filterValueToParam(categoryFilter) as
          ComponentReviewIssueCategory | undefined,
        issueType: filterValueToParam(issueTypeFilter) as
          ComponentReviewIssueType | undefined,
        confidenceLevel: filterValueToParam(confidenceFilter) as
          ConfidenceLevel | undefined,
        search: search.trim() || undefined,
        // No `page`/`pageSize`: one request returns every finding matching the
        // filters, so the list stays a plain scroll region with no paging and
        // nothing is silently truncated at a page boundary.
        sortBy: "createdAt",
        sortDirection: "desc",
      });
      setPage(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load the component review queue.",
      );
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, issueTypeFilter, confidenceFilter, search]);

  React.useEffect(() => {
    if (isOpen) {
      void loadQueue();
      setStatusMessage(null);
    }
  }, [isOpen, loadQueue]);

  // Resolve manufacturer/category identifiers to names for cards and detail.
  React.useEffect(() => {
    if (!isOpen) return;
    let active = true;
    Promise.all([
      categoriesApi.getAll().catch(() => []),
      manufacturersApi.getAll().catch(() => []),
    ]).then(([categories, manufacturers]) => {
      if (!active) return;
      setRefs({
        categoryNames: new Map(categories.map((item) => [item.id, item.name])),
        manufacturerNames: new Map(
          manufacturers.map((item) => [item.id, item.name]),
        ),
      });
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  // Debounced server-side search, matching the column-filter behaviour of the
  // Attribute queue (which filters as you type).
  React.useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const items = React.useMemo(() => page?.items ?? [], [page?.items]);
  // Counted from the loaded rows, which are complete: the request above sends no
  // page size, so the backend returns every match. A count therefore describes
  // exactly what clicking the tab shows.
  const tabCounts = React.useMemo(() => buildQueueTabCounts(items), [items]);
  const visibleItems = React.useMemo(
    () => items.filter((item) => matchesQueueTab(item, tab)),
    [items, tab],
  );

  const filtered = Boolean(
    filterValueToParam(statusFilter) ||
    filterValueToParam(categoryFilter) ||
    filterValueToParam(issueTypeFilter) ||
    filterValueToParam(confidenceFilter) ||
    search.trim(),
  );

  const toggleWhy = (findingId: string) => {
    setExpandedWhy((prev) => ({ ...prev, [findingId]: !prev[findingId] }));
  };

  const clearFilters = () => {
    setStatusFilter(ALL_FILTER_VALUE);
    setCategoryFilter(ALL_FILTER_VALUE);
    setIssueTypeFilter(ALL_FILTER_VALUE);
    setConfidenceFilter(ALL_FILTER_VALUE);
    // Both the box and the applied term: leaving the debounced value behind would
    // let the next request run with the search the reviewer just cleared.
    setSearchInput("");
    setSearch("");
    setTab("ALL");
  };

  const openDetail = (finding: ComponentReviewFindingDto) => {
    setDetailFinding(finding);
    setDetailFindingId(finding.id);
  };

  /**
   * Reconciliation after a consolidation completed.
   *
   * Consolidation commits the finding as ACCEPTED inside its own transaction,
   * so `result` is the outcome the server already recorded, not a prediction.
   * The loaded page is therefore updated surgically from it — the one affected
   * row and the two summary counters that moved — which is what makes the
   * affected card and the tab counts agree immediately instead of one round
   * trip later.
   *
   * The scoped `loadQueue()` that follows is the reconciliation step already
   * used by every other action in this dialog. It re-derives the list under the
   * active filters, so a row whose new status the filter excludes leaves once
   * the server confirms it, without the targeted update above having to guess
   * at the filter's own rules. Nothing outside this dialog is refetched.
   */
  const handleConsolidated = (result: ConsolidationResultDto) => {
    setPage((current) =>
      current
        ? applyFindingStatusToQueuePage(current, result.findingId, "ACCEPTED")
        : current,
    );
    setDetailFinding((current) => applyConsolidationToFinding(current, result));
    void loadQueue();
    onActionComplete?.();
  };

  const handleRunAudit = async () => {
    setAuditing(true);
    setStatusMessage(null);
    try {
      const result = await componentReviewQueueApi.runAudit({
        scope: "RECENTLY_UPDATED",
      });
      setStatusMessage(summarizeAuditResult(result));
      await loadQueue();
      onActionComplete?.();
    } catch (err) {
      setStatusMessage(
        err instanceof Error
          ? err.message
          : "Failed to run the component audit.",
      );
    } finally {
      setAuditing(false);
    }
  };

  /** Records a lifecycle decision from a queue card. */
  const recordCardDecision = async (
    finding: ComponentReviewFindingDto,
    decision: "ACCEPTED" | "REJECTED",
  ) => {
    setActionInProgress((prev) => ({ ...prev, [finding.id]: true }));
    setStatusMessage(null);
    try {
      await componentReviewQueueApi.recordDecision(finding.id, {
        decision,
        expectedFingerprint: finding.fingerprint,
      });
      setStatusMessage(
        decision === "ACCEPTED"
          ? "Finding accepted as a review decision. The component was not modified."
          : "Finding rejected. The component was not modified.",
      );
      await loadQueue();
      onActionComplete?.();
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : "Failed to record the decision.",
      );
    } finally {
      setActionInProgress((prev) => ({ ...prev, [finding.id]: false }));
      setRejectTarget(null);
    }
  };

  const applyFinding = async (finding: ComponentReviewFindingDto) => {
    setSubmitting(true);
    setStatusMessage(null);
    try {
      const { appliedValue, appliedValueLabel, fieldLabel } =
        await componentReviewQueueApi.applyFinding(finding.id, {
          expectedFingerprint: finding.fingerprint,
        });
      setApplyTarget(null);
      setStatusMessage(
        `${fieldLabel} updated to "${appliedValueLabel ?? appliedValue ?? "—"}". The finding is now accepted.`,
      );
      await loadQueue();
      onActionComplete?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to apply the suggestion.";
      setApplyTarget(null);
      setStatusMessage(message);
      await loadQueue();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogShell
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Component Intelligence Review Queue"
        description="Supervised AI findings for identity, classification, and duplicates"
        size="lg"
        icon={<Sparkles className="size-5" />}
        headerActions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void loadQueue()}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={auditing || !permissions.canAudit}
              onClick={() => void handleRunAudit()}
              title={
                auditReason ??
                "Analyze recently updated components and persist new findings (component data is not modified)"
              }
              className="h-8 gap-1.5 text-xs"
            >
              {auditing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sliders className="size-3.5" />
              )}
              Run Component Audit
            </Button>
          </>
        }
      >
        <DialogShellBody scrollable={false}>
          {/* Status Alert */}
          {statusMessage && (
            <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-foreground">
              <span>{statusMessage}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setStatusMessage(null)}
                aria-label="Dismiss message"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          )}

          {permissions.isReadOnly && (
            <div className="flex shrink-0 items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{reviewReadOnlyNotice()}</span>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1">
            {QUEUE_TABS.map((definition) => (
              <button
                key={definition.id}
                type="button"
                onClick={() => setTab(definition.id)}
                className={`shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === definition.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {definition.label} ({tabCounts[definition.id]})
              </button>
            ))}
          </div>

          {/* Server-side filters: search on its own row, controls beneath. */}
          <div className="shrink-0 space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search findings, components, SKUs, or part numbers..."
                className="h-8 pl-9 text-xs"
                aria-label="Search findings"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="mx-1.5 size-3.5 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value ?? ALL_FILTER_VALUE)
                }
              >
                <SelectTrigger
                  className="h-8 min-w-[140px] flex-1 text-xs"
                  aria-label="Status filter"
                >
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent className="p-1.5">
                  <SelectItem value={ALL_FILTER_VALUE} className="text-xs">
                    All statuses
                  </SelectItem>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={categoryFilter}
                onValueChange={(value) =>
                  setCategoryFilter(value ?? ALL_FILTER_VALUE)
                }
              >
                <SelectTrigger
                  className="h-8 min-w-[140px] flex-1 text-xs"
                  aria-label="Category filter"
                >
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent className="p-1.5">
                  <SelectItem value={ALL_FILTER_VALUE} className="text-xs">
                    All categories
                  </SelectItem>
                  {ISSUE_CATEGORY_FILTER_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={issueTypeFilter}
                onValueChange={(value) =>
                  setIssueTypeFilter(value ?? ALL_FILTER_VALUE)
                }
              >
                <SelectTrigger
                  className="h-8 min-w-[140px] flex-1 text-xs"
                  aria-label="Issue type filter"
                >
                  <SelectValue placeholder="All issue types" />
                </SelectTrigger>
                <SelectContent className="p-1.5">
                  <SelectItem value={ALL_FILTER_VALUE} className="text-xs">
                    All issue types
                  </SelectItem>
                  {ISSUE_TYPE_FILTER_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={confidenceFilter}
                onValueChange={(value) =>
                  setConfidenceFilter(value ?? ALL_FILTER_VALUE)
                }
              >
                <SelectTrigger
                  className="h-8 min-w-[140px] flex-1 text-xs"
                  aria-label="Confidence filter"
                >
                  <SelectValue placeholder="All confidence" />
                </SelectTrigger>
                <SelectContent className="p-1.5">
                  <SelectItem value={ALL_FILTER_VALUE} className="text-xs">
                    All confidence
                  </SelectItem>
                  {CONFIDENCE_FILTER_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filtered && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 gap-1.5 text-xs text-muted-foreground"
                >
                  <X className="size-3.5" />
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Items List */}
          {loading && !page ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span>Scanning component intelligence queue...</span>
            </div>
          ) : error && !page ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 py-10 text-center">
              <AlertTriangle className="size-6 text-destructive" />
              <p className="text-xs font-semibold text-foreground">
                Error loading the review queue
              </p>
              <p className="max-w-sm text-[11px] text-muted-foreground">
                {error}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadQueue()}
                className="mt-1 h-8 gap-1.5 text-xs"
              >
                <RefreshCw className="size-3.5" />
                Try Again
              </Button>
            </div>
          ) : visibleItems.length > 0 ? (
            <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card shadow-2xs">
              {visibleItems.map((finding) => {
                const isWhyExpanded = Boolean(expandedWhy[finding.id]);
                const inProgress = Boolean(actionInProgress[finding.id]);
                const duplicate = isDuplicateFinding(finding);
                const actions = queueCardActions(finding, permissions);
                const summary = buildFindingValueSummary(finding, refs);
                const evidence = normalizeEvidence(finding.evidence);

                return (
                  <div
                    key={finding.id}
                    className="space-y-2.5 p-4 transition-colors hover:bg-muted/15"
                  >
                    {/* Top Bar: badges, title, actions */}
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${
                              duplicate
                                ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : finding.issueCategory === "CLASSIFICATION"
                                  ? "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                  : "border-primary/20 bg-primary/10 text-primary"
                            }`}
                          >
                            {duplicate ? (
                              <Copy className="size-3" />
                            ) : finding.issueCategory === "CLASSIFICATION" ? (
                              <Tag className="size-3" />
                            ) : (
                              <Building2 className="size-3" />
                            )}
                            {issueTypeShortLabel(
                              finding.issueType,
                            ).toUpperCase()}
                          </span>

                          <StatusBadge
                            status={STATUS_BADGE[finding.status] ?? "DRAFT"}
                            label={statusLabel(finding.status)}
                          />

                          {finding.confidenceLevel && (
                            <StatusBadge
                              status={confidenceBadgeStatus(
                                finding.confidenceLevel,
                              )}
                              label={`${finding.confidenceLevel} CONFIDENCE`}
                            />
                          )}

                          {isStale(finding) && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="size-3" />
                              Needs re-analysis
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-semibold tracking-tight text-foreground">
                          {finding.title}
                        </h4>

                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {finding.description}
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex shrink-0 items-center gap-1.5 self-end pt-0.5 sm:self-start">
                        {actions.includes("EVIDENCE") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => toggleWhy(finding.id)}
                            className={`text-muted-foreground hover:text-foreground ${
                              isWhyExpanded ? "bg-muted text-foreground" : ""
                            }`}
                            title="View reasoning evidence"
                            aria-label="View reasoning evidence"
                          >
                            <HelpCircle className="size-3.5" />
                          </Button>
                        )}

                        {actions.includes("INSPECT") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => openDetail(finding)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Inspect finding details"
                            aria-label="Inspect finding details"
                          >
                            <Search className="size-3.5" />
                          </Button>
                        )}

                        {actions.includes("OPEN_COMPONENT") && (
                          <Link href={componentHref(finding.componentId)}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="text-muted-foreground hover:text-foreground"
                              title="Open component"
                              aria-label="Open component"
                            >
                              <Archive className="size-3.5" />
                            </Button>
                          </Link>
                        )}

                        {actions.includes("REJECT") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={inProgress}
                            onClick={() => setRejectTarget(finding)}
                            className="text-muted-foreground hover:text-destructive"
                            title="Reject finding"
                            aria-label="Reject finding"
                          >
                            <X className="size-3.5" />
                          </Button>
                        )}

                        {actions.includes("APPLY") && (
                          <Button
                            type="button"
                            size="xs"
                            disabled={inProgress || submitting}
                            onClick={() => setApplyTarget(finding)}
                            className="h-7 gap-1 px-2.5 text-xs font-medium"
                            title="Write the suggested value to the component"
                          >
                            {inProgress ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Sparkles className="size-3" />
                            )}
                            Accept &amp; Apply
                          </Button>
                        )}

                        {actions.includes("ACCEPT") && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={inProgress}
                            onClick={() =>
                              void recordCardDecision(finding, "ACCEPTED")
                            }
                            className="h-7 gap-1 px-2.5 text-xs font-medium"
                            title="Records that the finding is valid without changing the component"
                          >
                            {inProgress ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : null}
                            Accept
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Context: component identity and current → suggested */}
                    <div className="flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 p-2.5 text-xs sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="font-medium text-foreground/80">
                          Component:
                        </span>
                        <Link
                          href={componentHref(finding.componentId)}
                          className="truncate font-semibold text-foreground hover:underline"
                          title={finding.component?.name ?? undefined}
                        >
                          {finding.component?.name ?? "Unknown component"}
                        </Link>
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {summary.fieldLabel ? (
                          <>
                            <span className="font-medium text-foreground/80">
                              {summary.fieldLabel}:
                            </span>
                            <span
                              className="truncate font-mono text-foreground/70 italic"
                              title={summary.current}
                            >
                              {summary.current}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span
                              className="truncate font-mono font-semibold text-foreground"
                              title={summary.suggested}
                            >
                              {summary.suggested}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-foreground/80">
                              Compare:
                            </span>
                            <span
                              className="truncate font-mono text-foreground"
                              title={summary.current}
                            >
                              {summary.current}
                            </span>
                            <span className="text-muted-foreground">vs</span>
                            <span
                              className="truncate font-mono text-foreground"
                              title={summary.suggested}
                            >
                              {summary.suggested}
                            </span>
                            {summary.relatedSku && (
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {summary.relatedSku}
                              </span>
                            )}
                          </>
                        )}
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {formatConfidencePercent(finding.confidence)}
                        </span>
                      </div>
                    </div>

                    {/* Why Evidence Accordion */}
                    {isWhyExpanded && (
                      <div className="animate-in space-y-1.5 border-t border-border/60 pt-2 text-[11px] fade-in-50 duration-150">
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-foreground">
                          Reasoning Evidence &amp; Grounding:
                        </span>
                        {evidence.length > 0 ? (
                          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                            {evidence.map((item, index) => (
                              <li
                                key={`${item.type}-${index}`}
                                className="leading-normal"
                              >
                                <span className="text-foreground">
                                  {item.description}
                                </span>
                                {item.source && (
                                  <span className="ml-1.5 rounded border border-border/50 bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground/80">
                                    {item.source}
                                  </span>
                                )}
                                {!isDuplicateFinding(finding) &&
                                  item.weight !== null && (
                                    <span className="ml-1.5 font-mono text-[9px] text-muted-foreground/80">
                                      w{item.weight.toFixed(2)}
                                    </span>
                                  )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No evidence recorded. Inspect the finding for the
                            recorded snapshot.
                          </p>
                        )}
                        {isStale(finding) && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            {staleExplanation(finding)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center space-y-2 rounded-xl border border-dashed border-border bg-muted/5 py-12 text-center">
              <Sparkles className="mx-auto size-8 text-muted-foreground/30" />
              <p className="text-xs font-semibold text-foreground">
                {filtered || tab !== "ALL"
                  ? "No findings match these filters"
                  : "Review queue is clear"}
              </p>
              <p className="mx-auto max-w-sm text-[11px] text-muted-foreground">
                {filtered || tab !== "ALL"
                  ? "Adjust or clear the filters and tabs to see other findings."
                  : "All component findings have been reviewed. Run a component audit to analyze the catalog again."}
              </p>
              {(filtered || tab !== "ALL") && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="mt-1 h-8 gap-1.5 text-xs"
                >
                  <X className="size-3.5" />
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </DialogShellBody>

        <DialogShellFooter>
          <DialogShellCancelButton onClick={onClose}>
            Close
          </DialogShellCancelButton>
        </DialogShellFooter>
      </DialogShell>

      {/* Nested detail dialog: evidence, values, duplicate comparison, decisions */}
      <ComponentReviewFindingDialog
        findingId={detailFindingId}
        initialFinding={detailFinding}
        refs={refs}
        onClose={() => {
          setDetailFindingId(null);
          setDetailFinding(null);
        }}
        onDecided={() => {
          void loadQueue();
          onActionComplete?.();
        }}
        onConflict={(message) => setStatusMessage(message)}
        onConsolidated={handleConsolidated}
      />

      <ComponentReviewApplyDialog
        isOpen={Boolean(applyTarget)}
        finding={applyTarget}
        refs={refs}
        submitting={submitting}
        onConfirm={() => {
          if (applyTarget) void applyFinding(applyTarget);
        }}
        onCancel={() => setApplyTarget(null)}
      />

      <ConfirmDialog
        isOpen={Boolean(rejectTarget)}
        title="Reject finding"
        description="Records that this finding is incorrect. The component and the underlying data are left unchanged."
        confirmText="Reject finding"
        variant="destructive"
        loading={Boolean(
          rejectTarget ? actionInProgress[rejectTarget.id] : false,
        )}
        onConfirm={() => {
          if (rejectTarget) void recordCardDecision(rejectTarget, "REJECTED");
        }}
        onCancel={() => setRejectTarget(null)}
      />
    </>
  );
}
