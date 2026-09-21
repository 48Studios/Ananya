"use client";

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  componentReviewQueueApi,
  type ConsolidationPreviewDto,
  type ConsolidationResultDto,
  type ConsolidationSeverity,
} from "@/lib/api/component-review-queue-api";
import {
  CONSOLIDATION_EXECUTION_UNAVAILABLE_COPY,
  buildConsolidationAttributeRows,
  buildConsolidationImpactRows,
  consolidationClassificationLabel,
  consolidationScopeNotice,
  explainConsolidationEligibility,
  groupConsolidationConflicts,
  sortConsolidationDependencies,
} from "@/lib/component-review-queue";
import Link from "next/link";
import {
  ConsolidationExecutionFlow,
  ConsolidationSuccessSummary,
} from "./component-consolidation-execution-flow";

/**
 * Consolidation preview and execution panel (Pass 6A, extended in Pass 6B).
 *
 * The preview half remains read-only and is the authoritative preflight: it
 * explains what consolidation would affect and exactly what still blocks it.
 * Execution is offered ONLY when the backend reports `executable`, and it always
 * goes through the two-step confirmation in
 * {@link ConsolidationExecutionFlow} — the backend recomputes the preview inside
 * the transaction and verifies the fingerprint, so the UI can never force a
 * stale or blocked operation through.
 */

interface ConsolidationPreviewPanelProps {
  findingId: string;
  /** Loads automatically when true. */
  enabled: boolean; /**
   * A value that changes whenever the finding's authoritative state changes
   * (for example `${status}:${updatedAt}`).
   *
   * The finding's lifecycle is part of the preview fingerprint, so recording a
   * review decision invalidates any preview already on screen. Without this the
   * panel would keep showing a stale "ready to consolidate" state and submit a
   * fingerprint the backend must reject.
   */
  findingRevision?: string; /** The viewer holds `Inventory.Update`, so execution may be offered. */
  canExecute?: boolean;
  /**
   * Called after a successful consolidation, carrying the backend's result.
   *
   * The result is the authoritative description of what the operation did, so
   * it is forwarded unchanged rather than reduced to a signal — the finding's
   * new status and the canonical/source identity all come from it.
   */
  onConsolidated?: (result: ConsolidationResultDto) => void;
}

const SEVERITY_STYLES: Record<
  ConsolidationSeverity,
  { container: string; badge: string; icon: React.ReactNode }
> = {
  BLOCKING: {
    container: "border-destructive/30 bg-destructive/5",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: <Ban className="size-3 shrink-0" />,
  },
  WARNING: {
    container: "border-amber-500/30 bg-amber-500/5",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    icon: <AlertTriangle className="size-3 shrink-0" />,
  },
  INFORMATIONAL: {
    container: "border-border bg-muted/30",
    badge: "border-border bg-card text-muted-foreground",
    icon: <Info className="size-3 shrink-0" />,
  },
};

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
        {typeof count === "number" ? ` (${count})` : ""}
      </h4>
      {children}
    </div>
  );
}

