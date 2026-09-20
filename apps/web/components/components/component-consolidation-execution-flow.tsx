"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  componentReviewQueueApi,
  type ConsolidationAttributeResolutionPayload,
  type ConsolidationBomResolutionPayload,
  type ConsolidationPreviewDto,
  type ConsolidationResultDto,
} from "@/lib/api/component-review-queue-api";

/**
 * Consolidation execution flow (Pass 6B).
 *
 * This is a two-step confirmation deliberately, not one button:
 *
 *  1. the panel shows "Ready to consolidate" with the surviving and retired
 *     records, and a `Review and consolidate` action that opens the confirmation,
 *  2. the confirmation states what will change and requires an explicit
 *     acknowledgement before `Consolidate` becomes available.
 *
 * Nothing here decides anything. The backend recomputes the preview inside the
 * consolidation transaction, verifies the fingerprint, and refuses if the state
 * moved — so a stale confirmation can never execute.
 *
 * When a decision is still outstanding the flow is not offered at all; the
 * caller only renders this component for an executable preview.
 */

interface ConsolidationExecutionFlowProps {
  findingId: string;
  preview: ConsolidationPreviewDto;
  /** Re-runs the preview; used after a refusal that invalidated the analysis. */
  onRefresh: (canonicalComponentId?: string) => void | Promise<void>;
  /** Called after a successful consolidation so the queue can be refreshed. */
  onCompleted?: (result: ConsolidationResultDto) => void;
  canExecute: boolean;
}

/** Attribute decisions the reviewer has recorded, keyed by definition id. */
type AttributeDecisions = Record<
  string,
  ConsolidationAttributeResolutionPayload["strategy"]
>;

/** BOM collision decisions the reviewer has recorded, keyed by BOM id. */
type BomDecisions = Record<
  string,
  ConsolidationBomResolutionPayload["scrapFactorResolution"]["strategy"]
>;

/**
 * Confirmation that a consolidation was applied.
 *
 * Exported separately from the execution flow because the flow is only mounted
 * while the preview is executable. Consolidating retires the source records, so
 * the preview that comes back is no longer executable and the flow unmounts —
 * rendering the receipt from the flow alone would erase it the moment the state
 * it describes settled. The owning panel renders this from the consolidation
 * response, which is the authoritative record of what happened, both before and
 * after its refresh.
 *
 * `data-consolidation-receipt` is a stable hook for the regression specs; it is
 * not styling.
 */
