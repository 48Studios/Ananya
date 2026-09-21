"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  PencilLine,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellFooter,
  DialogShellCancelButton,
} from "@/components/ui/dialog-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  componentReviewQueueApi,
  buildDecisionPayload,
  type ComponentReviewDecision,
  type ComponentReviewFindingDto,
  type ConsolidationResultDto,
} from "@/lib/api/component-review-queue-api";
import { ComponentReviewApplyDialog } from "./component-review-apply-dialog";
import { DuplicateInvestigation } from "./component-review-duplicate-investigation";
import { useAuth } from "@/lib/auth/auth-context";
import {
  APPLY_COPY,
  COMPONENT_WRITE_PERMISSION,
  applyConflictMessage,
  applyConsolidationToFinding,
  applySuccessMessage,
  applyUnavailableReason,
  actionConsequenceNote,
  canApplyFindingAsUser,
  consolidationSuccessMessage,
  DECISION_COPY,
  deriveReviewPermissions,
  duplicateDecisionCopy,
  duplicateDecisionNotesPlaceholder,
  extractApplyConflictReason,
  reviewReadOnlyNotice,
  buildIdentityRows,
  componentHref,
  confidenceBadgeStatus,
  decidableActions,
  describeDuplicateRelationship,
  formatConfidencePercent,
  formatEvidenceWeight,
  formatValueEntries,
  isDuplicateFinding,
  issueCategoryLabel,
  issueTypeLabel,
  normalizeEvidence,
  staleExplanation,
  statusLabel,
  STATUS_BADGE,
  type ReviewReferenceMaps,
  type ValueEntry,
} from "@/lib/component-review-queue";

interface ComponentReviewFindingDialogProps {
  /** Rendered when non-null. */
  findingId: string | null;
  /** Row data for instant paint while the detail request is in flight. */
  initialFinding?: ComponentReviewFindingDto | null;
  refs?: ReviewReferenceMaps;
  onClose: () => void;
  /** Called after a successful decision with the updated finding. */
  onDecided?: (finding: ComponentReviewFindingDto) => void;
  /** Called when the finding changed underneath the reviewer (HTTP 409). */
  onConflict?: (message: string) => void;
  /**
   * Called after a successful consolidation, carrying the backend's result.
   *
   * Consolidation is committed inside its own transaction and marks the finding
   * ACCEPTED there, so the result — not a local guess — is what this dialog and
   * the queue reconcile from.
   */
  onConsolidated?: (result: ConsolidationResultDto) => void;
}

