"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileSearch,
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
import {
  documentationIntelligenceApi,
  type AttributeCandidateDto,
  type DocumentAnalysisDto,
  type DocumentAnalysisStateDto,
} from "@/lib/api/documentation-intelligence-api";
import { componentReviewQueueApi } from "@/lib/api/component-review-queue-api";
import type { DocumentDto } from "@/lib/api/documents-api";
import { formatDocumentDate } from "@/lib/component-documentation";
import {
  ANALYSIS_RUNNING_COPY,
  analysisFailureMessage,
  analysisStatusLabel,
  buildAnalysisSummaryRows,
  buildEvidenceViewModel,
  candidateHeading,
  candidateMatchesConflict,
  candidateResolutionLabel,
  candidateValueText,
  describeAnalysisStatus,
  hasDocumentExcerpt,
  hasReviewableOutput,
  mergeAnalysisResult,
  supersededAnalysisNotice,
  unresolvedCandidates,
  type EvidenceViewModel,
} from "@/lib/document-intelligence";
import {
  CANDIDATE_ACTION_PENDING_COPY,
  CANDIDATE_FILTERS,
  applyApplicationToAnalysis,
  applyDecisionToAnalysis,
  applyUnavailableReason,
  attributeApplySuccessMessage,
  buildCandidateFilterCounts,
  canApplyCandidate,
  canDecideCandidate,
  candidateOutcomeNotice,
  candidateStatusBadge,
  filterCandidates,
  inapplicableReasonLabel,
  reviewSectionHeading,
  summariseCandidateReview,
  updateAnalysisInState,
  type CandidateFilterId,
} from "@/lib/attribute-value-review";
import { applyConflictMessage, extractApplyConflictReason } from "@/lib/component-review-queue";

export interface DocumentAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentDto | null;
  /** Whether the user may run analysis and apply specifications. */
  canWrite: boolean;
  /** Opens the existing Component Review Queue dialog. */
  onReviewSuggestions?: () => void;
}

/**
 * AI analysis for one datasheet.
 *
 * Contextual to the document rather than a dashboard: it shows what was read
 * from this file, the evidence behind each value, and hands the reviewer to the
 * existing Component Review Queue. Nothing here applies a value — extracted
 * specifications are suggestions, and the summary states plainly that the
 * component is unchanged until a human accepts something.
 */