export function ConsolidationPreviewPanel({
  findingId,
  enabled,
  findingRevision,
  canExecute = false,
  onConsolidated,
}: ConsolidationPreviewPanelProps) {
  const [preview, setPreview] = React.useState<ConsolidationPreviewDto | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [canonicalChoice, setCanonicalChoice] = React.useState<string | null>(
    null,
  );
  /**
   * The completed consolidation, if one happened while this panel was open.
   *
   * Held here rather than inside the execution flow because the flow is only
   * mounted while the preview is executable, and consolidating retires the
   * source records — so the refreshed preview is no longer executable and the
   * flow unmounts. Keeping the receipt at the panel level is what makes it
   * survive its own success.
   */
  const [consolidationResult, setConsolidationResult] =
    React.useState<ConsolidationResultDto | null>(null);

  // A result belongs to the finding it was produced for; opening another
  // finding must not inherit it.
  React.useEffect(() => {
    setConsolidationResult(null);
  }, [findingId]);

  const load = React.useCallback(
    async (canonicalComponentId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const data = await componentReviewQueueApi.buildConsolidationPreview(
          findingId,
          canonicalComponentId ? { canonicalComponentId } : {},
        );
        setPreview(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to build the consolidation preview.",
        );
        setPreview(null);
      } finally {
        setLoading(false);
      }
    },
    [findingId],
  );

  React.useEffect(() => {
    setPreview(null);
    setError(null);
    setExpanded(false);
    setCanonicalChoice(null);
    if (enabled) void load();
    // `findingRevision` participates deliberately: a review decision changes the
    // finding's lifecycle, which is part of the fingerprint, so the previous
    // analysis must be discarded rather than reused.
  }, [enabled, load, findingRevision]);

  if (!enabled) return null;

  if (loading && !preview) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Analysing consolidation impact...
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-[11px] text-muted-foreground">{error}</p>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => void load()}
        >
          Retry analysis
        </Button>
      </div>
    );
  }

  if (!preview) return null;

  const groups = groupConsolidationConflicts(preview);
  const impact = buildConsolidationImpactRows(preview);
  const dependencies = sortConsolidationDependencies(preview);
  const attributeRows = buildConsolidationAttributeRows(preview);
  const visibleDependencies = expanded
    ? dependencies
    : dependencies
        .filter((entry) => entry.count > 0 || entry.blocking)
        .slice(0, 8);
  const hiddenDependencies = dependencies.length - visibleDependencies.length;

  return (
    <div className="space-y-4">
      {/*
        Receipt for a consolidation performed from this panel. Rendered above
        the refreshable preview so the operator keeps the confirmed record of
        what happened — consolidation id, canonical, retired records — even
        though the preview below has since been recomputed against the retired
        components.
      */}
      {consolidationResult && (
        <Section title="Consolidation">
          <ConsolidationSuccessSummary result={consolidationResult} />
        </Section>
      )}

      {/*
        Execution status: the honest headline, driven by the backend.

        Suppressed once a consolidation has completed for this finding. The
        headline exists to offer or withhold the operation; after the operation
        the refreshed preview is necessarily no longer executable, and showing
        a red "unavailable" banner directly beneath a green receipt would read
        as a failure.
      */}
      {!consolidationResult && (
        <div
          className={
            preview.executable
              ? "space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3"
              : "space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert
              className={
                preview.executable
                  ? "size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  : "size-3.5 shrink-0 text-destructive"
              }
            />
            <h4
              className={
                preview.executable
                  ? "text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400"
                  : "text-[11px] font-semibold uppercase tracking-wider text-destructive"
              }
            >
              {preview.executable
                ? "READY TO CONSOLIDATE"
                : CONSOLIDATION_EXECUTION_UNAVAILABLE_COPY}
            </h4>
            <StatusBadge
              status={preview.executable ? "SUCCESS" : "DRAFT"}
              label={preview.executable ? "EXECUTABLE" : "BLOCKED"}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {consolidationScopeNotice()}
          </p>
          {preview.executionBlockedReasons.length > 0 && (
            <ul className="space-y-1">
              {preview.executionBlockedReasons.slice(0, 6).map((reason) => (
                <li
                  key={reason.code}
                  className="flex items-start gap-1.5 text-[11px] text-foreground"
                >
                  <Ban className="mt-0.5 size-3 shrink-0 text-destructive" />
                  <span>
                    <span className="font-medium">{reason.title}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/*
        Execution. Only offered when the backend reports the operation is not
        blocked, so a blocker can never be bypassed from the UI. When blockers
        exist the section is absent entirely rather than shown disabled.

        Once a consolidation has completed the flow is withdrawn: the receipt
        above is the outcome, and re-offering execution against retired
        components would be meaningless.
      */}
      {!consolidationResult && preview.executable && (
        <Section title="Consolidate">
          <ConsolidationExecutionFlow
            findingId={findingId}
            preview={preview}
            canExecute={canExecute}
            onRefresh={(canonicalComponentId) =>
              load(canonicalComponentId ?? undefined)
            }
            onCompleted={(outcome) => {
              // Only reached after the backend confirmed the consolidation, so
              // the status this carries is the committed one, not an
              // optimistic guess.
              setConsolidationResult(outcome);
              onConsolidated?.(outcome);
            }}
          />
        </Section>
      )}

      {/* Eligibility */}
      <Section title="Eligibility">
        <div className="space-y-1 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={preview.eligibility.eligible ? "SUCCESS" : "DRAFT"}
              label={
                preview.eligibility.eligible
                  ? "ELIGIBLE FOR ANALYSIS"
                  : "NOT ELIGIBLE"
              }
            />
            {preview.eligibility.reasonCodes.map((code) => (
              <span
                key={code}
                className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {code}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {explainConsolidationEligibility(preview)}
          </p>
        </div>
      </Section>

      {/* Canonical selection */}
      <Section title="Canonical record">
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            The surviving record is chosen by the reviewer. The suggestion below
            is deterministic: active records first, then records that already
            hold inventory, then the oldest record.
          </p>
          <div className="space-y-1">
            {preview.canonicalCandidates.map((candidate) => {
              const selected =
                (canonicalChoice ?? preview.canonical.id) ===
                candidate.componentId;
              return (
                <button
                  key={candidate.componentId}
                  type="button"
                  onClick={() => {
                    setCanonicalChoice(candidate.componentId);
                    void load(candidate.componentId);
                  }}
                  className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card hover:bg-muted/40"
                  }`}
                >
                  {selected ? (
                    <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                  ) : (
                    <span className="mt-0.5 size-3 shrink-0 rounded-full border border-border" />
                  )}
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-xs font-medium text-foreground">
                      {candidate.componentId === preview.canonical.id
                        ? `${preview.canonical.sku} — ${preview.canonical.name}`
                        : (preview.sources.find(
                            (source) => source.id === candidate.componentId,
                          )?.sku ?? candidate.componentId)}
                    </span>
                    <span className="block text-[10px] text-muted-foreground">
                      {candidate.reason}
                      {candidate.hasInventory ? " · holds inventory" : ""}
                      {candidate.isActive ? "" : " · inactive"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Retiring:{" "}
            <span className="font-mono">
              {preview.sources.map((source) => source.sku).join(", ") || "—"}
            </span>
          </p>
        </div>
      </Section>

      {/* Impact summary */}
      <Section title="Impact summary">
        <dl className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-card">
          {impact.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[minmax(8rem,max-content)_minmax(0,1fr)] sm:gap-3"
            >
              <dt className="text-[11px] font-medium text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-xs text-foreground break-words">
                <span className="font-medium">{row.value}</span>
                {row.detail && (
                  <span className="block text-[10px] text-muted-foreground">
                    {row.detail}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* Conflicts */}
      <Section title="Conflicts and warnings">
        <div className="space-y-2">
          {groups.map((group) => {
            const styles = SEVERITY_STYLES[group.severity];
            return (
              <div
                key={group.severity}
                className={`space-y-2 rounded-lg border p-3 ${styles.container}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${styles.badge}`}
                  >
                    {styles.icon}
                    {group.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {group.conflicts.length} item(s)
                  </span>
                </div>
                <ul className="space-y-2">
                  {group.conflicts.map((conflict) => (
                    <li key={conflict.code} className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {conflict.code}
                        </span>
                        {conflict.resolutionRequired && (
                          <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {conflict.resolutionSupported
                              ? "Decision required"
                              : "No decision mechanism yet"}
                          </span>
                        )}
                        {typeof conflict.affectedCount === "number" && (
                          <span className="text-[10px] text-muted-foreground">
                            {conflict.affectedCount} record(s)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-medium text-foreground">
                        {conflict.title}
                      </p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {conflict.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Dependency impact */}
      <Section title="Dependency impact" count={dependencies.length}>
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-[40%] px-3 py-1.5 text-left font-medium">
                    Entity
                  </th>
                  <th className="w-[20%] px-2 py-1.5 text-left font-medium">
                    Action
                  </th>
                  <th className="w-[14%] px-2 py-1.5 text-right font-medium">
                    Rows
                  </th>
                  <th className="w-[26%] px-2 py-1.5 text-left font-medium">
                    Execution
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleDependencies.map((dependency) => (
                  <tr
                    key={dependency.id}
                    className={
                      dependency.blocking ? "bg-destructive/5" : undefined
                    }
                    title={dependency.supportNote}
                  >
                    <td className="px-3 py-1.5 align-top text-[11px] break-words text-foreground">
                      {dependency.label}
                    </td>
                    <td className="px-2 py-1.5 align-top text-[11px] text-muted-foreground">
                      {consolidationClassificationLabel(
                        dependency.classification,
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right align-top text-[11px] text-foreground">
                      {dependency.count}
                    </td>
                    <td className="px-2 py-1.5 align-top text-[11px]">
                      {dependency.executionSupport === "SUPPORTED" ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          Supported
                        </span>
                      ) : dependency.executionSupport === "UNSUPPORTED" ? (
                        <span className="text-destructive">Unsupported</span>
                      ) : (
                        <span className="text-muted-foreground">
                          Not applicable
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hiddenDependencies > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(true)}
            >
              <ChevronRight className="size-3" />
              Show all {dependencies.length} dependencies ({hiddenDependencies}{" "}
              not shown)
            </Button>
          )}
          {expanded && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setExpanded(false)}
            >
              <ChevronDown className="size-3" />
              Show fewer
            </Button>
          )}
          {preview.dependencyCoverage.ok ? (
            <p className="text-[10px] text-muted-foreground">
              Coverage verified:{" "}
              {preview.dependencyCoverage.registeredReferenceCount} registered
              references match{" "}
              {preview.dependencyCoverage.databaseReferenceCount} database
              references.
            </p>
          ) : (
            <p className="text-[10px] text-destructive">
              Registry drift detected: unregistered references{" "}
              {preview.dependencyCoverage.unregisteredReferences.join(", ")}.
            </p>
          )}
        </div>
      </Section>

      {/* Inventory */}
      <Section title="Inventory">
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Surviving record
              </p>
              <p className="text-xs font-medium text-foreground">
                {preview.inventory.canonical.totalQuantity}{" "}
                {preview.inventory.canonical.locations[0]?.unitOfMeasure ?? ""}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {preview.inventory.canonical.ledgerTransactionCount} ledger
                transaction(s)
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Retired record
              </p>
              <p className="text-xs font-medium text-foreground">
                {preview.inventory.source.totalQuantity}{" "}
                {preview.inventory.source.locations[0]?.unitOfMeasure ?? ""}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {preview.inventory.source.ledgerTransactionCount} ledger
                transaction(s)
              </p>
            </div>
          </div>

          {preview.inventory.byLocation.length > 0 && (
            <table className="w-full table-fixed border-collapse text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-1 py-1 text-left font-medium">Location</th>
                  <th className="px-1 py-1 text-right font-medium">
                    Surviving
                  </th>
                  <th className="px-1 py-1 text-right font-medium">Retired</th>
                  <th className="px-1 py-1 text-right font-medium">Combined</th>
                </tr>
              </thead>
              <tbody>
                {preview.inventory.byLocation.map((row) => (
                  <tr
                    key={row.locationId}
                    className="border-t border-border/70"
                  >
                    <td className="px-1 py-1 font-mono text-[10px] break-all text-muted-foreground">
                      {row.locationId}
                    </td>
                    <td className="px-1 py-1 text-right text-[11px] text-foreground">
                      {row.canonicalQuantity}
                    </td>
                    <td className="px-1 py-1 text-right text-[11px] text-foreground">
                      {row.sourceQuantity}
                    </td>
                    <td className="px-1 py-1 text-right text-[11px] font-medium text-foreground">
                      {row.combinedQuantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {preview.inventory.proposedReconciliation.length > 0 && (
            <div className="space-y-1 rounded border border-amber-500/30 bg-amber-500/5 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Proposed future reconciliation
              </p>
              <ul className="space-y-0.5">
                {preview.inventory.proposedReconciliation.map(
                  (entry, index) => (
                    <li
                      key={`${entry.action}-${entry.locationId}-${index}`}
                      className="font-mono text-[10px] text-muted-foreground"
                    >
                      {entry.action === "ISSUE_SOURCE" ? "−" : "+"}
                      {entry.quantity} {entry.unitOfMeasure} ·{" "}
                      {entry.locationId}
                    </li>
                  ),
                )}
              </ul>
              <p className="text-[10px] text-muted-foreground">
                Described only. Nothing is posted, and execution is blocked.
              </p>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            {preview.inventory.note}
          </p>
        </div>
      </Section>

      {/* Attributes */}
      <Section title="Attributes" count={preview.attributes.entries.length}>
        {attributeRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Neither record has comparable structured attributes.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-[30%] px-3 py-1.5 text-left font-medium">
                    Attribute
                  </th>
                  <th className="w-[24%] px-2 py-1.5 text-left font-medium">
                    Surviving
                  </th>
                  <th className="w-[24%] px-2 py-1.5 text-left font-medium">
                    Retired
                  </th>
                  <th className="w-[22%] px-2 py-1.5 text-left font-medium">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody>
                {attributeRows.map((row) => (
                  <tr
                    key={row.code}
                    className={
                      row.classification === "CONFLICTING"
                        ? "bg-amber-500/5"
                        : row.classification === "SOURCE_ONLY"
                          ? "bg-amber-500/5"
                          : undefined
                    }
                  >
                    <td className="px-3 py-1.5 align-top text-[11px] break-words text-foreground">
                      {row.label}
                    </td>
                    <td className="px-2 py-1.5 align-top text-[11px] break-words text-foreground">
                      {row.canonicalValue ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 align-top text-[11px] break-words text-foreground">
                      {row.sourceValue ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 align-top text-[11px]">
                      <span
                        className={
                          row.classification === "CONFLICTING"
                            ? "text-amber-700 dark:text-amber-400"
                            : row.classification === "SOURCE_ONLY"
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground"
                        }
                      >
                        {row.classification === "IDENTICAL"
                          ? "Same"
                          : row.classification === "CONFLICTING"
                            ? "Conflicts"
                            : row.classification === "SOURCE_ONLY"
                              ? "Retired only"
                              : "Surviving only"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          Attribute conflicts need a human decision. No value is ever chosen
          automatically, and this pass implements no resolution mechanism.
        </p>
      </Section>

      {/* Category and manufacturer */}
      <Section title="Classification and identity">
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-[11px]">
          <p>
            <span className="font-medium text-foreground">Category:</span>{" "}
            <span className="text-muted-foreground">
              {preview.category.canonicalCategoryName ?? "unassigned"} vs{" "}
              {preview.category.sourceCategoryName ?? "unassigned"} ·{" "}
              {preview.category.relation} · {preview.category.note}
            </span>
          </p>
          <p>
            <span className="font-medium text-foreground">Manufacturer:</span>{" "}
            <span className="text-muted-foreground">
              {preview.manufacturer.canonicalManufacturerName ?? "unassigned"}{" "}
              vs {preview.manufacturer.sourceManufacturerName ?? "unassigned"} ·{" "}
              {preview.manufacturer.relation}
              {preview.manufacturer.aliasResolved
                ? " · alias-resolved"
                : ""} · {preview.manufacturer.note}
            </span>
          </p>
        </div>
      </Section>

      {/* BOM */}
      <Section
        title="Bills of materials"
        count={
          preview.bom.canonicalLines.length + preview.bom.sourceLines.length
        }
      >
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-[11px]">
          {preview.bom.collisions.length === 0 ? (
            <p className="text-muted-foreground">
              No BOM lists both records, so no line collision exists.
            </p>
          ) : (
            <ul className="space-y-1">
              {preview.bom.collisions.map((collision) => (
                <li key={collision.bomId} className="text-foreground">
                  <span className="font-mono text-[10px]">
                    {collision.bomId}
                  </span>{" "}
                  — both records appear on this BOM (
                  {collision.canonicalQuantityPerUnit}/unit and{" "}
                  {collision.sourceQuantityPerUnit}/unit). Quantities are never
                  summed automatically.
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground">{preview.bom.note}</p>
        </div>
      </Section>

      {/* History, reservations, batches, serials, polymorphic */}
      <Section title="Other references">
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 text-[11px]">
          <p className="text-muted-foreground">
            Historical records preserved:{" "}
            <span className="text-foreground">
              {preview.historicalReferences.historicalCount}
            </span>{" "}
            · reserving/open procurement:{" "}
            <span className="text-foreground">
              {preview.procurement.openCount + preview.reservations.openCount}
            </span>{" "}
            · batches:{" "}
            <span className="text-foreground">
              {preview.batches.reconcileCount}
            </span>{" "}
            · serials:{" "}
            <span className="text-foreground">
              {preview.serials.reconcileCount}
            </span>
          </p>
          {preview.polymorphicReferences.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Polymorphic references (unsupported)
              </p>
              <ul className="space-y-0.5">
                {preview.polymorphicReferences.map((reference) => (
                  <li key={reference.id} className="text-muted-foreground">
                    {reference.label}:{" "}
                    {reference.canonicalCount + reference.sourceCount} row(s) ·
                    no defined consolidation semantics
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-muted-foreground">
            {preview.history.relatedFindingCount} other finding(s) and{" "}
            {preview.history.feedbackCount} feedback record(s) involve these
            components and would need reconciling.
          </p>
        </div>
      </Section>

      {/* Retirement limitation */}
      <Section title="Retirement">
        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px]">
          <p className="text-foreground">
            {preview.retirement.supportedMechanism}
          </p>
          {preview.retirement.missingSemantics.length > 0 && (
            <ul className="space-y-0.5">
              {preview.retirement.missingSemantics.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-1.5 text-muted-foreground"
                >
                  <Ban className="mt-0.5 size-3 shrink-0 text-destructive" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-muted-foreground">{preview.retirement.note}</p>
        </div>
      </Section>

      {/* Proposed changes (all unsupported) */}
      {preview.proposedChanges.length > 0 && (
        <Section title="Proposed changes (none applied)">
          <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-card">
            {preview.proposedChanges.map((change) => (
              <li
                key={`${change.action}-${change.entity}`}
                className="space-y-0.5 px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {change.action}
                  </span>
                  <span className="text-[11px] font-medium text-foreground">
                    {change.recordCount} record(s)
                  </span>
                </div>
                <p className="text-[10px] break-words text-muted-foreground">
                  {change.entity}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {change.note}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Fingerprint and versions */}
      <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-[10px] text-muted-foreground">
        <p>
          Preview fingerprint:{" "}
          <span className="font-mono break-all">
            {preview.previewFingerprint}
          </span>
        </p>
        <p>
          Preview version{" "}
          <span className="font-mono">{preview.previewVersion}</span> ·
          intelligence{" "}
          <span className="font-mono">{preview.intelligenceVersion}</span>
        </p>
        <p>
          Every relevant state change invalidates this fingerprint, so a stale
          analysis cannot be mistaken for a current one.
        </p>
      </div>

      {/* Related findings, for navigation */}
      {preview.history.relatedFindings.length > 0 && (
        <Section
          title="Related duplicate findings"
          count={preview.history.relatedFindings.length}
        >
          <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-card text-[11px]">
            {preview.history.relatedFindings.slice(0, 5).map((finding) => (
              <li key={finding.id} className="px-3 py-1.5">
                <Link
                  href={`/components/${finding.componentId}`}
                  className="text-primary hover:underline"
                >
                  {finding.issueType}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {finding.status}
                  {finding.matchType ? ` · ${finding.matchType}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
