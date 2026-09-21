"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import { COMPONENT_WRITE_PERMISSION } from "@/lib/document-intelligence";
import {
  componentSpecificationApi,
  type ComponentDocumentationStateDto,
  type SpecificationAggregateDto,
  type UnmappedSpecificationDto,
} from "@/lib/api/documentation-intelligence-api";
import {
  SPECIFICATION_FILTERS,
  ambiguityHeading,
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
  describeRunOutcome,
  describeSpecificationEvidence,
  emptySpecificationMessage,
  evidenceRoleLabel,
  filterSpecifications,
  hasPrimaryEvidence,
  sourceErpLabel,
  specificationBadge,
  specificationUnavailableReason,
  type SpecificationFilterId,
} from "@/lib/specification-intelligence";

/**
 * Specification Intelligence for one component.
 *
 * Shows what every eligible document says about the component, combined: one row
 * per attribute, with the documents that state it, whether they agree, and what
 * the component already records. Conflicts and ambiguous mappings are shown as
 * states a reviewer must resolve, never resolved here.
 *
 * Analysis is advisory. Applying a value goes through the existing Component
 * Review Queue, so this panel only reads state and runs the analysis.
 */
export function ComponentSpecificationIntelligencePanel({
  componentId,
}: {
  componentId: string;
}) {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission(COMPONENT_WRITE_PERMISSION);

  const [state, setState] =
    React.useState<ComponentDocumentationStateDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<SpecificationFilterId>("ALL");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await componentSpecificationApi.getState(componentId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Specification intelligence could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [componentId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /**
   * Runs the component-level analysis and refreshes from its own response.
   *
   * The response carries the new state, so the panel never has to reload the
   * page to show what changed.
   */
  const analyze = React.useCallback(async () => {
    setRunning(true);
    setError(null);
    setStatusMessage(null);
    try {
      const result = await componentSpecificationApi.analyze(componentId);
      setState((current) =>
        current
          ? {
              ...current,
              summary: result.summary,
              specifications: result.specifications,
              unmapped: result.unmapped,
            }
          : current,
      );
      setStatusMessage(
        describeRunOutcome({
          documentsAnalyzed: result.summary.documentsAnalyzed,
          createdFindingCount: result.createdFindingCount,
          staledFindingCount: result.staledFindingCount,
        }),
      );
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "The documentation analysis could not be completed.",
      );
    } finally {
      setRunning(false);
    }
  }, [componentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading specification intelligence…
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs text-muted-foreground">
          {error ?? "Specification intelligence is unavailable."}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 px-2 text-[11px]"
          onClick={() => void load()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const rows = buildSummaryRows(state.summary);
  const counts = buildSpecificationFilterCounts(
    state.specifications,
    state.unmapped,
  );
  const visible = filterSpecifications(state.specifications, filter);
  const showAmbiguities = filter === "ALL" || filter === "AMBIGUOUS";
  const ambiguities = showAmbiguities ? state.unmapped : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold text-foreground">
            Documentation Intelligence
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Specifications found across this component&apos;s documents.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={running || !canWrite}
          title={
            canWrite
              ? undefined
              : "Analyzing documentation persists review findings, which requires the Inventory.Update permission."
          }
          onClick={() => void analyze()}
        >
          {running ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <Sparkles className="mr-1 size-3" />
          )}
          {running ? "Analyzing…" : "Analyze documents"}
        </Button>
      </div>

      {error ? (
        <p className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
      {statusMessage ? (
        <p className="flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-3" />
          {statusMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-3 py-2">
        {rows.map((row) => (
          <div key={row.key} title={row.hint}>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {row.label}
            </p>
            <p className="text-sm font-semibold text-foreground">{row.value}</p>
          </div>
        ))}
      </div>

      {state.summary.documentsSkipped.length > 0 ? (
        <ul className="space-y-0.5">
          {state.summary.documentsSkipped.map((skip) => (
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

      {state.specifications.length === 0 && state.unmapped.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {emptySpecificationMessage(state.summary)}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {SPECIFICATION_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
                  filter === option.id
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {option.label}
                <span className="ml-1 font-mono">{counts[option.id] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {visible.map((specification) => (
              <SpecificationRow
                key={specification.attributeDefinitionId}
                specification={specification}
                canWrite={canWrite}
              />
            ))}

            {ambiguities.map((entry) => (
              <AmbiguityRow
                key={`${entry.extractedCode}-${entry.documentIds.join(",")}`}
                unmapped={entry}
              />
            ))}

            {visible.length === 0 && ambiguities.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nothing in this view.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One aggregated specification.
 *
 * The controls offered are exactly the ones that can succeed, and every one goes
 * through the existing review queue in the analysis dialog — this panel shows
 * state, it does not duplicate the review workflow.
 */
function SpecificationRow({
  specification,
  canWrite,
}: {
  specification: SpecificationAggregateDto;
  canWrite: boolean;
}) {
  const applied = specification.review?.applied === true;
  const conflict = specification.state === "CONFLICT";
  const reasons = confidenceReasons(specification);
  const corroboration = describeCorroboration(specification);
  const erp = describeErpComparison(specification);
  const blocked = specificationUnavailableReason(specification, canWrite);

  return (
    <div
      className={`rounded-lg border p-3 ${
        conflict
          ? "border-amber-500/40 bg-amber-500/5"
          : applied
            ? "border-emerald-500/30 bg-emerald-500/5"
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
                : (specification.display ?? "—")}
            </span>
          </p>
          {specification.currentValue ? (
            <p className="text-[11px] text-muted-foreground">
              Current ERP:{" "}
              <span className="font-mono text-foreground">
                {specification.currentValue}
              </span>
            </p>
          ) : null}
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

      <ul className="mt-2 space-y-0.5">
        {specification.evidence.slice(0, 4).map((item, index) => (
          <li
            key={`${item.documentId}-${item.page}-${index}`}
            className="text-[11px] text-muted-foreground"
          >
            <span className="text-foreground/90">
              {item.role === "PRIMARY" ? "✓ " : "• "}
              {describeSpecificationEvidence({
                fileName: item.documentFileName,
                documentType: null,
                version: item.documentVersion,
                page: item.page,
                section: item.section,
              })}
            </span>
            <span className="ml-1.5 text-[10px] text-muted-foreground/70">
              {evidenceRoleLabel(item.role)}
            </span>
          </li>
        ))}
      </ul>

      {specification.sources.length > 1 ? (
        <ul className="mt-1 space-y-0.5">
          {specification.sources.map((source) => (
            <li
              key={`${source.documentId}-${source.documentVersion}`}
              className="text-[10px] text-muted-foreground"
            >
              {source.documentFileName ?? source.documentType ?? "document"} states{" "}
              <span className="font-mono">{source.display}</span>
              {sourceErpLabel(source) ? ` — ${sourceErpLabel(source)}` : ""}
            </li>
          ))}
        </ul>
      ) : null}

      {reasons.positive.length > 0 || reasons.negative.length > 0 ? (
        <ul className="mt-1 space-y-0.5">
          {reasons.positive.map((reason) => (
            <li key={reason} className="text-[10px] text-muted-foreground">
              + {reason}
            </li>
          ))}
          {reasons.negative.map((reason) => (
            <li key={reason} className="text-[10px] text-amber-600 dark:text-amber-400">
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
        {canApplySpecification(specification, canWrite) ? (
          <span className="text-[10px] text-muted-foreground">
            Apply from the datasheet panel, where the review controls live.
          </span>
        ) : canDecideSpecification(specification, canWrite) ? (
          <span className="text-[10px] text-muted-foreground">
            Awaiting a decision in the Component Review Queue.
          </span>
        ) : blocked ? (
          <span
            className="max-w-[70ch] text-[10px] text-muted-foreground"
            title={blocked}
          >
            {blocked}
          </span>
        ) : null}
      </div>
    </div>
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

