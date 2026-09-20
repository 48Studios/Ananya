"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Package,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConsolidationPreviewPanel } from "./component-consolidation-preview-panel";
import type {
  ComponentReviewFindingDto,
  ConsolidationResultDto,
} from "@/lib/api/component-review-queue-api";
import {
  buildDuplicateAttributeRows,
  buildDuplicateSideBySideRows,
  componentHref,
  describeDuplicateDifferences,
  describeDuplicateIdentity,
  describeDuplicateMatches,
  describeDuplicateSignals,
  describeManufacturerConflict,
  describePackagingVariant,
  duplicateReviewGuidance,
  summarizeDuplicateSimilarity,
  type DuplicateAttributeRow,
  type ComparisonEmphasis,
  type DuplicateDifference,
  type ReviewReferenceMaps,
} from "@/lib/component-review-queue";

/**
 * Duplicate investigation panel (Pass 5C).
 *
 * Renders inside the existing Component Intelligence detail dialog and explains
 * a duplicate finding to a reviewer: which two records are compared, which rule
 * matched, what is identical, what differs, and how strong the evidence is.
 *
 * Read-only: it offers no merge, delete, or consolidate action. Every number and
 * sentence comes from the persisted finding - nothing is inferred or invented.
 */

interface DuplicateInvestigationProps {
  finding: ComponentReviewFindingDto;
  refs: ReviewReferenceMaps;
  /** Records the existing REJECTED decision (presented as "Not a duplicate"). */
  onNotADuplicate?: () => void;
  /** Hides the shortcut when the reviewer cannot decide. */
  canDecide?: boolean;
  /**
   * Whether the consolidation analysis section may load.
   *
   * That endpoint requires the component-write permission, so the panel is only
   * requested for reviewers who have it. The analysis is read-only regardless.
   */
  canAnalyzeConsolidation?: boolean;
  /**
   * Called after a successful consolidation, carrying the backend's result so
   * the caller can reconcile state from it rather than from a guess.
   */
  onConsolidated?: (result: ConsolidationResultDto) => void;
}

const EMPHASIS_ROW_CLASS: Record<ComparisonEmphasis, string | undefined> = {
  match: "bg-emerald-500/5",
  difference: "bg-amber-500/5",
  neutral: undefined,
};

