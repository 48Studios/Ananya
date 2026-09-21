"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  FileText,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
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
import { DocumentViewer } from "@/components/ui/document-viewer";
import { componentReviewQueueApi } from "@/lib/api/component-review-queue-api";
import {
  documentsApi,
  type DocumentDto,
} from "@/lib/api/documents-api";
import type {
  ComponentDocumentationStateDto,
  DocumentEvidenceDto,
  SpecificationAggregateDto,
  UnmappedSpecificationDto,
} from "@/lib/api/documentation-intelligence-api";
import {
  STATUS_BADGE,
  applyConflictMessage,
  confidenceBadgeStatus,
  extractApplyConflictReason,
  statusLabel,
} from "@/lib/component-review-queue";
import { attributeApplySuccessMessage } from "@/lib/attribute-value-review";
import {
  SPECIFICATION_FILTERS,
  ambiguityHeading,
  applyApplicationToSpecifications,
  applyDecisionToSpecifications,
  buildSpecificationFilterCounts,
  canApplySpecification,
  canDecideSpecification,
  confidenceLevel,
  confidencePercent,
  confidenceReasons,
  describeAmbiguity,
  describeConflict,
  describeCorroboration,
  describeErpComparison,
  describeSpecificationEvidence,
  documentedValueText,
  emptySpecificationMessage,
  evidenceRoleLabel,
  filterSpecifications,
  hasPrimaryEvidence,
  sourceErpLabel,
  specificationBadge,
  specificationChipTone,
  specificationEvidenceExcerpt,
  specificationUnavailableReason,
  type SpecificationChipTone,
  type SpecificationFilterId,
} from "@/lib/specification-intelligence";

export interface ComponentSpecificationIntelligenceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Stored intelligence for the component. Loaded by the host, never here. */
  state: ComponentDocumentationStateDto | null;
  loading: boolean;
  /** A component-level analysis is in flight. */
  running: boolean;
  /** A load or run failure, owned by the host. */
  error: string | null;
  /** The outcome of the last run, owned by the host. */
  notice: string | null;
  canWrite: boolean;
  onRefresh: () => void;
  onAnalyze: () => void;
  /** Reports the specification rows after a decision or application. */
  onSpecificationsChange: (
    specifications: SpecificationAggregateDto[],
  ) => void;
  /**
   * Reports that a value was written to the component.
   *
   * Applying changes the component record, not just this dialog's rows, so the
   * host re-reads it rather than leaving the page showing the old attributes
   * until the next navigation.
   */
  onApplied: () => void;
}

/**
 * Documentation Intelligence for one component.
 *
 * Shows what every eligible document says about the component, combined: one row
 * per attribute, with the documents that state it, whether they agree, and what
 * the component already records. Conflicts and ambiguous mappings are shown as
 * states a reviewer must resolve, never resolved here.
 *
 * Review and apply reuse the existing Component Review Queue endpoints and the
 * shared presentation rules in `@/lib/specification-intelligence`, so this is a
 * second *surface* for the same workflow, not a second workflow. The modal never
 * runs the analysis on open: the host loads stored state and this only renders
 * it, so reopening existing intelligence costs nothing.
 */
