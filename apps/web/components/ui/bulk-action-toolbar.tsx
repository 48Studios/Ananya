"use client";

import * as React from "react";
import {
  Archive,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import {
  importExportApi,
  getEntityLabel,
  type BulkActionType,
  type BulkActionResultDto,
} from "@/lib/api/import-export-api";
import type { EntityType } from "@/lib/api/barcodes-api";
import { Button } from "@/components/ui/button";
import {
  BULK_ACTION_LABELS,
  BULK_ACTION_LOADING_NOTE,
  BULK_ACTION_MAX_IDS,
  BULK_ACTION_NO_RECORD_IDS_NOTE,
  BULK_ACTION_UNSUPPORTED_NOTE,
  bulkActionDetailRows,
  orderBulkActions,
  summarizeBulkActionResult,
} from "@/lib/bulk-actions";

const ACTION_ICONS: Partial<
  Record<BulkActionType, React.ComponentType<{ className?: string }>>
> = {
  ARCHIVE: Archive,
  UPDATE_STATUS: CheckCircle,
  DELETE: Trash2,
};

export interface BulkActionToolbarProps {
  /** Import/export entity type of the table, when the page declares one. */
  entityType?: string;
  selectedIds: string[];
  /** Human name per selected id, so an outcome can name the record. */
  rowLabels?: Record<string, string>;
  /** False when a selected row carries no record id. */
  selectionHasRecordIds?: boolean;
  /** Barcode entity type for label printing, when this table supports it. */
  labelEntityType?: EntityType | null;
  onPrintLabels?: () => void;
  onClearSelection: () => void;
  onActionComplete: () => void;
}

/**
 * The floating batch bar.
 *
 * Two rules shape it. It renders only the actions the API reports as supported
 * for this entity type, so a button can never be a no-op. And it reports what
 * actually happened per record — a refused record stays selected with its
 * reason instead of being counted as a success.
 */
export function BulkActionToolbar({
  entityType,
  selectedIds,
  rowLabels,
  selectionHasRecordIds = true,
  labelEntityType,
  onPrintLabels,
  onClearSelection,
  onActionComplete,
}: BulkActionToolbarProps) {
  const [supportedActions, setSupportedActions] = React.useState<
    BulkActionType[] | null
  >(null);
  const [loading, setLoading] = React.useState(false);
  const [activeAction, setActiveAction] = React.useState<BulkActionType | null>(
    null,
  );
  const [result, setResult] = React.useState<BulkActionResultDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showDetails, setShowDetails] = React.useState(false);

  const displayLabel = entityType ? getEntityLabel(entityType) : "";

  React.useEffect(() => {
    if (!entityType) {
      setSupportedActions([]);
      return;
    }

    let isMounted = true;
    setSupportedActions(null);
    importExportApi
      .getSupportedBulkActions(entityType)
      .then((support) => {
        if (isMounted) setSupportedActions(support.supportedActions);
      })
      .catch(() => {
        // The table still selects rows; it just has nothing to offer.
        if (isMounted) setSupportedActions([]);
      });

    return () => {
      isMounted = false;
    };
  }, [entityType]);

  // The bar stays visible after a run even when the selection empties, because
  // the reviewer still has to read what happened.
  if (selectedIds.length === 0 && !result) return null;

  const tooManySelected = selectedIds.length > BULK_ACTION_MAX_IDS;
  const actions = orderBulkActions(supportedActions ?? []);
  const detailRows = result ? bulkActionDetailRows(result) : [];

  const handleBulkExecute = async (action: BulkActionType) => {
    if (!entityType) return;
    setLoading(true);
    setActiveAction(action);
    setResult(null);
    setError(null);
    setShowDetails(false);
    try {
      const res = await importExportApi.executeBulkAction({
        entityType,
        action,
        ids: selectedIds,
      });
      setResult(res);
      setShowDetails(bulkActionDetailRows(res).length > 0);
      // Refresh the page's data: applied records are gone or changed, refused
      // ones stay selected so the reviewer can act on them again.
      onActionComplete();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to execute batch action",
      );
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  const handleDismiss = () => {
    setResult(null);
    setError(null);
    setShowDetails(false);
    onClearSelection();
  };

  /**
   * The action controls stay available while an outcome is on screen: a run
   * that left records selected (they were refused, or they were not deleted)
   * can be followed by another action without re-selecting them.
   */
  const renderActionControls = () => {
    if (selectedIds.length === 0) return null;

    if (!selectionHasRecordIds) {
      return (
        <span className="text-muted-foreground">
          {BULK_ACTION_NO_RECORD_IDS_NOTE}
        </span>
      );
    }
    if (tooManySelected) {
      return (
        <span className="text-muted-foreground">
          Select at most {BULK_ACTION_MAX_IDS} records per batch.
        </span>
      );
    }
    if (!entityType || actions.length === 0) {
      return (
        <span className="text-muted-foreground">
          {BULK_ACTION_UNSUPPORTED_NOTE}
        </span>
      );
    }
    if (supportedActions === null) {
      return (
        <span className="text-muted-foreground inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {BULK_ACTION_LOADING_NOTE}
        </span>
      );
    }

    return (
      <div className="flex items-center gap-2 flex-wrap">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action];
          return (
            <Button
              key={action}
              variant={action === "DELETE" ? "destructive" : "outline"}
              size="sm"
              onClick={() => handleBulkExecute(action)}
              disabled={loading}
              className="h-8 text-xs"
            >
              {loading && activeAction === action ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : Icon ? (
                <Icon className="w-3.5 h-3.5 mr-1" />
              ) : null}
              {BULK_ACTION_LABELS[action]}
            </Button>
          );
        })}

        {labelEntityType && onPrintLabels && (
          <Button
            variant="outline"
            size="sm"
            onClick={onPrintLabels}
            disabled={loading}
            className="h-8 text-xs"
          >
            <Printer className="w-3.5 h-3.5 mr-1" />
            Print Labels
          </Button>
        )}

        {displayLabel && (
          <span className="text-muted-foreground">
            {displayLabel} records
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(920px,calc(100vw-2rem))] bg-card border border-border shadow-2xl rounded-xl px-4 py-2.5 text-xs animate-in slide-in-from-bottom-5 duration-200 print:hidden">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 pr-3 border-r border-border font-semibold text-foreground shrink-0">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px]">
            {selectedIds.length}
          </span>
          <span>Selected</span>
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          {error && (
            <span className="text-destructive font-medium">{error}</span>
          )}

          {result && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">
                {BULK_ACTION_LABELS[result.action]} ·{" "}
                {summarizeBulkActionResult(result)}
              </span>
              {detailRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDetails((open) => !open)}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  {showDetails ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  Details
                </button>
              )}
            </div>
          )}

          {renderActionControls()}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-muted-foreground hover:text-foreground rounded shrink-0"
          title={result ? "Dismiss results" : "Deselect all"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {showDetails && detailRows.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/30 divide-y divide-border">
          {detailRows.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 px-3 py-2"
            >
              <span className="font-medium text-foreground truncate">
                {rowLabels?.[item.id] ?? item.id}
              </span>
              <span
                className={
                  item.outcome === "FAILED"
                    ? "text-destructive text-right"
                    : "text-muted-foreground text-right"
                }
              >
                {item.outcome === "FAILED" ? "Failed" : "Skipped"}
                {item.reason ? ` — ${item.reason}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