function ValueBlock({
  title,
  entries,
  emptyLabel,
}: {
  title: string;
  entries: ValueEntry[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <dl className="rounded-lg border border-border bg-muted/30 divide-y divide-border/70">
          {entries.map((entry) => (
            <div
              key={entry.label}
              className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[minmax(9rem,max-content)_minmax(0,1fr)] sm:gap-3"
            >
              <dt className="text-[11px] font-medium text-muted-foreground">
                {entry.label}
              </dt>
              {/*
                `minmax(0,1fr)` rather than a bare `1fr`: a bare track cannot
                shrink below its content's min-content width, so a long unbreakable
                value (a document hash, an id) pushed the row out of the card. The
                label column is capped at its own content so it cannot take the
                space the value needs.
              */}
              <dd className="text-xs font-medium text-foreground break-words">
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * Component Intelligence finding detail.
 *
 * Read-only with respect to component data: it renders the persisted finding
 * and records a review decision. It never edits manufacturer, category, MPN,
 * SKU, or attributes, and offers no merge or delete action.
 */
export function ComponentReviewFindingDialog({
  findingId,
  initialFinding,
  refs = {},
  onClose,
  onDecided,
  onConflict,
  onConsolidated,
}: ComponentReviewFindingDialogProps) {
  const [finding, setFinding] =
    React.useState<ComponentReviewFindingDto | null>(initialFinding ?? null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] =
    React.useState<ComponentReviewDecision | null>(null);
  const [decisionNotes, setDecisionNotes] = React.useState("");
  const [pendingConfirm, setPendingConfirm] =
    React.useState<ComponentReviewDecision | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = React.useState(false);
  const [applying, setApplying] = React.useState(false);

  const submitApply = async (decisionNotes: string) => {
    if (!finding) return;
    setApplying(true);
    setStatusMessage(null);
    try {
      const result = await componentReviewQueueApi.applyFinding(finding.id, {
        expectedFingerprint: finding.fingerprint,
        decisionNotes: decisionNotes.trim() || undefined,
      });
      setApplyDialogOpen(false);
      setStatusMessage(applySuccessMessage(result));
      // Re-read so the dialog shows the accepted state and applied value.
      if (findingId) void loadFinding(findingId);
      onDecided?.({
        ...finding,
        status: "ACCEPTED",
        reviewedAt: result.appliedAt,
        decisionNotes: decisionNotes.trim() || null,
        component: finding.component
          ? {
              ...finding.component,
              manufacturerPartNumber: result.component.manufacturerPartNumber,
              manufacturerId: result.component.manufacturerId,
              categoryId: result.component.categoryId,
            }
          : null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to apply the suggestion.";
      const reason = extractApplyConflictReason(
        (err as { details?: unknown })?.details,
      );
      setApplyDialogOpen(false);
      setStatusMessage(applyConflictMessage(reason, message));
      // Never retry automatically; resynchronise with the server instead.
      if (findingId) void loadFinding(findingId);
      onConflict?.(message);
    } finally {
      setApplying(false);
    }
  };

  const loadFinding = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await componentReviewQueueApi.getFinding(id);
      setFinding(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load review finding.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!findingId) {
      setFinding(null);
      setDecisionNotes("");
      setStatusMessage(null);
      setError(null);
      setPendingConfirm(null);
      return;
    }
    setFinding(initialFinding ?? null);
    setDecisionNotes("");
    setStatusMessage(null);
    void loadFinding(findingId);
  }, [findingId, initialFinding, loadFinding]);

  const submitDecision = async (decision: ComponentReviewDecision) => {
    if (!finding) return;
    setSubmitting(decision);
    setStatusMessage(null);
    try {
      const updated = await componentReviewQueueApi.recordDecision(
        finding.id,
        buildDecisionPayload(finding, decision, decisionNotes),
      );
      setFinding(updated);
      setDecisionNotes("");
      setStatusMessage(
        decision === "ACCEPTED"
          ? finding.issueCategory === "DUPLICATE"
            ? "Duplicate acknowledged. No component was modified — use Review and consolidate below to merge the two records."
            : "Finding accepted. The component itself was not modified."
          : decision === "REJECTED"
            ? "Finding rejected. The component was not modified."
            : "Finding dismissed. The component was not modified.",
      );
      onDecided?.(updated);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to record the decision.";
      setStatusMessage(message);
      onConflict?.(message);
      if (findingId) void loadFinding(findingId);
    } finally {
      setSubmitting(null);
      setPendingConfirm(null);
    }
  };

  /**
   * Reconciliation after a consolidation this dialog initiated.
   *
   * Consolidation commits the finding as ACCEPTED inside its own transaction,
   * so `result` is a confirmed statement rather than a prediction. Applying it
   * here is therefore not an optimistic update: the change is already durable by
   * the time this runs, and the alternative — waiting for a round trip — leaves
   * the card claiming a duplicate still needs attention.
   *
   * The dialog's own snapshot is reconciled from the result, then re-read so
   * fields the result does not carry (fingerprint, updatedAt) match the server.
   * That re-read is scoped to this one finding; no list, page, or application
   * state is refetched here.
   */
  const handleConsolidated = (result: ConsolidationResultDto) => {
    setStatusMessage(consolidationSuccessMessage(result));
    setFinding((current) => applyConsolidationToFinding(current, result));
    if (findingId) void loadFinding(findingId);
    onConsolidated?.(result);
  };

  const actions = finding ? decidableActions(finding.status) : [];
  /**
   * The decidable actions in footer order.
   *
   * Destructive outcomes first, the primary action last — DESIGN.md's footer rule
   * ("Primary action appears last"). `decidableActions` returns them in lifecycle
   * order, which would leave two reject/dismiss buttons after the button the
   * reviewer is meant to reach for.
   */
  const footerActions = [
    ...actions.filter((decision) => decision !== "ACCEPTED"),
    ...actions.filter((decision) => decision === "ACCEPTED"),
  ];
  const stale = finding?.status === "STALE";
  // Permission-driven: every write control is hidden for read-only reviewers.
  // The API enforces the same permission independently.
  const { hasPermission } = useAuth();
  const permissions = deriveReviewPermissions(
    hasPermission(COMPONENT_WRITE_PERMISSION),
  );
  const terminal = finding
    ? actions.length === 0 || !permissions.canDecide
    : false;
  const applicable = finding
    ? canApplyFindingAsUser(finding, permissions.canApply)
    : false;
  const duplicate = finding ? isDuplicateFinding(finding) : false;
  const unavailableReason = finding
    ? applyUnavailableReason(finding, permissions.canApply)
    : null;
  const identityRows = buildIdentityRows(finding?.component ?? null, refs);
  const currentEntries = formatValueEntries(finding?.currentValue);
  const suggestedEntries = formatValueEntries(finding?.suggestedValue);
  const evidence = normalizeEvidence(finding?.evidence);
  const relationship =
    duplicate && finding ? describeDuplicateRelationship(finding) : null;
  // Duplicate decisions use duplicate-specific wording: rejection reads as
  // "Not a duplicate". Both still record the existing lifecycle decisions.
  const decisionCopyFor = (decision: ComponentReviewDecision) =>
    finding
      ? duplicateDecisionCopy(finding, decision)
      : DECISION_COPY[decision];

  return (
    <>
      <DialogShell
        open={Boolean(findingId)}
        onOpenChange={(open) => {
          if (!open && !submitting) onClose();
        }}
        title="Component Intelligence Finding"
        description="Review the detected issue, its evidence, and the suggested value. Decisions record the review outcome only; component data is never modified from this queue."
        size="lg"
        closeDisabled={Boolean(submitting)}
      >
        <DialogShellBody className="space-y-5">
          {loading && !finding ? (
            <LoadingState message="Loading finding details..." />
          ) : error && !finding ? (
            <ErrorState
              title="Error loading finding"
              message={error}
              onRetry={
                findingId ? () => void loadFinding(findingId) : undefined
              }
            />
          ) : finding ? (
            <>
              {statusMessage && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-foreground">
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

              {stale && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{staleExplanation(finding)}</span>
                </div>
              )}

              {/* Finding summary */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {issueCategoryLabel(finding.issueCategory)}
                  </span>
                  <StatusBadge
                    status={STATUS_BADGE[finding.status] ?? "DRAFT"}
                    label={statusLabel(finding.status)}
                  />
                  {finding.confidenceLevel && (
                    <StatusBadge
                      status={confidenceBadgeStatus(finding.confidenceLevel)}
                      label={`${finding.confidenceLevel} CONFIDENCE`}
                    />
                  )}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatConfidencePercent(finding.confidence)}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    {finding.title}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {finding.description}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      Issue:
                    </span>{" "}
                    {issueTypeLabel(finding.issueType)}
                    {finding.source ? (
                      <>
                        {" · "}
                        <span className="font-medium text-foreground/80">
                          Source:
                        </span>{" "}
                        <span className="font-mono">{finding.source}</span>
                      </>
                    ) : null}
                    {finding.intelligenceVersion ? (
                      <>
                        {" · "}
                        <span className="font-medium text-foreground/80">
                          Intelligence:
                        </span>{" "}
                        <span className="font-mono">
                          {finding.intelligenceVersion}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              {/* Component identity */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Component
                  </h4>
                  {finding.component && (
                    <Link href={componentHref(finding.component.id)}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3" />
                        Open component
                      </Button>
                    </Link>
                  )}
                </div>
                {identityRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    The referenced component is no longer available.
                  </p>
                ) : (
                  <dl className="rounded-lg border border-border bg-card divide-y divide-border/70">
                    {identityRows.map((row) => (
                      <div
                        key={row.label}
                        className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[minmax(9rem,max-content)_minmax(0,1fr)] sm:gap-3"
                      >
                        <dt className="text-[11px] font-medium text-muted-foreground">
                          {row.label}
                        </dt>
                        <dd
                          className={`text-xs break-words ${
                            row.mono ? "font-mono" : ""
                          } ${
                            row.value === "—"
                              ? "text-muted-foreground italic"
                              : "font-medium text-foreground"
                          }`}
                        >
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {/* Duplicate investigation */}
              {duplicate && finding && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Duplicate investigation
                    </h4>
                    {finding.relatedComponent && (
                      <Link href={componentHref(finding.relatedComponent.id)}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3" />
                          View related component
                        </Button>
                      </Link>
                    )}
                  </div>
                  {relationship && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {relationship.heading}.
                      </span>{" "}
                      {relationship.explanation}
                    </p>
                  )}
                  <DuplicateInvestigation
                    finding={finding}
                    refs={refs}
                    canDecide={
                      permissions.canDecide &&
                      !terminal &&
                      actions.includes("REJECTED")
                    }
                    onNotADuplicate={() => setPendingConfirm("REJECTED")}
                    canAnalyzeConsolidation={permissions.canApply}
                    onConsolidated={handleConsolidated}
                  />
                </div>
              )}

              {/* Current vs suggested */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ValueBlock
                  title="Current value"
                  entries={currentEntries}
                  emptyLabel="No current value recorded."
                />
                <ValueBlock
                  title="Suggested value"
                  entries={suggestedEntries}
                  emptyLabel="No suggested value for this finding."
                />
              </div>

              {/* Evidence */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3.5 text-muted-foreground" />
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Reasoning evidence
                  </h4>
                </div>
                {evidence.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No evidence was recorded for this finding.
                  </p>
                ) : (
                  <ul className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                    {evidence.map((item, index) => (
                      <li key={`${item.type}-${index}`} className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground">
                            {item.typeLabel}
                          </span>
                          {item.source && (
                            <span className="rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {item.source}
                            </span>
                          )}
                          {item.weight !== null && (
                            <span
                              className="font-mono text-[10px] text-muted-foreground"
                              title="Evidence weight"
                            >
                              weight {formatEvidenceWeight(item.weight)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Review metadata */}
              {(finding.reviewedAt ||
                finding.reviewerEmail ||
                finding.decisionNotes) && (
                <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                  <p className="font-semibold uppercase tracking-wider">
                    Review record
                  </p>
                  {finding.reviewerEmail && (
                    <p>Reviewer: {finding.reviewerEmail}</p>
                  )}
                  {finding.reviewedAt && (
                    <p>
                      Reviewed: {new Date(finding.reviewedAt).toLocaleString()}
                    </p>
                  )}
                  {finding.decisionNotes && (
                    <p>Notes: {finding.decisionNotes}</p>
                  )}
                </div>
              )}

              {/* Read-only notice for reviewers without write permission */}
              {permissions.isReadOnly && (
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                  {reviewReadOnlyNotice()}
                </p>
              )}

              {/* Decision input */}
              {!terminal && actions.length > 0 && (
                <Field>
                  <FieldLabel htmlFor="decision-notes">
                    Decision notes (optional)
                  </FieldLabel>
                  <Textarea
                    id="decision-notes"
                    rows={2}
                    value={decisionNotes}
                    onChange={(event) => setDecisionNotes(event.target.value)}
                    placeholder={
                      finding.issueCategory === "DUPLICATE"
                        ? duplicateDecisionNotesPlaceholder(finding)
                        : "Record why this finding was accepted, rejected, or dismissed."
                    }
                    className="text-xs"
                  />
                  <FieldDescription>
                    Notes are stored with the review record and AI feedback
                    telemetry for model evaluation.
                  </FieldDescription>
                </Field>
              )}

              {/* Review-only note for findings that cannot be applied */}
              {unavailableReason && !terminal && (
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
                  {unavailableReason}
                </p>
              )}

              {/*
                What the primary action does.

                Stated in the body rather than the footer, next to the other
                consequence copy, so the reviewer reads it while reading the finding
                instead of hunting for it beside the buttons.
              */}
              {!terminal && (
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  {actionConsequenceNote(applicable)}
                </p>
              )}

              {terminal && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Info className="size-3" />
                  {permissions.isReadOnly
                    ? "You have read-only access to this finding."
                    : "This finding has already been reviewed and cannot be decided again."}
                </p>
              )}
            </>
          ) : (
            <EmptyFallback />
          )}
        </DialogShellBody>

        {/*
          Actions only. The consequence of the primary action is stated in the body,
          so the footer stays a row of buttons: Close, then the destructive
          outcomes, then the primary action last (DESIGN.md).
        */}
        <DialogShellFooter>
          <DialogShellCancelButton disabled={Boolean(submitting) || applying}>
            Close
          </DialogShellCancelButton>

          {finding &&
            permissions.canDecide &&
            footerActions.map((decision) => {
              const isPrimary = decision === "ACCEPTED";
              const copy = decisionCopyFor(decision);
              // Applicable findings write to the component; everything else
              // (duplicates) keeps the review-only accept behaviour.
              const label = isPrimary
                ? applicable
                  ? APPLY_COPY.label
                  : copy.label
                : copy.label;
              const title = isPrimary
                ? applicable
                  ? APPLY_COPY.description
                  : copy.description
                : copy.description;
              const busy = Boolean(submitting) || applying;

              return (
                <Button
                  key={decision}
                  type="button"
                  size="sm"
                  variant={isPrimary ? "default" : "outline"}
                  disabled={busy}
                  title={title}
                  className={
                    isPrimary
                      ? "gap-1.5"
                      : "gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                  }
                  onClick={() => {
                    if (!isPrimary) {
                      setPendingConfirm(decision);
                    } else if (applicable) {
                      setApplyDialogOpen(true);
                    } else {
                      void submitDecision(decision);
                    }
                  }}
                >
                  {submitting === decision || (isPrimary && applying) ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : isPrimary && applicable ? (
                    <PencilLine className="size-3" />
                  ) : isPrimary ? (
                    <Check className="size-3" />
                  ) : (
                    <X className="size-3" />
                  )}
                  {label}
                  {!isPrimary && <ArrowRight className="size-3" />}
                </Button>
              );
            })}
        </DialogShellFooter>
      </DialogShell>

      <ComponentReviewApplyDialog
        isOpen={applyDialogOpen}
        finding={finding}
        refs={refs}
        submitting={applying}
        onConfirm={(notes) => void submitApply(notes)}
        onCancel={() => setApplyDialogOpen(false)}
      />

      {pendingConfirm && finding && (
        <ConfirmDialog
          isOpen
          title={decisionCopyFor(pendingConfirm).confirmTitle}
          description={decisionCopyFor(pendingConfirm).description}
          confirmText={decisionCopyFor(pendingConfirm).confirmText}
          variant={decisionCopyFor(pendingConfirm).variant}
          loading={submitting !== null}
          onConfirm={() => void submitDecision(pendingConfirm)}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </>
  );
}

function EmptyFallback() {
  return (
    <p className="py-8 text-center text-xs text-muted-foreground">
      This finding is no longer available. Refresh the queue to see the current
      state.
    </p>
  );
}