export function ConsolidationSuccessSummary({
  result,
}: {
  result: ConsolidationResultDto;
}) {
  return (
    <div
      data-consolidation-receipt={result.consolidationId}
      className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        <p className="text-xs font-semibold text-foreground">
          Consolidation complete
        </p>
      </div>

      {result.idempotentReplay && (
        <p className="text-[11px] text-muted-foreground">
          This request had already been applied, so the existing result was
          returned. Inventory was not moved a second time.
        </p>
      )}

      <dl className="space-y-1 text-[11px]">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Consolidation ID:</dt>
          <dd className="font-mono break-all text-foreground">
            {result.consolidationId}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Canonical:</dt>
          <dd className="text-foreground">
            <Link
              href={`/components/${result.canonical.id}`}
              className="text-primary hover:underline"
            >
              {result.canonical.sku}
            </Link>
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">Consolidated:</dt>
          <dd className="text-foreground">
            {result.sources.map((source) => source.sku).join(", ")}
          </dd>
        </div>
      </dl>

      {result.warnings.length > 0 && (
        <ul className="space-y-0.5 text-[10px] text-muted-foreground">
          {result.warnings.map((warning) => (
            <li key={warning}>· {warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConsolidationExecutionFlow({
  findingId,
  preview,
  onRefresh,
  onCompleted,
  canExecute,
}: ConsolidationExecutionFlowProps) {
  const [stage, setStage] = React.useState<"idle" | "confirming">("idle");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ConsolidationResultDto | null>(
    null,
  );

  const [attributeDecisions, setAttributeDecisions] =
    React.useState<AttributeDecisions>({});
  const [bomDecisions, setBomDecisions] = React.useState<BomDecisions>({});
  const [scrapValues, setScrapValues] = React.useState<Record<string, string>>(
    {},
  );

  // Any change to the preview invalidates a confirmation that was already open.
  React.useEffect(() => {
    setStage("idle");
    setAcknowledged(false);
    setError(null);
  }, [preview.previewFingerprint]);

  const canonicalId = preview.canonical.id;
  const sourceIds = preview.sources.map((source) => source.id);

  const undecidedAttributes = preview.attributes.entries.filter(
    (entry) =>
      entry.resolutionRequired &&
      !attributeDecisions[entry.attributeDefinitionId],
  );
  const undecidedBoms = preview.bom.collisions.filter(
    (collision) => !bomDecisions[collision.bomId],
  );
  const decisionsComplete =
    undecidedAttributes.length === 0 && undecidedBoms.length === 0;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const attributeResolutions: ConsolidationAttributeResolutionPayload[] =
        Object.entries(attributeDecisions).map(
          ([attributeDefinitionId, strategy]) => ({
            attributeDefinitionId,
            strategy,
          }),
        );

      const bomResolutions: ConsolidationBomResolutionPayload[] =
        Object.entries(bomDecisions).map(([bomId, strategy]) => ({
          bomId,
          resolution: "COMBINE" as const,
          scrapFactorResolution:
            strategy === "EXPLICIT"
              ? {
                  strategy,
                  value: Number(scrapValues[bomId] ?? 0),
                }
              : { strategy },
        }));

      const outcome = await componentReviewQueueApi.consolidateComponent(
        findingId,
        {
          expectedPreviewFingerprint: preview.previewFingerprint,
          canonicalComponentId: canonicalId,
          sourceComponentIds: sourceIds,
          attributeResolutions,
          bomResolutions,
          decisionNotes: notes.trim() || undefined,
          confirmation: true,
        },
      );

      setResult(outcome);
      onCompleted?.(outcome);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Consolidation was refused. Nothing was changed.";
      setError(message);
      // A refusal most often means the state moved, so the analysis is
      // refreshed rather than leaving the reviewer looking at stale facts.
      await onRefresh(canonicalId);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------
  // Result
  // ---------------------------------------------------------------------
  if (result) {
    return <ConsolidationSuccessSummary result={result} />;
  }

  // ---------------------------------------------------------------------
  // Ready, not yet confirming
  // ---------------------------------------------------------------------
  if (stage === "idle") {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          <p className="text-xs font-semibold text-foreground">
            {decisionsComplete
              ? "Ready to consolidate"
              : "Decisions still needed"}
          </p>
          {!decisionsComplete && (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
              {undecidedAttributes.length + undecidedBoms.length} undecided
            </span>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {canonicalId === preview.canonical.id
            ? `${preview.sources.map((s) => s.sku).join(", ")} will be retired into ${preview.canonical.sku}.`
            : `${preview.sources.map((s) => s.sku).join(", ")} will be retired.`}{" "}
          Nothing is changed until you confirm.
        </p>

        <Button
          type="button"
          size="sm"
          disabled={!canExecute || !decisionsComplete}
          onClick={() => setStage("confirming")}
        >
          Review and consolidate
        </Button>

        {!canExecute && (
          <p className="text-[10px] text-muted-foreground">
            You need the Inventory.Update permission to consolidate components.
          </p>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Confirmation
  // ---------------------------------------------------------------------
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="text-xs font-semibold text-foreground">
        Confirm consolidation
      </p>

      <dl className="space-y-1.5 text-[11px]">
        <div>
          <dt className="text-muted-foreground">Canonical (survives)</dt>
          <dd className="text-foreground">
            <Link
              href={`/components/${canonicalId}`}
              className="text-primary hover:underline"
            >
              {preview.canonical.sku}
            </Link>{" "}
            <span className="text-muted-foreground">
              {preview.canonical.name}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Retired (stays queryable)</dt>
          <dd className="text-foreground">
            {preview.sources.map((source) => (
              <div key={source.id}>
                <Link
                  href={`/components/${source.id}`}
                  className="text-primary hover:underline"
                >
                  {source.sku}
                </Link>{" "}
                <span className="text-muted-foreground">{source.name}</span>
              </div>
            ))}
          </dd>
        </div>
      </dl>

      <div className="space-y-1 text-[11px]">
        <p className="font-medium text-foreground">What will change</p>
        <ul className="space-y-0.5 text-muted-foreground">
          <li>
            · Inventory:{" "}
            {preview.inventory.combinedTotalQuantity === 0
              ? "no balances to move"
              : `${preview.inventory.combinedTotalQuantity} unit(s) moved through the ledger`}
          </li>
          <li>
            · Attributes:{" "}
            {preview.attributes.entries.length === 0
              ? "none"
              : `${preview.attributes.entries.length} compared, ${undecidedAttributes.length} still to decide`}
          </li>
          <li>
            · BOM:{" "}
            {preview.bom.collisionCount + preview.bom.sourceOnlyCount === 0
              ? "no BOM lines affected"
              : `${preview.bom.sourceOnlyCount} line(s) repointed, ${preview.bom.collisionCount} combined`}
          </li>
          <li>
            · References: {preview.procurement.openCount} procurement,{" "}
            {preview.reservations.openCount} reservation,{" "}
            {preview.serials.count} serial and {preview.batches.count} batch
            record(s) considered
          </li>
          <li>
            · The retired component keeps all history and is never deleted.
          </li>
        </ul>
      </div>

      {/* Decisions the reviewer must make before the operation can run. */}
      {undecidedAttributes.length > 0 && (
        <div className="space-y-2 rounded border border-border bg-card p-2">
          <p className="text-[11px] font-medium text-foreground">
            Attribute decisions ({undecidedAttributes.length})
          </p>
          <p className="text-[10px] text-muted-foreground">
            Consolidation never picks a value silently. Choose what happens to
            each differing attribute.
          </p>
          <ul className="space-y-2">
            {undecidedAttributes.map((entry) => (
              <li key={entry.attributeDefinitionId} className="space-y-1">
                <p className="text-[10px] text-foreground">{entry.label}</p>
                <p className="text-[10px] text-muted-foreground">
                  {entry.classification === "CONFLICTING"
                    ? `Surviving: ${entry.canonicalValue ?? "—"} · retired: ${entry.sourceValue ?? "—"}`
                    : `Only on the retired record: ${entry.sourceValue ?? "—"}`}
                </p>
                <select
                  className="w-full rounded border border-border bg-card px-1.5 py-1 text-[10px] text-foreground"
                  value={attributeDecisions[entry.attributeDefinitionId] ?? ""}
                  onChange={(event) =>
                    setAttributeDecisions((current) => ({
                      ...current,
                      [entry.attributeDefinitionId]: event.target
                        .value as ConsolidationAttributeResolutionPayload["strategy"],
                    }))
                  }
                >
                  <option value="" disabled>
                    Choose a resolution...
                  </option>
                  {entry.classification === "CONFLICTING" && (
                    <option value="KEEP_CANONICAL_VALUE">
                      Keep the surviving record&apos;s value
                    </option>
                  )}
                  <option value="KEEP_SOURCE_VALUE">
                    Adopt the retired record&apos;s value
                  </option>
                  <option value="DISCARD_SOURCE_VALUE">
                    Discard the retired record&apos;s value
                  </option>
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {undecidedBoms.length > 0 && (
        <div className="space-y-2 rounded border border-border bg-card p-2">
          <p className="text-[11px] font-medium text-foreground">
            BOM line decisions ({undecidedBoms.length})
          </p>
          <p className="text-[10px] text-muted-foreground">
            Both records appear in the same bill of materials. The lines will be
            combined into one whose quantity is{" "}
            <span className="font-mono">source + surviving</span>; the scrap
            factor must be chosen explicitly.
          </p>
          <ul className="space-y-2">
            {undecidedBoms.map((collision) => (
              <li
                key={collision.bomId}
                className="space-y-1 rounded border border-border/70 p-2"
              >
                <p className="text-[10px] text-foreground">
                  Combined quantity per unit:{" "}
                  <span className="font-mono">
                    {collision.combinedQuantityPerUnit}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ({collision.canonicalQuantityPerUnit} +{" "}
                    {collision.sourceQuantityPerUnit})
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Scrap factor — surviving:{" "}
                  {collision.canonicalScrapFactorPercent}%, retired:{" "}
                  {collision.sourceScrapFactorPercent}%
                </p>
                <select
                  className="w-full rounded border border-border bg-card px-1.5 py-1 text-[10px] text-foreground"
                  value={bomDecisions[collision.bomId] ?? ""}
                  onChange={(event) =>
                    setBomDecisions((current) => ({
                      ...current,
                      [collision.bomId]: event.target
                        .value as ConsolidationBomResolutionPayload["scrapFactorResolution"]["strategy"],
                    }))
                  }
                >
                  <option value="" disabled>
                    Choose a scrap factor...
                  </option>
                  <option value="USE_CANONICAL">
                    Use the surviving record&apos;s scrap factor
                  </option>
                  <option value="USE_SOURCE">
                    Use the retired record&apos;s scrap factor
                  </option>
                  <option value="EXPLICIT">Enter a value</option>
                </select>
                {bomDecisions[collision.bomId] === "EXPLICIT" && (
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded border border-border bg-card px-1.5 py-1 text-[10px] text-foreground"
                    placeholder="Scrap factor percent"
                    value={scrapValues[collision.bomId] ?? ""}
                    onChange={(event) =>
                      setScrapValues((current) => ({
                        ...current,
                        [collision.bomId]: event.target.value,
                      }))
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.executionBlockedReasons.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No warnings. Everything above is migrated inside one transaction: if
          any part fails, nothing changes.
        </p>
      ) : (
        <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2">
          <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-700 dark:text-amber-400" />
          <div className="space-y-0.5 text-[10px] text-amber-700 dark:text-amber-400">
            {preview.executionBlockedReasons.map((reason) => (
              <p key={reason.code}>{reason.description}</p>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 text-[11px] text-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
        />
        <span>
          I understand the retired component will be permanently consolidated
          and can no longer receive inventory or be edited.
        </span>
      </label>

      <label className="block space-y-1 text-[11px]">
        <span className="text-muted-foreground">
          Decision notes (recorded on the finding and the consolidation)
        </span>
        <textarea
          className="w-full rounded border border-border bg-card p-2 text-[11px] text-foreground"
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={!acknowledged || submitting}
          onClick={() => void submit()}
        >
          {submitting && <Loader2 className="size-3 animate-spin" />}
          Consolidate components
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={() => {
            setStage("idle");
            setAcknowledged(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
