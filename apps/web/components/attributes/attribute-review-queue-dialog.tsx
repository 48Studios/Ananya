"use client";

import * as React from "react";
import {
  Sparkles,
  FolderTree,
  Copy,
  ListOrdered,
  AlertTriangle,
  HelpCircle,
  Check,
  X,
  Search,
  Filter,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sliders,
  Layers,
  ArrowRight,
  Info,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellCancelButton,
} from "@/components/ui/dialog-shell";
import { StatusBadge } from "@/components/ui/status-badge";
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
  ATTRIBUTE_ACCEPT_AND_APPLY_LABEL,
  ATTRIBUTE_DECISION_COPY,
  ATTRIBUTE_QUEUE_TABS,
  ATTRIBUTE_WRITE_PERMISSION,
  attributeAcceptAndApplyTitle,
  attributeAcceptNotice,
  attributeApplyAction,
  attributeApplyActionTitle,
  attributeApplyConfirmation,
  attributeApplyConflictMessage,
  attributeApplyLabel,
  attributeApplySuccessMessage,
  attributeApplyUnavailableReason,
  attributeAppliedSummary,
  attributeApplicationLabel,
  attributeAuditConflictMessage,
  attributeAuditUnavailableReason,
  attributeDecisionConflictMessage,
  attributeIssueTypeLabel,
  attributeReviewReadOnlyNotice,
  attributeStatusBadge,
  attributeStatusLabel,
  buildAttributeTabCounts,
  canAcceptAndApplyAttributeFinding,
  canApplyAttributeFinding,
  canDecideAttributeFinding,
  confidenceBadgeStatus,
  deriveAttributeReviewPermissions,
  findingHeadline,
  findingMatchesTab,
  findingSubjectLabels,
  isAttributeFindingApplied,
  isExpectationForUndefinedAttribute,
  producerUsageEvidence,
  statusFilterAfterApply,
  suggestedCanonicalCode,
  summarizeAttributeAudit,
  tabIssueTypeFilter,
  type AttributeQueueTabId,
} from "@/lib/attribute-review-queue";
import {
  attributeReviewQueueApi,
  buildAttributeApplyPayload,
  buildAttributeDecisionPayload,
  MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
  type AttributeApplyAction,
  type AttributeReviewDecision,
  type AttributeReviewFindingDto,
  type AttributeReviewQueuePageDto,
} from "@/lib/api/attribute-review-queue-api";

/**
 * Attribute Intelligence Review Queue.
 *
 * The persisted review workflow for attribute-library findings. Opening the
 * dialog reads stored findings; it does NOT run the intelligence producer. Only
 * "Run Library Audit" does that, and a decision records the review outcome without
 * changing any attribute data.
 *
 * A finding whose family has an implemented mutation is offered as one act —
 * "Accept & Apply" — which records the approval and then changes the library, in
 * that order and only after the reviewer confirms it. Findings with no implemented
 * mutation keep a decision-only "Accept", because there is nothing to apply.
 *
 * This replaced the previous implementation, which recomputed the whole library
 * audit on every open, regenerated unstable ids (`audit-1`, `audit-2`, ...), and
 * labelled its primary action "Accept Binding" while the handler created a
 * definition and a binding. The queue is now a true review surface: stable finding
 * ids, a real lifecycle, server-side filtering, and no implicit mutation.
 *
 * Visual structure (dialog shell, tabs, filter card, finding card, evidence
 * accordion, empty state) is intentionally unchanged from the previous version.
 */

/** Sentinel for "no filter applied", matching the Component queue's filters. */
const ALL_FILTER_VALUE = "ALL";

/**
 * Status filter options.
 *
 * `PENDING` is the default because the queue is a work list: the reviewer opens it
 * to see what needs a decision. The tab counts still show the true totals for every
 * status, so nothing is hidden.
 */
