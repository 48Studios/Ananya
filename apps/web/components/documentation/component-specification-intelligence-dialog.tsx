"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DialogShell,
  DialogShellBody,
  DialogShellCancelButton,
  DialogShellFooter,
} from "@/components/ui/dialog-shell";
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
  applyConflictMessage,
  extractApplyConflictReason,
} from "@/lib/component-review-queue";
import { attributeApplySuccessMessage } from "@/lib/attribute-value-review";
import {
  SPECIFICATION_FILTERS,
  ambiguityHeading,
  applyApplicationToSpecifications,
  applyDecisionToSpecifications,
  buildSpecificationFilterCounts,
  buildSummaryRows,
  canApplySpecification,
  canDecideSpecification,
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
  specificationEvidenceExcerpt,
  specificationUnavailableReason,
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
  const rows = summary ? buildSummaryRows(summary) : [];
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
        size="xl"
        contentClassName="sm:max-w-[1200px]"
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
        <DialogShellBody className="space-y-3">
          {error ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
          {actionError ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {actionError}
            </p>
          ) : null}
          {previewError ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {previewError}
            </p>
          ) : null}
          {notice || statusMessage ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              {statusMessage ?? notice}
            </p>
          ) : null}

          {loading && !state ? (
            <div className="flex items-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading specification intelligence…
            </div>
          ) : null}

          {!loading && !state ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/5 py-12 text-center">
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
              {summary && summary.documentsSkipped.length > 0 ? (
                <ul className="space-y-0.5">
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

              <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                {rows.map((row) => (
                  <div key={row.key} title={row.hint}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {row.label}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>

              {nothingFound ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/5 px-3 py-6 text-center text-xs text-muted-foreground">
                  {summary
                    ? emptySpecificationMessage(summary)
                    : "No specifications were found."}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1">
                    {SPECIFICATION_FILTERS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setFilter(option.id)}
                        className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          filter === option.id
                            ? "border-primary/40 bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {option.label}
                        <span className="ml-1 font-mono text-[10px]">
                          {counts?.[option.id] ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    {visible.map((specification) => (
                      <SpecificationRow
                        key={specification.attributeDefinitionId}
                        specification={specification}
                        canWrite={canWrite}
                        busy={
                          busyAttributeId ===
                          specification.attributeDefinitionId
                        }
                        onDecide={decide}
                        onApply={applyValue}
                        onPreviewDocument={previewDocument}
                      />
                    ))}

                    {ambiguities.map((entry) => (
                      <AmbiguityRow
                        key={`${entry.extractedCode}-${entry.documentIds.join(",")}`}
                        unmapped={entry}
                      />
                    ))}

                    {visible.length === 0 && ambiguities.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Nothing in this view.
                      </p>
                    ) : null}
                  </div>
                </>
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
 * One aggregated specification, with its review controls.
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
  onDecide,
  onApply,
  onPreviewDocument,
}: {
  specification: SpecificationAggregateDto;
  canWrite: boolean;
  busy: boolean;
  onDecide: (
    specification: SpecificationAggregateDto,
    decision: "ACCEPTED" | "REJECTED" | "DISMISSED",
  ) => void | Promise<void>;
  onApply: (specification: SpecificationAggregateDto) => void | Promise<void>;
  onPreviewDocument: (documentId: string) => void | Promise<void>;
}) {
  const review = specification.review;
  const applied = review?.applied === true;
  const accepted = review?.status === "ACCEPTED" && !applied;
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

  return (
    <div
      className={`rounded-lg border p-3 ${
        conflict
          ? "border-amber-500/40 bg-amber-500/5"
          : applied || accepted
            ? "border-emerald-500/30 bg-emerald-500/5"
            : stale
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {specification.attributeName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {conflict ? "Documented values: " : "Documented: "}
            <span className="font-mono text-foreground">
              {conflict
                ? describeConflict(specification).join(" · ")
                : documentedValueText(specification)}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Current:{" "}
            <span className="font-mono text-foreground">
              {specification.currentValue ?? "Not set"}
            </span>
          </p>
          {erp ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{erp}</p>
          ) : null}
          {corroboration ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {corroboration}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-[11px] text-muted-foreground">
            {confidencePercent(specification.confidence)}%
          </span>
          <p
            className={`mt-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium ${
              conflict
                ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                : "border-border text-muted-foreground"
            }`}
          >
            {specificationBadge(specification)}
          </p>
        </div>
      </div>

      {specification.sources.length > 1 ? (
        <ul className="mt-2 space-y-0.5">
          {specification.sources.map((source) => (
            <li
              key={`${source.documentId}-${source.documentVersion}`}
              className="text-[10px] text-muted-foreground"
            >
              {source.documentFileName ?? source.documentType ?? "document"}
              {source.documentVersion > 1 ? ` v${source.documentVersion}` : ""}{" "}
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
        <ul className="mt-1.5 space-y-0.5">
          {reasons.positive.map((reason) => (
            <li key={reason} className="text-[10px] text-muted-foreground">
              + {reason}
            </li>
          ))}
          {reasons.negative.map((reason) => (
            <li
              key={reason}
              className="text-[10px] text-amber-600 dark:text-amber-400"
            >
              − {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {hasPrimaryEvidence(specification) ? (
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          Evidence includes a specification table.
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-border/70 pt-2">
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
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void onDecide(specification, "REJECTED")}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void onDecide(specification, "DISMISSED")}
                >
                  Dismiss
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
                size="sm"
                className="h-7 px-2 text-[11px]"
                title="Writes the documented value to the component and marks the finding accepted."
                onClick={() => void onApply(specification)}
              >
                Accept &amp; Apply
              </Button>
            ) : canDecide && review?.status === "PENDING" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => void onDecide(specification, "ACCEPTED")}
              >
                Accept
              </Button>
            ) : blocked && !decided ? (
              <span
                className="max-w-[70ch] text-[10px] text-muted-foreground"
                title={blocked}
              >
                {blocked}
              </span>
            ) : null}
          </>
        )}
      </div>
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
    <ul className="mt-2 space-y-1.5 border-t border-border/70 pt-2">
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
 * Shown with the ranked candidates and the reason each one is a candidate, so the
 * reviewer can see what the extractor was choosing between instead of being told
 * only that it could not choose.
 */
function AmbiguityRow({ unmapped }: { unmapped: UnmappedSpecificationDto }) {
  const ambiguous = unmapped.resolutionState === "AMBIGUOUS";

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <HelpCircle className="size-3" />
            {ambiguous ? ambiguityHeading(unmapped) : unmapped.formatted}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Extracted as{" "}
            <span className="font-mono text-foreground">
              {unmapped.extractedCode}
            </span>
          </p>
        </div>
        <p className="shrink-0 rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          {ambiguous ? "Ambiguous" : "No attribute"}
        </p>
      </div>

      {ambiguous ? (
        <ul className="mt-2 space-y-1">
          {describeAmbiguity(unmapped).map((candidate) => (
            <li key={candidate.name} className="text-[11px]">
              <p className="text-foreground">{candidate.name}</p>
              {candidate.reasons.map((reason) => (
                <p key={reason} className="text-[10px] text-muted-foreground">
                  + {reason}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          No configured attribute matches this property, and no attribute is
          created from a document.
        </p>
      )}
    </div>
  );
}