export function ComponentSpecificationIntelligenceDialog({
  isOpen,
  onClose,
  state,
  loading,
  running,
  error,
  notice,
  canWrite,
  onRefresh,
  onAnalyze,
  onSpecificationsChange,
  onApplied,
}: ComponentSpecificationIntelligenceDialogProps) {
  const [filter, setFilter] = React.useState<SpecificationFilterId>("ALL");
  const [busyAttributeId, setBusyAttributeId] = React.useState<string | null>(
    null,
  );
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState<DocumentDto | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  /**
   * Which card's evidence is open, keyed by the card's own subject.
   *
   * Evidence is behind the same help button the Component queue uses, so a card
   * reads as a finding first and the grounding is one click away rather than
   * always expanded.
   */
  const [expandedWhy, setExpandedWhy] = React.useState<Record<string, boolean>>(
    {},
  );

  const toggleWhy = (key: string) => {
    setExpandedWhy((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  // Action feedback belongs to the modal, not the page: closing it should not
  // leave a stale message behind on the component record.
  React.useEffect(() => {
    if (!isOpen) {
      setActionError(null);
      setStatusMessage(null);
      setPreviewError(null);
      setPreviewing(null);
    }
  }, [isOpen]);

  /**
   * Records a reviewer decision through the existing queue endpoint.
   *
   * The response is the updated finding, so the affected row is rewritten from
   * it — no refetch and no reload.
   */
  const decide = async (
    specification: SpecificationAggregateDto,
    decision: "ACCEPTED" | "REJECTED" | "DISMISSED",
  ) => {
    const review = specification.review;
    if (!state || !review?.findingId) return;

    setBusyAttributeId(specification.attributeDefinitionId);
    setActionError(null);
    try {
      const updated = await componentReviewQueueApi.recordDecision(
        review.findingId,
        review.fingerprint
          ? { decision, expectedFingerprint: review.fingerprint }
          : { decision },
      );
      onSpecificationsChange(
        applyDecisionToSpecifications(state.specifications, updated),
      );
    } catch (err: unknown) {
      setActionError(
        err instanceof Error
          ? err.message
          : "The decision could not be recorded.",
      );
    } finally {
      setBusyAttributeId(null);
    }
  };

  /**
   * Applies an accepted specification.
   *
   * The write happens in the backend through the existing attribute use case;
   * this only calls the existing apply endpoint and reflects the result.
   */
  const applyValue = async (specification: SpecificationAggregateDto) => {
    const review = specification.review;
    if (!state || !review?.findingId || !review.fingerprint) return;

    setBusyAttributeId(specification.attributeDefinitionId);
    setActionError(null);
    try {
      const result = await componentReviewQueueApi.applyFinding(
        review.findingId,
        { expectedFingerprint: review.fingerprint },
      );

      // The apply response carries the outcome; the finding's new state is read
      // back so the row shows exactly what the backend stores.
      const finding = await componentReviewQueueApi.getFinding(review.findingId);

      onSpecificationsChange(
        applyApplicationToSpecifications(
          state.specifications,
          finding,
          result,
        ),
      );
      setStatusMessage(attributeApplySuccessMessage(result));
      onApplied();
    } catch (err: unknown) {
      setActionError(
        applyConflictMessage(
          extractApplyConflictReason(
            (err as { details?: unknown } | null)?.details,
          ),
          err instanceof Error ? err.message : undefined,
        ),
      );
    } finally {
      setBusyAttributeId(null);
    }
  };

  /** Opens the document an evidence item came from, using the existing viewer. */
  const previewDocument = async (documentId: string) => {
    setPreviewError(null);
    try {
      setPreviewing(await documentsApi.getDocument(documentId));
    } catch (err: unknown) {
      setPreviewError(
        err instanceof Error
          ? err.message
          : "The document could not be opened.",
      );
    }
  };

  const summary = state?.summary ?? null;
  const counts = state
    ? buildSpecificationFilterCounts(state.specifications, state.unmapped)
    : null;
  const visible = state
    ? filterSpecifications(state.specifications, filter)
    : [];
  const showAmbiguities = filter === "ALL" || filter === "AMBIGUOUS";
  const ambiguities = state && showAmbiguities ? state.unmapped : [];
  const nothingFound =
    state !== null &&
    state.specifications.length === 0 &&
    state.unmapped.length === 0;

  return (
    <>
      <DialogShell
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        size="lg"
        icon={<Sparkles className="size-5" />}
        title="Documentation Intelligence"
        description="Specifications found across this component's documents, with the evidence behind each one."
        headerActions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={loading || running}
              onClick={onRefresh}
            >
              <RefreshCw
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={running || loading || !canWrite}
              title={
                canWrite
                  ? undefined
                  : "Analyzing documentation persists review findings, which requires the Inventory.Update permission."
              }
              onClick={onAnalyze}
            >
              {running ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {running ? "Analyzing…" : "Analyze documents"}
            </Button>
          </>
        }
      >
        {/*
          The body does not scroll: the item list owns the scroll, exactly as the
          Component Intelligence queue does, so the dialog never shows two nested
          scrollbars and the tabs stay pinned while the reviewer works the list.
        */}
        <DialogShellBody scrollable={false}>
          {error ? (
            <p className="flex shrink-0 items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
          {actionError ? (
            <p className="flex shrink-0 items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {actionError}
            </p>
          ) : null}
          {previewError ? (
            <p className="flex shrink-0 items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {previewError}
            </p>
          ) : null}
          {notice || statusMessage ? (
            <p className="flex shrink-0 items-start gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              {statusMessage ?? notice}
            </p>
          ) : null}

          {summary && summary.documentsSkipped.length > 0 ? (
            <ul className="shrink-0 space-y-0.5">
              {summary.documentsSkipped.map((skip) => (
                <li
                  key={`${skip.reason}-${skip.documentIds.join(",")}`}
                  className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"
                >
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {skip.message}
                </li>
              ))}
            </ul>
          ) : null}

          {loading && !state ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span>Loading specification intelligence…</span>
            </div>
          ) : null}

          {!loading && !state ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/5 py-12 text-center">
              <p className="text-xs text-muted-foreground">
                Specification intelligence is unavailable.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onRefresh}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {state ? (
            <>
              {/*
                Filter tabs, matching the Component Intelligence queue: the same
                pill treatment, and the count in the label rather than a separate
                summary strip, which is what the counts card used to duplicate.
              */}
              {!nothingFound ? (
                <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1">
                  {SPECIFICATION_FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setFilter(option.id)}
                      className={`shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        filter === option.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {option.label} ({counts?.[option.id] ?? 0})
                    </button>
                  ))}
                </div>
              ) : null}

              {nothingFound ? (
                <div className="flex flex-1 flex-col items-center justify-center space-y-2 rounded-xl border border-dashed border-border bg-muted/5 py-12 text-center">
                  <Sparkles className="mx-auto size-8 text-muted-foreground/30" />
                  <p className="text-xs font-semibold text-foreground">
                    No specifications found
                  </p>
                  <p className="mx-auto max-w-sm text-[11px] text-muted-foreground">
                    {summary
                      ? emptySpecificationMessage(summary)
                      : "No specifications were found."}
                  </p>
                </div>
              ) : visible.length === 0 && ambiguities.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center space-y-2 rounded-xl border border-dashed border-border bg-muted/5 py-12 text-center">
                  <Sparkles className="mx-auto size-8 text-muted-foreground/30" />
                  <p className="text-xs font-semibold text-foreground">
                    Nothing in this view
                  </p>
                  <p className="mx-auto max-w-sm text-[11px] text-muted-foreground">
                    Adjust or clear the filters to see other specifications.
                  </p>
                </div>
              ) : (
                <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card shadow-2xs">
                  {visible.map((specification) => (
                    <SpecificationRow
                      key={specification.attributeDefinitionId}
                      specification={specification}
                      canWrite={canWrite}
                      busy={
                        busyAttributeId === specification.attributeDefinitionId
                      }
                      expanded={Boolean(
                        expandedWhy[specification.attributeDefinitionId],
                      )}
                      onToggleEvidence={() =>
                        toggleWhy(specification.attributeDefinitionId)
                      }
                      onDecide={decide}
                      onApply={applyValue}
                      onPreviewDocument={previewDocument}
                    />
                  ))}

                  {ambiguities.map((entry) => {
                    const key = `${entry.extractedCode}-${entry.documentIds.join(",")}`;
                    return (
                      <AmbiguityRow
                        key={key}
                        unmapped={entry}
                        expanded={Boolean(expandedWhy[key])}
                        onToggleEvidence={() => toggleWhy(key)}
                      />
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </DialogShellBody>

        <DialogShellFooter className="justify-between">
          <div className="min-w-0 text-[11px] text-muted-foreground">
            {canWrite
              ? "Applying a specification writes the value to the component. Accepting on its own does not."
              : "Review only: applying a specification requires the Inventory.Update permission."}
          </div>
          <DialogShellCancelButton disabled={running}>Close</DialogShellCancelButton>
        </DialogShellFooter>
      </DialogShell>

      <DocumentViewer
        isOpen={previewing !== null}
        onClose={() => setPreviewing(null)}
        document={previewing}
      />
    </>
  );
}

/**
 * Chip colours for a card's state badge, keyed by the shared tone vocabulary.
 *
 * The tone *rule* lives in the pure module where it is unit tested; the class
 * strings stay here with the rest of the card's styling, matching how the
 * Component queue colours its own chips.
 */
const SPECIFICATION_CHIP_TONES: Record<SpecificationChipTone, string> = {
  PRIMARY: "border-primary/20 bg-primary/10 text-primary",
  WARNING:
    "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  SUCCESS:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  NEUTRAL: "border-border bg-muted text-muted-foreground",
};

/**
 * One aggregated specification, with its review controls.
 *
 * Laid out as a Component Intelligence finding card: state chip, lifecycle and
 * confidence badges, a title, a one-line description, the actions at the trailing
 * edge, and a subject row beneath them. The evidence is one click away behind the
 * same help button the Component queue uses, so the list stays scannable.
 *
 * The controls offered are exactly the ones that can succeed: Accept/Reject/
 * Dismiss while the finding is open, Apply once it is accepted. Everything else
 * shows the shared reason instead of a dead button, and every action goes through
 * the existing Component Review Queue endpoints.
 */
function SpecificationRow({
  specification,
  canWrite,
  busy,
  expanded,
  onToggleEvidence,
  onDecide,
  onApply,
  onPreviewDocument,
}: {
  specification: SpecificationAggregateDto;
  canWrite: boolean;
  busy: boolean;
  expanded: boolean;
  onToggleEvidence: () => void;
  onDecide: (
    specification: SpecificationAggregateDto,
    decision: "ACCEPTED" | "REJECTED" | "DISMISSED",
  ) => void | Promise<void>;
  onApply: (specification: SpecificationAggregateDto) => void | Promise<void>;
  onPreviewDocument: (documentId: string) => void | Promise<void>;
}) {
  const review = specification.review;
  const stale = review?.status === "STALE";
  const decided =
    review?.status === "REJECTED" || review?.status === "DISMISSED";
  const conflict = specification.state === "CONFLICT";

  const reasons = confidenceReasons(specification);
  const corroboration = describeCorroboration(specification);
  const erp = describeErpComparison(specification);
  const canApply = canApplySpecification(specification, canWrite);
  const canDecide = canDecideSpecification(specification, canWrite);
  const blocked = specificationUnavailableReason(specification, canWrite);
  const level = confidenceLevel(specification.confidence);
  const documented = conflict
    ? describeConflict(specification).join(" · ")
    : documentedValueText(specification);

  return (
    <div className="space-y-2.5 p-4 transition-colors hover:bg-muted/15">
      {/* Top Bar: badges, title, and action controls */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${
                SPECIFICATION_CHIP_TONES[specificationChipTone(specification)]
              }`}
            >
              <FileText className="size-3" />
              {specificationBadge(specification).toUpperCase()}
            </span>

            {review?.status ? (
              <StatusBadge
                status={STATUS_BADGE[review.status]}
                label={statusLabel(review.status)}
              />
            ) : null}

            <StatusBadge
              status={confidenceBadgeStatus(level)}
              label={`${level} CONFIDENCE`}
            />

            {stale ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3" />
                Needs re-analysis
              </span>
            ) : null}
          </div>

          <h4 className="text-sm font-semibold tracking-tight text-foreground">
            {specification.attributeName}
          </h4>

          {/* Human-readable reason, in the reviewer's terms */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {erp ?? specificationBadge(specification)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-end pt-0.5 sm:self-start">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onToggleEvidence}
            className={`text-muted-foreground hover:text-foreground ${
              expanded ? "bg-muted text-foreground" : ""
            }`}
            title="View reasoning evidence"
            aria-label="View reasoning evidence"
          >
            <HelpCircle className="size-3.5" />
          </Button>

          {busy ? (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Saving…
            </span>
          ) : (
            <>
              {canDecide ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void onDecide(specification, "DISMISSED")}
                    className="text-muted-foreground hover:text-foreground"
                    title="Dismiss finding"
                    aria-label="Dismiss finding"
                  >
                    <X className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void onDecide(specification, "REJECTED")}
                    className="h-7 gap-1 px-2.5 text-xs font-medium"
                    title="Reject finding"
                  >
                    Reject
                  </Button>
                </>
              ) : null}

              {/*
               * The primary action mirrors the Component Review Queue: an
               * applicable specification is accepted and applied in one step,
               * because accepting on its own would leave the finding in a state
               * where neither rule offers a next action.
               */}
              {canApply ? (
                <Button
                  type="button"
                  size="xs"
                  className="h-7 gap-1 px-2.5 text-xs font-medium"
                  title="Writes the documented value to the component and marks the finding accepted."
                  onClick={() => void onApply(specification)}
                >
                  <Sparkles className="size-3" />
                  Accept &amp; Apply
                </Button>
              ) : canDecide && review?.status === "PENDING" ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="h-7 gap-1 px-2.5 text-xs font-medium"
                  title="Records that the finding is valid without changing the component"
                  onClick={() => void onDecide(specification, "ACCEPTED")}
                >
                  <Check className="size-3" />
                  Accept
                </Button>
              ) : blocked && !decided ? (
                <span
                  className="max-w-44 text-right text-[10px] leading-tight text-muted-foreground"
                  title={blocked}
                >
                  {blocked}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Context: what the documents state and what the component records */}
      <div className="flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 p-2.5 text-xs sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground/80">
            {conflict ? "Documented values:" : "Documented:"}
          </span>
          <span
            className="truncate font-mono font-semibold text-foreground"
            title={documented}
          >
            {documented}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground/80">Current:</span>
          <span className="truncate font-mono text-foreground/70 italic">
            {specification.currentValue ?? "Not set"}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {confidencePercent(specification.confidence)}%
          </span>
        </div>
      </div>

      {/* Why Evidence Accordion */}
      {expanded ? (
        <div className="animate-in space-y-1.5 border-t border-border/60 pt-2 text-[11px] fade-in-50 duration-150">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-foreground">
            Reasoning Evidence &amp; Grounding:
          </span>

          {corroboration ? (
            <p className="text-muted-foreground">{corroboration}</p>
          ) : null}

          {specification.sources.length > 1 ? (
            <ul className="space-y-0.5">
              {specification.sources.map((source) => (
                <li
                  key={`${source.documentId}-${source.documentVersion}`}
                  className="text-muted-foreground"
                >
                  {source.documentFileName ?? source.documentType ?? "document"}
                  {source.documentVersion > 1
                    ? ` v${source.documentVersion}`
                    : ""}{" "}
                  states <span className="font-mono">{source.display}</span>
                  {sourceErpLabel(source) ? ` — ${sourceErpLabel(source)}` : ""}
                </li>
              ))}
            </ul>
          ) : null}

          <AggregateEvidenceList
            specification={specification}
            onPreviewDocument={onPreviewDocument}
          />

          {reasons.positive.length > 0 || reasons.negative.length > 0 ? (
            <ul className="space-y-0.5">
              {reasons.positive.map((reason) => (
                <li key={reason} className="text-muted-foreground">
                  + {reason}
                </li>
              ))}
              {reasons.negative.map((reason) => (
                <li
                  key={reason}
                  className="text-amber-600 dark:text-amber-400"
                >
                  − {reason}
                </li>
              ))}
            </ul>
          ) : null}

          {hasPrimaryEvidence(specification) ? (
            <p className="text-[10px] text-muted-foreground/70">
              Evidence includes a specification table.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The evidence behind one aggregated specification.
 *
 * Every item names the document, its revision, the page and section it was read
 * from, and what role it played, so a reviewer can judge the value rather than
 * trust the score. The excerpt is the extractor's own text, and the document can
 * be opened in the existing viewer.
 */
function AggregateEvidenceList({
  specification,
  onPreviewDocument,
}: {
  specification: SpecificationAggregateDto;
  onPreviewDocument: (documentId: string) => void | Promise<void>;
}) {
  if (specification.evidence.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {specification.evidence.map((item, index) => (
        <EvidenceItem
          key={`${item.documentId}-${item.page}-${index}`}
          evidence={item}
          onPreviewDocument={onPreviewDocument}
        />
      ))}
    </ul>
  );
}

function EvidenceItem({
  evidence,
  onPreviewDocument,
}: {
  evidence: DocumentEvidenceDto;
  onPreviewDocument: (documentId: string) => void | Promise<void>;
}) {
  const excerpt = specificationEvidenceExcerpt(evidence);

  return (
    <li className="space-y-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-medium text-foreground/90">
          {describeSpecificationEvidence({
            fileName: evidence.documentFileName,
            documentType: null,
            version: evidence.documentVersion,
            page: evidence.page,
            section: evidence.section,
          })}
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {evidenceRoleLabel(evidence.role)}
        </span>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-primary hover:underline"
          onClick={() => void onPreviewDocument(evidence.documentId)}
        >
          <Eye className="size-3" />
          View document
        </button>
      </div>
      {excerpt ? (
        <blockquote className="border-l-2 border-primary/30 pl-2 font-mono text-[11px] text-foreground/90">
          {excerpt}
        </blockquote>
      ) : (
        <p className="pl-2 text-[11px] text-muted-foreground">
          {evidence.description}
        </p>
      )}
    </li>
  );
}

/**
 * A property that could not be mapped onto exactly one attribute.
 *
 * Presented as the same card as a mapped specification, so the list reads as one
 * kind of thing: a state chip, a title, the reason, a subject row, and the ranked
 * candidates behind the same help button. Shown with the reason each candidate is
 * a candidate, so the reviewer can see what the extractor was choosing between
 * instead of being told only that it could not choose.
 */
function AmbiguityRow({
  unmapped,
  expanded,
  onToggleEvidence,
}: {
  unmapped: UnmappedSpecificationDto;
  expanded: boolean;
  onToggleEvidence: () => void;
}) {
  const ambiguous = unmapped.resolutionState === "AMBIGUOUS";
  const documentCount = unmapped.documentIds.length;

  return (
    <div className="space-y-2.5 p-4 transition-colors hover:bg-muted/15">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${
                ambiguous
                  ? SPECIFICATION_CHIP_TONES.WARNING
                  : SPECIFICATION_CHIP_TONES.NEUTRAL
              }`}
            >
              <AlertTriangle className="size-3" />
              {ambiguous ? "AMBIGUOUS" : "NO ATTRIBUTE"}
            </span>
          </div>

          <h4 className="text-sm font-semibold tracking-tight text-foreground">
            {ambiguous ? ambiguityHeading(unmapped) : unmapped.formatted}
          </h4>

          <p className="text-xs leading-relaxed text-muted-foreground">
            {ambiguous
              ? "More than one configured attribute matches this property, so no value is suggested until a reviewer says which one is meant."
              : "No configured attribute matches this property, and no attribute is created from a document."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 self-end pt-0.5 sm:self-start">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onToggleEvidence}
            className={`text-muted-foreground hover:text-foreground ${
              expanded ? "bg-muted text-foreground" : ""
            }`}
            title={
              ambiguous
                ? "View the candidate attributes"
                : "View the extraction details"
            }
            aria-label="View candidate attributes"
          >
            <HelpCircle className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Context: the property as extracted, and how many documents state it */}
      <div className="flex flex-col justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 p-2.5 text-xs sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground/80">Extracted as:</span>
          <span className="truncate font-mono font-semibold text-foreground">
            {unmapped.extractedCode}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground/80">Stated in:</span>
          <span className="truncate font-mono text-foreground/70 italic">
            {documentCount === 1
              ? "1 document"
              : `${documentCount} documents`}
          </span>
        </div>
      </div>

      {expanded ? (
        <div className="animate-in space-y-1.5 border-t border-border/60 pt-2 text-[11px] fade-in-50 duration-150">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-foreground">
            {ambiguous ? "Candidate Attributes:" : "Reason:"}
          </span>

          {ambiguous ? (
            <ul className="space-y-1.5">
              {describeAmbiguity(unmapped).map((candidate) => (
                <li key={candidate.name}>
                  <p className="text-foreground">{candidate.name}</p>
                  {candidate.reasons.map((reason) => (
                    <p key={reason} className="text-muted-foreground">
                      + {reason}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              {unmapped.inapplicableReason ??
                "The extracted property does not match any attribute this ERP defines."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