const STATUS_FILTER_OPTIONS = [
  { value: "PENDING", label: "Needs review" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DISMISSED", label: "Dismissed" },
  { value: "STALE", label: "Stale" },
  { value: "PENDING,STALE", label: "Needs review + stale" },
] as const;

const CONFIDENCE_FILTER_OPTIONS = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

/**
 * The icon on the apply button, per action.
 *
 * Action-specific for the same reason the label is: a removal must not carry the
 * icon of an addition, and a creation must not be shown as either. Before Pass 7
 * this was a two-way ternary, which would have drawn the removal icon on a Create
 * button.
 */
function AttributeApplyIcon({ action }: { action: AttributeApplyAction }) {
  if (action === "CREATE_DEFINITION") return <Plus className="size-3" />;
  if (action === "ADD_BINDING") return <FolderTree className="size-3" />;
  return <ShieldAlert className="size-3" />;
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
  const { hasPermission } = useAuth();
  const permissions = deriveAttributeReviewPermissions(
    hasPermission(ATTRIBUTE_WRITE_PERMISSION),
  );
  const auditReason = attributeAuditUnavailableReason(permissions.canAudit);

  const [page, setPage] = React.useState<AttributeReviewQueuePageDto | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const [auditing, setAuditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const [tab, setTab] = React.useState<AttributeQueueTabId>("ALL");
  const [statusFilter, setStatusFilter] = React.useState<string>("ALL");
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

  /**
   * The finding awaiting apply confirmation, if any.
   *
   * Applying is the one path in this dialog that changes the attribute library, so
   * it is always a two-step act: choose the action, then confirm it. Holding the
   * pending finding (rather than a boolean) means the confirmation is rendered from
   * the same finding the reviewer saw.
   */
  const [pendingApply, setPendingApply] = React.useState<{
    finding: AttributeReviewFindingDto;
    action: AttributeApplyAction;
    /**
     * Whether this act still has to record the review decision. True for the
     * combined "Accept & Apply" control on a pending finding; false when the
     * finding was accepted earlier and only the library change is left.
     */
    acceptFirst: boolean;
  } | null>(null);
  const [applying, setApplying] = React.useState(false);

  /**
   * Loads the persisted findings for the current filters.
   *
   * Every filter and the sort are applied by the server, so the dialog never
   * derives counts from the rows it happens to have loaded. One request returns
   * the whole filtered list — the list stays a plain scroll region with no paging,
   * matching the Component queue — and the backend's page-size ceiling is the only
   * bound on how many findings can be shown at once.
   */
  const loadQueue = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await attributeReviewQueueApi.listFindings({
        status:
          statusFilter && statusFilter !== ALL_FILTER_VALUE
            ? statusFilter
            : undefined,
        issueType: tabIssueTypeFilter(tab),
        confidenceLevel:
          confidenceFilter && confidenceFilter !== ALL_FILTER_VALUE
            ? (confidenceFilter as "HIGH" | "MEDIUM" | "LOW")
            : undefined,
        search: search.trim() || undefined,
        page: 1,
        pageSize: MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
        sortBy: "createdAt",
        sortDirection: "desc",
      });
      setPage(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load the attribute review queue.",
      );
      setPage(null);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, confidenceFilter, search, tab]);

  React.useEffect(() => {
    if (isOpen) {
      void loadQueue();
      setStatusMessage(null);
    }
  }, [isOpen, loadQueue]);

  // Debounced server-side search, so typing does not fire a request per keystroke.
  React.useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const items = React.useMemo(() => page?.items ?? [], [page?.items]);
  const tabCounts = React.useMemo(
    () => buildAttributeTabCounts(page?.counts ?? null),
    [page?.counts],
  );

  const filtersActive = Boolean(
    search.trim() ||
      (confidenceFilter && confidenceFilter !== ALL_FILTER_VALUE) ||
      (statusFilter && statusFilter !== "PENDING") ||
      tab !== "ALL",
  );

  const clearFilters = () => {
    setStatusFilter("PENDING");
    setConfidenceFilter(ALL_FILTER_VALUE);
    setSearchInput("");
    setTab("ALL");
  };

  const toggleWhy = (findingId: string) => {
    setExpandedWhy((prev) => ({ ...prev, [findingId]: !prev[findingId] }));
  };

  /**
   * Runs the existing audit and persists its findings.
   *
   * The only action here that invokes intelligence, and it requires the
   * attribute-write permission. Findings are re-read from the database afterwards,
   * so the list reflects what was persisted rather than what the response claimed.
   */
  const handleRunAudit = async () => {
    setAuditing(true);
    setStatusMessage(null);
    try {
      const result = await attributeReviewQueueApi.runAudit();
      setStatusMessage(summarizeAttributeAudit(result));
      await loadQueue();
      onActionComplete?.();
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      setStatusMessage(
        (typeof statusCode === "number"
          ? attributeAuditConflictMessage(statusCode)
          : null) ??
          (err instanceof Error
            ? err.message
            : "Failed to run the attribute library audit."),
      );
    } finally {
      setAuditing(false);
    }
  };

  /**
   * Records a review decision against a persisted finding.
   *
   * A decision only: nothing in the attribute library is created, changed or
   * removed. The finding's fingerprint travels with the request, so a decision
   * taken against a revision that has since changed is refused rather than
   * silently applied to newer state.
   */
  const recordDecision = async (
    finding: AttributeReviewFindingDto,
    decision: AttributeReviewDecision,
  ) => {
    if (!permissions.canDecide) return;

    setActionInProgress((prev) => ({ ...prev, [finding.id]: true }));
    setStatusMessage(null);
    try {
      await attributeReviewQueueApi.recordDecision(
        finding.id,
        buildAttributeDecisionPayload(finding, decision),
      );
      setStatusMessage(
        `${ATTRIBUTE_DECISION_COPY[decision].summary} — "${findingHeadline(finding)}"`,
      );
      await loadQueue();
      onActionComplete?.();
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      setStatusMessage(
        (typeof statusCode === "number"
          ? attributeDecisionConflictMessage(
              statusCode,
              err instanceof Error ? err.message : "",
            )
          : null) ??
          (err instanceof Error
            ? err.message
            : "Failed to record the review decision."),
      );
      // A conflict means the stored finding moved, so re-read rather than leaving
      // the card showing a status nobody can act on any more.
      if (statusCode === 409 || statusCode === 404) {
        await loadQueue();
      }
    } finally {
      setActionInProgress((prev) => ({ ...prev, [finding.id]: false }));
    }
  };

  /**
   * Applies a finding to the attribute library, recording the approval first when
   * the reviewer used the combined control.
   *
   * The only mutation this dialog can perform, and it is deliberately explicit: the
   * library is never changed without a recorded approval, so a pending finding is
   * approved and applied as two ordered writes — decision first, then apply — which
   * is also exactly what the API requires. An already-accepted finding skips
   * straight to the apply. The backend re-checks the finding's expected state inside
   * its transaction, so a refusal here (409) means the library moved and the finding
   * was left untouched.
   *
   * On success the queue is re-read rather than patched in memory, so the row and
   * the counts come from the database, and the view moves off the "needs review"
   * filter because an applied finding is no longer awaiting review.
   */
  const confirmApply = async () => {
    if (!pendingApply) return;
    const { finding, action, acceptFirst } = pendingApply;

    setApplying(true);
    setStatusMessage(null);
    /**
     * Which half of the act is in flight, so a refusal is explained in the terms of
     * the step that was refused, and so a failure after the approval was written is
     * known to have moved the finding.
     */
    let step: "DECISION" | "APPLY" = acceptFirst ? "DECISION" : "APPLY";
    try {
      if (acceptFirst) {
        await attributeReviewQueueApi.recordDecision(
          finding.id,
          buildAttributeDecisionPayload(finding, "ACCEPTED"),
        );
        step = "APPLY";
      }
      const result = await attributeReviewQueueApi.applyFinding(
        finding.id,
        buildAttributeApplyPayload(finding, action),
      );
      setPendingApply(null);
      setStatusMessage(attributeApplySuccessMessage(result));
      setStatusFilter((current) => statusFilterAfterApply(current));
      await loadQueue();
      onActionComplete?.();
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      const approvalRecorded = acceptFirst && step === "APPLY";
      setPendingApply(null);
      setStatusMessage(
        (typeof statusCode === "number"
          ? step === "DECISION"
            ? attributeDecisionConflictMessage(
                statusCode,
                err instanceof Error ? err.message : "",
              )
            : attributeApplyConflictMessage(statusCode, err)
          : null) ??
          (err instanceof Error
            ? err.message
            : "Failed to apply the finding."),
      );
      // A refusal means the stored finding or its target moved, so re-read instead
      // of leaving the card offering an action that will fail again — and always
      // re-read once the approval has been recorded, because the finding is ACCEPTED
      // from that point on and only the apply-only control may be offered.
      if (statusCode === 409 || statusCode === 404 || approvalRecorded) {
        await loadQueue();
      }
    } finally {
      setApplying(false);
    }
  };

  /**
   * Content for the pending apply confirmation.
   *
   * Derived from the pending finding so the confirmation names the same attribute
   * and category the reviewer is looking at; null when nothing is pending, which
   * is what keeps the confirmation dialog from rendering.
   */
  const applyConfirmation = React.useMemo(
    () =>
      pendingApply
        ? attributeApplyConfirmation({
            finding: pendingApply.finding,
            action: pendingApply.action,
            acceptFirst: pendingApply.acceptFirst,
          })
        : null,
    [pendingApply],
  );

  return (
    <>
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Attribute Intelligence Review Queue"
      description="Supervised AI findings for the attribute library"
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
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={auditing || !permissions.canAudit}
            onClick={() => void handleRunAudit()}
            title={
              auditReason ??
              "Run the attribute library analysis and persist any new findings (no attribute data is modified)"
            }
            className="h-8 gap-1.5 text-xs"
          >
            {auditing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sliders className="size-3.5" />
            )}
            Run Library Audit
          </Button>
        </>
      }
    >
      <DialogShellBody scrollable={false}>
        {/* Read-only notice for users without the write permission. */}
        {permissions.isReadOnly && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{attributeReviewReadOnlyNotice()}</span>
          </div>
        )}

        {/* What each kind of action records, and what it changes. */}
        <p className="shrink-0 text-[11px] text-muted-foreground">
          Decisions record a review outcome only. Accept &amp; Apply does both: it
          records the decision and then changes the attribute library.
        </p>

        {statusMessage && (
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-foreground">
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

        {error && (
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-foreground">
            <span>{error}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => void loadQueue()}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1">
          {ATTRIBUTE_QUEUE_TABS.map((definition) => (
            <button
              key={definition.id}
              type="button"
              onClick={() => setTab(definition.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                tab === definition.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {definition.label} ({tabCounts[definition.id]})
            </button>
          ))}
        </div>

        {/* Filters: search on its own row, controls beneath. */}
        <div className="shrink-0 space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search findings by title or description..."
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
              value={confidenceFilter}
              onValueChange={(value) => {
                setConfidenceFilter(value ?? ALL_FILTER_VALUE);
              }}
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
            {filtersActive && (
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
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span>Loading persisted findings...</span>
          </div>
        ) : items.length > 0 ? (
          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card shadow-2xs">
            {items.map((finding) => {
              const isWhyExpanded = Boolean(expandedWhy[finding.id]);
              const inProgress = Boolean(actionInProgress[finding.id]);

              const isBinding = findingMatchesTab(finding, "BINDINGS");
              const isDuplicate = findingMatchesTab(finding, "DUPLICATES");
              const isSuspicious = findingMatchesTab(finding, "SUSPICIOUS");
              const isUnused = findingMatchesTab(finding, "UNUSED");
              const isEnum = findingMatchesTab(finding, "ENUMS");

              const canAccept = canDecideAttributeFinding(finding, "ACCEPTED");
              const canReject = canDecideAttributeFinding(finding, "REJECTED");
              const canDismiss = canDecideAttributeFinding(finding, "DISMISSED");
              const attributeSubjectId = finding.attributeDefinitionId;
              /**
               * Names rather than ids for every subject the row reports.
               *
               * A reviewer recognises "Package / Case"; a uuid tells them nothing,
               * and the name is already persisted with the finding.
               */
              const subjectLabels = findingSubjectLabels(finding);
              const usage = producerUsageEvidence(finding);
              const expectationWithoutDefinition =
                isExpectationForUndefinedAttribute(finding);

              /**
               * Apply affordance.
               *
               * `applyAction` is null for the review-only families, which is what
               * keeps the UI honest: a binding change is offered only where one is
               * implemented, and no generic "Apply" is ever rendered.
               */
              const applyAction = attributeApplyAction(finding);
              const applied = isAttributeFindingApplied(finding);
              /**
               * The combined control.
               *
               * A pending finding whose family has an implemented mutation is
               * approved and carried out as one act, which is what the Component
               * queue's primary card action does. Nothing about the API's rule
               * changes: the approval is recorded first and the library second,
               * through this dialog's confirmed apply path.
               */
              const showAcceptAndApply = canAcceptAndApplyAttributeFinding(
                finding,
                permissions.canApply,
              );
              const showApplyButton =
                !showAcceptAndApply &&
                applyAction !== null &&
                canApplyAttributeFinding(finding, permissions.canApply);
              const applyReason =
                applyAction === null ||
                showAcceptAndApply ||
                showApplyButton ||
                applied
                  ? null
                  : attributeApplyUnavailableReason(
                      finding,
                      permissions.canApply,
                    );
              return (
                <div
                  key={finding.id}
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
                          status={attributeStatusBadge(finding.status)}
                          label={attributeStatusLabel(
                            finding.status,
                          ).toUpperCase()}
                        />

                        {/*
                          Application state, reported next to the review status
                          because the two are separate facts: an ACCEPTED finding
                          may or may not have been applied yet.
                        */}
                        {applied && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
                            <Check className="size-3" /> APPLIED
                          </span>
                        )}

                        {/*
                          Says plainly that no change is offered for this family,
                          rather than leaving the absence of an apply control to be
                          guessed at.
                        */}
                        {applyAction === null && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border font-medium">
                            REVIEW ONLY
                          </span>
                        )}

                        {finding.confidenceLevel && (
                          <StatusBadge
                            status={confidenceBadgeStatus(
                              finding.confidenceLevel,
                            )}
                            label={`${finding.confidenceLevel} CONFIDENCE`}
                          />
                        )}
                      </div>

                      {/* Clear, Bold Action Title */}
                      <h4 className="text-sm font-semibold text-foreground tracking-tight">
                        {findingHeadline(finding)}
                      </h4>

                      {/* Human-readable Reason / Description */}
                      {finding.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {finding.description}
                        </p>
                      )}

                      {/* Reviewer outcome, when a decision exists */}
                      {finding.reviewedAt && (
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <History className="size-3 shrink-0" />
                          <span>
                            {attributeStatusLabel(finding.status)}
                            {finding.reviewerEmail
                              ? ` by ${finding.reviewerEmail}`
                              : ""}
                            {finding.decisionNotes
                              ? ` — ${finding.decisionNotes}`
                              : ""}
                          </span>
                        </p>
                      )}

                      {/*
                        What was applied, and when. Rendered only for applied
                        findings; "Accepted" above plus "Applied" here is the
                        reviewer's proof that the library changed.
                      */}
                      {applied && (
                        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                          <Check className="size-3 shrink-0" />
                          <span>
                            {attributeAppliedSummary(finding) ??
                              "Applied to the attribute library"}
                          </span>
                        </p>
                      )}

                      {/*
                        Acceptance and application as two separate facts.

                        Shown together so the pair is legible at a glance —
                        "Accepted · Not applied" is a finding waiting for someone to
                        carry it out, "Accepted · Applied" is one that is done.
                      */}
                      {finding.reviewedAt && (
                        <p className="text-[11px] text-muted-foreground">
                          {attributeStatusLabel(finding.status)}
                          {" · "}
                          <span
                            className={
                              applied
                                ? "text-emerald-600 dark:text-emerald-400"
                                : undefined
                            }
                          >
                            {attributeApplicationLabel(finding)}
                          </span>
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0 pt-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => toggleWhy(finding.id)}
                        className={`text-muted-foreground hover:text-foreground ${
                          isWhyExpanded ? "bg-muted text-foreground" : ""
                        }`}
                        title="View reasoning evidence"
                      >
                        <HelpCircle className="size-3.5" />
                      </Button>

                      {attributeSubjectId && onEditAttribute && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            onClose();
                            onEditAttribute(attributeSubjectId);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          title="Open attribute definition"
                        >
                          <Edit3 className="size-3.5" />
                        </Button>
                      )}

                      {permissions.canDecide && canDismiss && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={inProgress}
                          onClick={() =>
                            void recordDecision(finding, "DISMISSED")
                          }
                          className="text-muted-foreground hover:text-foreground"
                          title={ATTRIBUTE_DECISION_COPY.DISMISSED.summary}
                        >
                          <X className="size-3.5" />
                        </Button>
                      )}

                      {permissions.canDecide && canReject && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={inProgress}
                          onClick={() =>
                            void recordDecision(finding, "REJECTED")
                          }
                          className="h-7 text-xs px-2.5 border-border hover:bg-muted gap-1 font-medium"
                          title={ATTRIBUTE_DECISION_COPY.REJECTED.summary}
                        >
                          Reject
                        </Button>
                      )}

                      {/*
                        The combined control.

                        A pending finding whose family has an implemented mutation
                        is approved and carried out in one act, mirroring the
                        Component queue's primary action. The approval is still an
                        explicit write — it is recorded before the library is
                        touched, which is the order the API requires — so the single
                        act is what the reviewer chose, not an implicit acceptance.
                      */}
                      {permissions.canDecide &&
                        showAcceptAndApply &&
                        applyAction && (
                          <Button
                            type="button"
                            size="xs"
                            disabled={inProgress || applying}
                            onClick={() =>
                              setPendingApply({
                                finding,
                                action: applyAction,
                                acceptFirst: true,
                              })
                            }
                            className="h-7 text-xs px-2.5 bg-primary text-primary-foreground hover:bg-primary/90 gap-1 font-medium"
                            title={attributeAcceptAndApplyTitle(applyAction)}
                          >
                            {applying &&
                            pendingApply?.finding.id === finding.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Sparkles className="size-3" />
                            )}
                            {ATTRIBUTE_ACCEPT_AND_APPLY_LABEL}
                          </Button>
                        )}

                      {/*
                        Decision-only Accept, kept for the families with no
                        implemented mutation: there is nothing to apply, so the
                        finding is closed out by a decision that changes nothing.
                      */}
                      {permissions.canDecide && canAccept && !showAcceptAndApply && (
                        <Button
                          type="button"
                          size="xs"
                          disabled={inProgress}
                          onClick={() =>
                            void recordDecision(finding, "ACCEPTED")
                          }
                          className="h-7 text-xs px-2.5 bg-primary text-primary-foreground hover:bg-primary/90 gap-1 font-medium"
                          title={attributeAcceptNotice()}
                        >
                          {inProgress ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3" />
                          )}
                          Accept
                        </Button>
                      )}

                      {/*
                        The apply control.

                        Labelled with the action it performs rather than a generic
                        "Apply", and shown only for an ACCEPTED, unapplied finding
                        whose family has an implemented mutation. When it is hidden
                        for a reason other than the family, that reason is in the
                        tooltip via `applyReason` on the row's badges.
                      */}
                      {showApplyButton && applyAction && (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={inProgress || applying}
                          onClick={() =>
                            setPendingApply({
                              finding,
                              action: applyAction,
                              acceptFirst: false,
                            })
                          }
                          className="h-7 text-xs px-2.5 border-primary/40 text-primary hover:bg-primary/10 gap-1 font-medium"
                          title={attributeApplyActionTitle(applyAction)}
                        >
                          {applying && pendingApply?.finding.id === finding.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <AttributeApplyIcon action={applyAction} />
                          )}
                          {attributeApplyLabel(applyAction)}
                        </Button>
                      )}

                      {/*
                        Why no apply control is available, for a user who could
                        otherwise apply. Rendered as text so it is reachable by
                        keyboard and screen readers, unlike a bare tooltip.
                      */}
                      {applyReason && (
                        <span className="text-[10px] text-muted-foreground max-w-44 text-right leading-tight">
                          {applyReason}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Relevant Data Grid / Context Details */}
                  <div className="flex justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/70 text-xs">
                    {/* Subject Column */}
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <Sliders className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-foreground/80">
                        {expectationWithoutDefinition
                          ? "Expected Attribute:"
                          : "Attribute:"}
                      </span>
                      <span className="font-semibold text-foreground truncate">
                        {expectationWithoutDefinition
                          ? (suggestedCanonicalCode(finding) ?? "—")
                          : (subjectLabels.attribute ?? "—")}
                      </span>
                      {expectationWithoutDefinition && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border font-medium">
                          Not defined yet
                        </span>
                      )}
                    </div>

                    {/* Relationship / usage details */}
                    {isDuplicate && finding.relatedAttributeDefinitionId ? (
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-foreground/80">
                          Matches:
                        </span>
                        <span className="font-semibold text-foreground truncate">
                          {subjectLabels.relatedAttribute ??
                            finding.relatedAttributeDefinitionId}
                        </span>
                      </div>
                    ) : finding.categoryId ? (
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium text-foreground/80">
                          {isSuspicious ? "Bound Category:" : "Target Category:"}
                        </span>
                        <span className="font-semibold text-foreground truncate">
                          {subjectLabels.category ?? finding.categoryId}
                        </span>
                      </div>
                    ) : isUnused ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Layers className="size-3.5 shrink-0" />
                        <span className="text-[11px]">
                          {usage.componentValueCount ?? 0} component values •{" "}
                          {usage.bindingCount ?? 0} category bindings
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Info className="size-3.5 shrink-0" />
                        <span className="text-[11px]">
                          {attributeIssueTypeLabel(finding.issueType)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Why Evidence Accordion */}
                  {isWhyExpanded && (
                    <div className="pt-2 border-t border-border/60 text-[11px] space-y-1.5 animate-in fade-in-50 duration-150">
                      <span className="font-semibold text-foreground text-[10px] uppercase tracking-wider block">
                        Reasoning Evidence &amp; Grounding:
                      </span>
                      {finding.evidence && finding.evidence.length > 0 ? (
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          {finding.evidence.map((ev, idx) => (
                            <li key={idx} className="leading-normal">
                              <span className="text-foreground">
                                {String(ev.description ?? "")}
                              </span>
                              {ev.source && (
                                <span className="ml-1.5 text-[9px] font-mono text-muted-foreground/80 px-1 py-0.2 rounded bg-muted border border-border/50">
                                  {String(ev.source)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          {finding.description ||
                            "Determined via attribute taxonomy and category heuristics."}
                        </p>
                      )}
                      <p className="text-[10px] font-mono text-muted-foreground/80">
                        source: {finding.source}
                        {finding.intelligenceVersion
                          ? ` • ${finding.intelligenceVersion}`
                          : ""}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center space-y-2 rounded-xl border border-dashed border-border bg-muted/5 py-12 text-center">
            <Sparkles className="size-8 text-muted-foreground/30 mx-auto" />
            <p className="text-xs font-semibold text-foreground">
              {error
                ? "The queue could not be loaded"
                : filtersActive
                  ? "No findings match these filters"
                  : "Review queue is clear"}
            </p>
            <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
              {error
                ? "Retry the request with the refresh action above."
                : filtersActive
                  ? "Adjust or clear the search, status, confidence, or tab filters to see other findings."
                  : "No findings are awaiting review. Run a library audit to scan the attribute library for new findings."}
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

    {/*
      Apply confirmation.

      Structured like the workspace's ConfirmDialog, with the finding's subject
      spelled out: the reviewer confirms a specific binding change between a named
      attribute and a named category, not an abstract "apply". The confirm button
      carries the same action-specific label as the button that opened it.
    */}
    {applyConfirmation && (
      <DialogShell
        open
        onOpenChange={(open) => {
          if (!open && !applying) setPendingApply(null);
        }}
        title={applyConfirmation.title}
        description={applyConfirmation.description}
        size="sm"
        closeDisabled={applying}
      >
        <DialogShellBody>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div
                className={`rounded-full p-2 ${
                  applyConfirmation.destructive
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
                }`}
              >
                <AlertTriangle className="size-5" />
              </div>
              <p className="pt-1 text-sm text-muted-foreground">
                {applyConfirmation.description}
              </p>
            </div>
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-xs">
              {applyConfirmation.subject.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium text-foreground text-right">
                    {row.value}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-1.5">
                <span className="text-muted-foreground">Action</span>
                <span className="font-medium text-foreground">
                  {applyConfirmation.confirmLabel}
                </span>
              </div>
            </div>
            {/*
              Scope of the change, stated per action: a creation is the one
              action here that adds a definition, so the generic "nothing is
              created" sentence would be false for it.
            */}
            <p className="text-[11px] text-muted-foreground">
              {pendingApply?.action === "CREATE_DEFINITION"
                ? "This adds one new attribute definition to the library and binds it to the category. No component value is changed."
                : "This updates the attribute library. No attribute definition, category, or component value is created or deleted."}
            </p>
          </div>
        </DialogShellBody>
        <DialogShellFooter>
          <DialogShellCancelButton disabled={applying}>
            Cancel
          </DialogShellCancelButton>
          <Button
            variant={applyConfirmation.destructive ? "destructive" : "default"}
            size="sm"
            onClick={() => void confirmApply()}
            disabled={applying}
          >
            {applying && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            {applyConfirmation.confirmLabel}
          </Button>
        </DialogShellFooter>
      </DialogShell>
    )}
    </>
  );
}