export function DocumentAnalysisDialog({
  isOpen,
  onClose,
  document,
  canWrite,
  onReviewSuggestions,
}: DocumentAnalysisDialogProps) {
  const [state, setState] = React.useState<DocumentAnalysisStateDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pass 3 review state: which specification is being saved, and the outcome
  // copy for the last decision or application.
  const [busyAttributeId, setBusyAttributeId] = React.useState<string | null>(
    null,
  );
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [candidateFilter, setCandidateFilter] =
    React.useState<CandidateFilterId>("ALL");

  const documentId = document?.id ?? null;

  const load = React.useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      setState(await documentationIntelligenceApi.getAnalysis(documentId));
    } catch (err: unknown) {
      setState(null);
      setError(analysisFailureMessage(err));
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  React.useEffect(() => {
    if (isOpen && documentId) {
      void load();
    }
    if (!isOpen) {
      setError(null);
      setActionError(null);
      setStatusMessage(null);
    }
  }, [isOpen, documentId, load]);

  const analysis = state?.analysis ?? null;
  const previousAnalysis = state?.latestAnalysis ?? null;

  const runAnalysis = async () => {
    if (!documentId || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await documentationIntelligenceApi.analyze(documentId);
      // Targeted update from the response: the card and this dialog refresh
      // without a refetch or a page reload.
      setState((current) => mergeAnalysisResult(current, result));
    } catch (err: unknown) {
      setError(analysisFailureMessage(err));
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * Records a reviewer decision through the existing queue endpoint.
   *
   * The response is the updated finding, so the affected specification row is
   * rewritten from it — no refetch and no reload.
   */
  const decide = async (
    candidate: AttributeCandidateDto,
    decision: "ACCEPTED" | "REJECTED" | "DISMISSED",
  ) => {
    const review = candidate.review;
    if (!review?.findingId || !documentId) return;

    setBusyAttributeId(candidate.attributeDefinitionId);
    setActionError(null);
    try {
      const updated = await componentReviewQueueApi.recordDecision(
        review.findingId,
        review.fingerprint
          ? { decision, expectedFingerprint: review.fingerprint }
          : { decision },
      );
      setState((current) =>
        current
          ? {
              ...current,
              analysis:
                current.analysis &&
                applyDecisionToAnalysis(current.analysis, updated),
            }
          : current,
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
  const applyValue = async (candidate: AttributeCandidateDto) => {
    const review = candidate.review;
    if (!review?.findingId || !documentId || !review.fingerprint) return;

    setBusyAttributeId(candidate.attributeDefinitionId);
    setActionError(null);
    try {
      const result = await componentReviewQueueApi.applyFinding(
        review.findingId,
        { expectedFingerprint: review.fingerprint },
      );

      // The apply response carries the outcome; the finding's new state is read
      // back so the row shows exactly what the backend stores.
      const finding = await componentReviewQueueApi.getFinding(review.findingId);

      setState((current) =>
        updateAnalysisInState(
          current ? { [documentId]: current } : {},
          documentId,
          (analysis) => applyApplicationToAnalysis(analysis, finding, result),
        )[documentId] ?? current,
      );
      setStatusMessage(attributeApplySuccessMessage(result));
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

  if (!isOpen || !document) return null;

  const eligibility = state?.eligibility ?? null;
  const unavailable = eligibility && !eligibility.available ? eligibility : null;
  const summaryRows = analysis ? buildAnalysisSummaryRows(analysis) : [];
  const reviewSummary = analysis
    ? summariseCandidateReview(analysis.attributes)
    : null;
  const filterCounts = analysis
    ? buildCandidateFilterCounts(analysis.attributes)
    : null;
  const visibleCandidates = analysis
    ? filterCandidates(analysis.attributes, candidateFilter)
    : [];
  const unresolved = analysis
    ? unresolvedCandidates(analysis.attributes)
    : [];
  const pendingFindings =
    analysis?.findings.filter((finding) => finding.status === "PENDING") ?? [];

  return (
    <DialogShell
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="AI Analysis"
      description={
        document.fileName
          ? `${document.fileName} • v${document.currentVersion}`
          : document.title
      }
      size="lg"
      closeDisabled={analyzing}
    >
      <DialogShellBody className="space-y-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Loading analysis…</span>
          </div>
        ) : unavailable ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              Analysis unavailable
            </div>
            <p className="text-xs text-muted-foreground">{unavailable.message}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {analysis
                      ? analysisStatusLabel(analysis.status)
                      : "Not analyzed yet"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {analysis
                      ? describeAnalysisStatus(analysis)
                      : canWrite
                        ? "Extract manufacturer, part number, and technical specifications from this datasheet as review suggestions."
                        : `Analyzing a datasheet creates review suggestions, which requires the Inventory.Update permission.`}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant={analysis ? "outline" : "default"}
                className="h-8 shrink-0 gap-1.5 text-xs"
                disabled={!canWrite || analyzing}
                title={
                  !canWrite
                    ? "Requires the Inventory.Update permission"
                    : analysis
                      ? "Run the analysis again"
                      : "Analyze this datasheet"
                }
                onClick={runAnalysis}
              >
                {analyzing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Analyzing…
                  </>
                ) : analysis ? (
                  <>
                    <RefreshCw className="size-3.5" />
                    Re-analyze
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Analyze with AI
                  </>
                )}
              </Button>
            </div>

            {analyzing ? (
              <p className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-muted-foreground">
                {ANALYSIS_RUNNING_COPY}
              </p>
            ) : null}

            {analysis?.status === "ANALYSIS_FAILED" ? (
              <div className="space-y-1 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                <p className="text-xs font-semibold text-destructive">
                  Analysis failed
                </p>
                <p className="text-xs text-destructive/90">
                  {analysis.failureReason ??
                    "The datasheet could not be processed."}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Nothing on the component was changed. The file can still be
                  previewed and downloaded.
                </p>
              </div>
            ) : null}

            {analysis && !analysis.isCurrent ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                {supersededAnalysisNotice(analysis)}
              </p>
            ) : null}

            {analysis && analysis.status !== "ANALYSIS_FAILED" ? (
              <>
                <section className="space-y-2">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <FileSearch className="size-3.5" />
                    Summary
                  </h4>
                  {summaryRows.length === 0 ? (
                    <p className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                      Nothing reviewable was found in this datasheet. Its
                      evidence is still recorded below.
                    </p>
                  ) : (
                    <dl className="divide-y divide-border/70 rounded-lg border border-border bg-card">
                      {summaryRows.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between gap-3 px-3 py-2"
                        >
                          <div>
                            <dt className="text-xs font-medium text-foreground">
                              {row.label}
                            </dt>
                            <p className="text-[11px] text-muted-foreground">
                              {row.hint}
                            </p>
                          </div>
                          <dd className="shrink-0 text-right font-mono text-xs font-semibold text-foreground">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Analyzed {formatDocumentDate(analysis.analyzedAt)}
                    {analysis.pagesAnalyzed
                      ? ` • ${analysis.pagesAnalyzed} page${
                          analysis.pagesAnalyzed === 1 ? "" : "s"
                        } read`
                      : ""}
                    {analysis.extractorVersion
                      ? ` • ${analysis.extractorVersion}`
                      : ""}
                  </p>
                </section>

                {actionError ? (
                  <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                    {actionError}
                  </p>
                ) : null}

                {statusMessage ? (
                  <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    {statusMessage}
                  </p>
                ) : null}

                {analysis.attributes.length > 0 && reviewSummary ? (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {reviewSectionHeading(analysis.attributes)}
                      </h4>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {reviewSummary.pending} pending • {reviewSummary.accepted}{" "}
                        accepted • {reviewSummary.applied} applied
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {CANDIDATE_FILTERS.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => setCandidateFilter(filter.id)}
                          className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                            candidateFilter === filter.id
                              ? "border-primary/40 bg-primary/10 text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {filter.label}
                          <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                            {filterCounts?.[filter.id] ?? 0}
                          </span>
                        </button>
                      ))}
                    </div>

                    {visibleCandidates.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                        No specifications match this filter.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {visibleCandidates.map((candidate) => (
                          <SpecificationRow
                            key={candidate.extractedCode}
                            candidate={candidate}
                            canWrite={canWrite}
                            busy={busyAttributeId === candidate.attributeDefinitionId}
                            onDecide={decide}
                            onApply={applyValue}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ) : null}

                {unresolved.length > 0 ? (
                  <section className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Unresolved properties ({unresolved.length})
                    </h4>
                    <div className="space-y-2">
                      {unresolved.map((candidate) => (
                        <div
                          key={candidate.extractedCode}
                          className="rounded-lg border border-dashed border-border bg-muted/20 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-foreground">
                                {candidate.extractedCode}
                              </p>
                              <p className="font-mono text-sm text-foreground">
                                {candidateValueText(candidate)}
                              </p>
                            </div>
                            <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {candidateResolutionLabel(candidate.resolution)}
                            </span>
                          </div>
                          {candidate.resolutionDetail ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {candidate.resolutionDetail}
                            </p>
                          ) : null}
                          <EvidenceList evidence={candidate.evidence} />
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {pendingFindings.length > 0 ? (
                  <section className="space-y-2">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <ClipboardList className="size-3.5" />
                      Review suggestions ({pendingFindings.length})
                    </h4>
                    <ul className="space-y-1.5">
                      {pendingFindings.map((finding) => (
                        <li
                          key={finding.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                        >
                          <span className="text-xs text-foreground">
                            {finding.title}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {finding.issueType}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {onReviewSuggestions ? (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => {
                          onClose();
                          onReviewSuggestions();
                        }}
                      >
                        <ClipboardList className="size-3.5" />
                        Review suggestions
                      </Button>
                    ) : null}
                  </section>
                ) : null}

                {analysis.evidence.length > 0 ? (
                  <section className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Evidence ({analysis.evidence.length})
                    </h4>
                    <EvidenceList evidence={analysis.evidence} />
                  </section>
                ) : null}

                {hasReviewableOutput(analysis) ? (
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    These are suggestions only. Nothing on the component changes
                    until a reviewer accepts a finding in the Component Review
                    Queue or applies an attribute value.
                  </p>
                ) : null}
              </>
            ) : null}

            {previousAnalysis && analysis === null ? (
              <p className="text-[11px] text-muted-foreground">
                A previous revision of this document was analyzed on{" "}
                {formatDocumentDate(previousAnalysis.analyzedAt)}. Analyze the
                current version to review it.
              </p>
            ) : null}
          </>
        )}

        {error ? (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </DialogShellBody>
      <DialogShellFooter>
        <DialogShellCancelButton disabled={analyzing} />
        {analysis && hasReviewableOutput(analysis) && onReviewSuggestions ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onClose();
              onReviewSuggestions();
            }}
          >
            Open review queue
          </Button>
        ) : null}
      </DialogShellFooter>
    </DialogShell>
  );
}

/** Evidence list shared by candidate and document-level evidence sections. */
function EvidenceList({
  evidence,
}: {
  evidence: DocumentAnalysisDto["evidence"];
}): React.ReactElement | null {
  const items = buildEvidenceViewModel(evidence);
  if (items.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1.5 border-t border-border/70 pt-2">
      {items.map((item) => (
        <li key={item.id} className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            {item.source}
            <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/70">
              {item.extractionMethod}
            </span>
          </p>
          {item.excerpt ? (
            <blockquote className="border-l-2 border-primary/30 pl-2 font-mono text-[11px] text-foreground/90">
              {item.excerpt}
            </blockquote>
          ) : (
            <p className="pl-2 text-[11px] text-muted-foreground">
              {item.description}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * One extracted specification, with its review controls.
 *
 * The actions offered are exactly the ones that can succeed: Accept/Reject/
 * Dismiss while the finding is open, Apply once it is accepted. An inapplicable
 * specification shows why instead of a dead button, and every action goes
 * through the existing Component Review Queue endpoints.
 */
function SpecificationRow({
  candidate,
  canWrite,
  busy,
  onDecide,
  onApply,
}: {
  candidate: AttributeCandidateDto;
  canWrite: boolean;
  busy: boolean;
  onDecide: (
    candidate: AttributeCandidateDto,
    decision: "ACCEPTED" | "REJECTED" | "DISMISSED",
  ) => void | Promise<void>;
  onApply: (candidate: AttributeCandidateDto) => void | Promise<void>;
}) {
  const review = candidate.review;
  const applied = review?.applied === true;
  const accepted = review?.status === "ACCEPTED" && !applied;
  const decided =
    review?.status === "REJECTED" || review?.status === "DISMISSED";
  const stale = review?.status === "STALE";

  const canApply = canApplyCandidate(candidate, canWrite);
  const canDecide = canDecideCandidate(candidate, canWrite);
  const applyBlockedReason = applyUnavailableReason(candidate, canWrite);
  const outcome = candidateOutcomeNotice(candidate);

  return (
    <div
      className={`rounded-lg border p-3 ${
        accepted || applied
          ? "border-emerald-500/30 bg-emerald-500/5"
          : stale
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground">
            {candidateHeading(candidate)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Current:{" "}
            <span className="font-mono text-foreground">
              {candidate.currentValue ?? "Not set"}
            </span>
          </p>
          <p className="font-mono text-sm text-foreground">
            Suggested: {candidateValueText(candidate)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-[11px] text-muted-foreground">
            {Math.round(candidate.confidence * 100)}%
          </span>
          <p className="mt-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {candidateStatusBadge(candidate)}
          </p>
        </div>
      </div>

      {candidateMatchesConflict(candidate) ? (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          The component already records a different value, so this needs an
          explicit decision.
        </p>
      ) : null}

      {!candidate.applicable && candidate.inapplicableReason ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {inapplicableReasonLabel(candidate.inapplicableReason)}
          {candidate.validationDetail ? ` — ${candidate.validationDetail}` : ""}
        </p>
      ) : null}

      {outcome ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{outcome}</p>
      ) : null}

      <EvidenceList evidence={candidate.evidence} />

      <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5 border-t border-border/70 pt-2">
        {busy ? (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {CANDIDATE_ACTION_PENDING_COPY}
          </span>
        ) : (
          <>
            {canDecide ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void onDecide(candidate, "REJECTED")}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void onDecide(candidate, "DISMISSED")}
                >
                  Dismiss
                </Button>
                {!accepted && candidate.review?.status === "PENDING" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void onDecide(candidate, "ACCEPTED")}
                  >
                    Accept
                  </Button>
                ) : null}
              </>
            ) : null}

            {canApply ? (
              <Button
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => void onApply(candidate)}
              >
                Apply
              </Button>
            ) : applyBlockedReason && !decided && !applied ? (
              <span
                className="text-[10px] text-muted-foreground"
                title={applyBlockedReason}
              >
                {candidate.applicable ? "Not applicable" : "Not actionable"}
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export type { EvidenceViewModel };
export { hasDocumentExcerpt };