function RuleChip({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

/** Side-by-side identity fields for both records. */
function SideBySideTable({
  finding,
  refs,
}: {
  finding: ComponentReviewFindingDto;
  refs: ReviewReferenceMaps;
}) {
  const rows = buildDuplicateSideBySideRows(finding, refs);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        The related component is no longer available for comparison.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-2 divide-x divide-border/70 border-b border-border bg-muted/40">
        {[
          { label: "This component", component: finding.component },
          { label: "Related component", component: finding.relatedComponent },
        ].map((side) => (
          <div key={side.label} className="min-w-0 space-y-1 px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {side.label}
            </span>
            {side.component ? (
              <Link
                href={componentHref(side.component.id)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <span className="font-mono">{side.component.sku}</span>
                <ExternalLink className="size-2.5" />
                <span className="sr-only">View component</span>
              </Link>
            ) : (
              <span className="text-[11px] text-muted-foreground">—</span>
            )}
          </div>
        ))}
      </div>

      <div className="divide-y divide-border/70">
        {rows.map((row) => (
          <div key={row.label} className={EMPHASIS_ROW_CLASS[row.emphasis]}>
            <div className="grid grid-cols-2 gap-3 px-3 pt-2">
              <p
                className={`text-xs break-words ${
                  row.identity
                    ? "font-medium text-foreground"
                    : "text-foreground"
                }`}
              >
                {row.current}
              </p>
              <p className="text-xs font-medium break-words text-foreground">
                {row.related}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
              <span
                className={`text-[11px] font-semibold ${
                  row.identity ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {row.label}
              </span>
              {row.emphasis === "match" && (
                <span className="inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="size-2.5" />
                  Match
                </span>
              )}
              {row.emphasis === "difference" && (
                <span className="inline-flex items-center gap-1 rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-2.5" />
                  Differs
                </span>
              )}
              {row.note && (
                <span className="text-[10px] text-muted-foreground">
                  {row.note}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Differences first.
 *
 * Potential duplicates lead with what is *not* identical, so a reviewer never
 * has to scroll through matching fields to find the reason the pair is only a
 * candidate. Exact duplicates show the authoritative identity match first and
 * treat later differences as data-quality inconsistencies.
 */
function DifferenceList({
  differences,
}: {
  differences: DuplicateDifference[];
}) {
  if (differences.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        No differing identity field was recorded between the two records.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-amber-500/30 bg-amber-500/5">
      {differences.map((difference) => (
        <li key={difference.label} className="space-y-0.5 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="size-3 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-[11px] font-semibold text-foreground">
              {difference.label} differs
            </span>
          </div>
          <p className="pl-5 text-xs text-muted-foreground">
            <span className="text-foreground">{difference.current}</span>
            <span className="px-1.5 text-muted-foreground">→</span>
            <span className="text-foreground">{difference.related}</span>
            {difference.note && (
              <span className="text-muted-foreground">
                {" "}
                · {difference.note}
              </span>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

function AttributeComparisonTable({
  rows,
  expanded,
  onToggle,
}: {
  rows: DuplicateAttributeRow[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const VISIBLE_WHEN_COLLAPSED = 5;
  if (rows.length === 0) return null;

  const visible = expanded ? rows : rows.slice(0, VISIBLE_WHEN_COLLAPSED);
  const hiddenCount = rows.length - visible.length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Specification comparison ({rows.length})
        </h4>
        {rows.length > VISIBLE_WHEN_COLLAPSED && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onToggle}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            {expanded ? "Show fewer" : `Show all ${rows.length}`}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-[34%] px-3 py-1.5 text-left font-medium">
                Attribute
              </th>
              <th className="w-[26%] px-2 py-1.5 text-left font-medium">
                This
              </th>
              <th className="w-[26%] px-2 py-1.5 text-left font-medium">
                Related
              </th>
              <th className="w-[14%] px-2 py-1.5 text-left font-medium">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.code}
                className={
                  row.result === "different"
                    ? "bg-amber-500/5"
                    : "bg-emerald-500/5"
                }
              >
                <td className="px-3 py-1.5 align-top text-[11px] font-medium text-foreground break-words">
                  {row.label}
                </td>
                <td className="px-2 py-1.5 align-top text-[11px] break-words text-foreground">
                  {row.current || "—"}
                </td>
                <td className="px-2 py-1.5 align-top text-[11px] break-words text-foreground">
                  {row.related || "—"}
                </td>
                <td className="px-2 py-1.5 align-top text-[11px] font-medium">
                  {row.result === "match" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <Check className="size-2.5" />
                      Match
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-2.5" />
                      Diff
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!expanded && hiddenCount > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {hiddenCount} matching specification{hiddenCount === 1 ? "" : "s"} not
          shown.
        </p>
      )}
    </div>
  );
}

export function DuplicateInvestigation({
  finding,
  refs,
  onNotADuplicate,
  canDecide = false,
  canAnalyzeConsolidation = false,
  onConsolidated,
}: DuplicateInvestigationProps) {
  const [attributesExpanded, setAttributesExpanded] = React.useState(false);

  const identity = describeDuplicateIdentity(finding);
  const differences = describeDuplicateDifferences(finding, refs);
  const matches = describeDuplicateMatches(finding, refs);
  const similarity = summarizeDuplicateSimilarity(finding);
  const signals = describeDuplicateSignals(finding);
  const packaging = describePackagingVariant(finding);
  const manufacturerConflict = describeManufacturerConflict(finding, refs);
  const attributeRows = buildDuplicateAttributeRows(finding);
  const sameMpn =
    finding.issueType === "EXACT_DUPLICATE" ||
    identity.matchType === "MPN_MANUFACTURER_CONFLICT";
  const attributeDifferences = attributeRows.filter(
    (row) => row.result === "different",
  ).length;

  return (
    <div className="space-y-4">
      {/* Identity summary */}
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={
              identity.verdict === "Exact duplicate" ? "SUCCESS" : "IN_REVIEW"
            }
            label={identity.verdict.toUpperCase()}
          />
          <RuleChip
            label={identity.originLabel}
            tone={
              identity.origin === "deterministic"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            }
          />
          <RuleChip
            label={identity.matchTypeLabel}
            tone="border-border bg-card text-foreground"
          />
          {finding.confidenceLevel && (
            <StatusBadge
              status={
                finding.confidenceLevel === "HIGH"
                  ? "SUCCESS"
                  : finding.confidenceLevel === "MEDIUM"
                    ? "IN_REVIEW"
                    : "DRAFT"
              }
              label={`${finding.confidenceLevel} CONFIDENCE`}
            />
          )}
        </div>
        <p className="text-xs leading-relaxed text-foreground">
          {identity.rule}
        </p>
        {identity.supporting.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">
              Other rules also matched:
            </span>{" "}
            {identity.supporting.map((rule) => rule.label).join(", ")}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {duplicateReviewGuidance(finding)}
        </p>
      </div>

      {/* Rule-specific explanations */}
      {packaging && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5">
            <Package className="size-3.5 text-muted-foreground" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Packaging variant
            </h4>
          </div>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-0.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Base part number
              </dt>
              <dd className="font-mono text-xs font-medium break-all text-foreground">
                {packaging.baseMpn}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Packaging variant
              </dt>
              <dd className="font-mono text-xs font-medium break-all text-foreground">
                {packaging.variantMpn}
              </dd>
            </div>
          </dl>
          {packaging.removedSuffix && (
            <p className="text-[11px] text-muted-foreground">
              Suffix interpreted as packaging:{" "}
              <span className="font-mono text-foreground">
                {packaging.removedSuffix}
              </span>
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">{packaging.note}</p>
        </div>
      )}

      {manufacturerConflict && (
        <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-amber-700 dark:text-amber-400" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200">
              Same part number, different manufacturers
            </h4>
          </div>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-0.5">
              <dt className="text-[10px] uppercase tracking-wider text-amber-900/80 dark:text-amber-200/80">
                This component
              </dt>
              <dd className="text-xs font-medium text-foreground">
                {manufacturerConflict.currentManufacturer}
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-[10px] uppercase tracking-wider text-amber-900/80 dark:text-amber-200/80">
                Related component
              </dt>
              <dd className="text-xs font-medium text-foreground">
                {manufacturerConflict.relatedManufacturer}
              </dd>
            </div>
          </dl>
          <p className="text-[11px] text-amber-900 dark:text-amber-200">
            {manufacturerConflict.note}
          </p>
        </div>
      )}

      {/* Differences, shown first for potential duplicates */}
      {finding.issueType !== "EXACT_DUPLICATE" && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Why this is only a potential duplicate ({differences.length})
          </h4>
          <DifferenceList differences={differences} />
        </div>
      )}

      {/* Side-by-side comparison */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Side-by-side comparison
        </h4>
        <SideBySideTable finding={finding} refs={refs} />
      </div>

      {/* Exact duplicate: authoritative match first, then inconsistencies */}
      {finding.issueType === "EXACT_DUPLICATE" && (
        <div className="space-y-2">
          {sameMpn && (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-emerald-500/30 bg-emerald-500/5">
              {matches.map((match) => (
                <li
                  key={match.label}
                  className="flex flex-wrap items-center gap-2 px-3 py-1.5"
                >
                  <Check className="size-3 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  <span className="text-[11px] font-semibold text-foreground">
                    {match.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {match.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {differences.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recorded inconsistencies ({differences.length})
              </h4>
              <p className="text-[11px] text-muted-foreground">
                The identity match is authoritative, but these fields disagree:
                the records are inconsistent and one of them is probably wrong.
              </p>
              <DifferenceList differences={differences} />
            </div>
          )}
        </div>
      )}

      {/* Similarity detail for semantic candidates */}
      {similarity && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Scale className="size-3.5 text-muted-foreground" />
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Similarity
            </h4>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
            {similarity.scorePercent !== null && (
              <span className="text-lg font-semibold text-foreground">
                {similarity.scorePercent}%
              </span>
            )}
            {similarity.nameSimilarityPercent !== null && (
              <span className="text-[11px] text-muted-foreground">
                Name similarity {similarity.nameSimilarityPercent}%
              </span>
            )}
            {similarity.sharedTokens.length > 0 && (
              <span className="flex flex-wrap items-center gap-1">
                {similarity.sharedTokens.slice(0, 6).map((token) => (
                  <span
                    key={token}
                    className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  >
                    {token}
                  </span>
                ))}
              </span>
            )}
          </div>

          {signals.matched.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
              {signals.matched.map((signal) => (
                <li
                  key={signal}
                  className="flex items-center gap-1.5 text-[11px]"
                >
                  <Check className="size-3 shrink-0 text-emerald-700 dark:text-emerald-400" />
                  <span className="text-foreground">{signal}</span>
                </li>
              ))}
            </ul>
          )}

          {signals.penalized.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              {signals.penalized.map((signal) => (
                <li
                  key={signal}
                  className="flex items-center gap-1.5 text-[11px]"
                >
                  <AlertTriangle className="size-3 shrink-0 text-amber-700 dark:text-amber-400" />
                  <span className="text-foreground">{signal}</span>
                </li>
              ))}
            </ul>
          )}

          {similarity.scorePercent === null && (
            <p className="text-[11px] text-muted-foreground">
              No overall similarity score was recorded for this candidate.
            </p>
          )}
        </div>
      )}

      {/* Structured specification comparison */}
      <AttributeComparisonTable
        rows={attributeRows}
        expanded={attributesExpanded}
        onToggle={() => setAttributesExpanded((value) => !value)}
      />

      {/* Consolidation analysis (read-only) */}
      <div className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Consolidation preview
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Analyses what consolidating these two records would affect and exactly
          what still blocks it. When nothing blocks, consolidation can be
          executed from here after an explicit confirmation.
        </p>
        <ConsolidationPreviewPanel
          findingId={finding.id}
          enabled={canAnalyzeConsolidation}
          canExecute={canAnalyzeConsolidation}
          // The finding's lifecycle is part of the preview fingerprint, so any
          // review decision must invalidate the analysis already on screen.
          findingRevision={`${finding.status}:${finding.updatedAt}`}
          onConsolidated={onConsolidated}
        />
      </div>

      {/* Review-only reinforcement and the reason-specific shortcut */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          Duplicate findings are review-only. This queue does not merge, rename,
          or delete components
          {attributeDifferences > 0 && finding.issueType === "EXACT_DUPLICATE"
            ? "; the inconsistent fields above need a data-quality fix."
            : "."}
        </p>
        {canDecide && onNotADuplicate && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={onNotADuplicate}
          >
            Not a duplicate
          </Button>
        )}
      </div>
    </div>
  );
}
