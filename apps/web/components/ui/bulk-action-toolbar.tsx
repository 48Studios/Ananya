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
import { cn } from "@/lib/utils";
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

/**
 * One width for every action button. The labels differ in length by more than
 * half ("Delete" vs "Print Labels"), and letting each size itself made the row
 * read as a ragged line; a shared minimum turns it into a set of equal cells.
 */
const ACTION_BUTTON_CLASS = "min-w-[7rem]";

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
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) => {
          const Icon = ACTION_ICONS[action];
          return (
            <Button
              key={action}
              variant={action === "DELETE" ? "destructive" : "outline"}
              size="sm"
              onClick={() => handleBulkExecute(action)}
              disabled={loading}
              className={ACTION_BUTTON_CLASS}
            >
              {loading && activeAction === action ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : Icon ? (
                <Icon className="size-3.5" />
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
            className={ACTION_BUTTON_CLASS}
          >
            <Printer className="size-3.5" />
            Print Labels
          </Button>
        )}
      </div>
    );
  };

  /**
   * The close control clears the selection and dismisses an outcome. Its label
   * says which, and names the records it is about — that is the only place the
   * entity type appears now that the trailing "… records" text is gone.
   */
  const selectionNoun = displayLabel
    ? `${displayLabel} record${selectedIds.length === 1 ? "" : "s"}`
    : "records";
  const dismissLabel = result
    ? selectedIds.length > 0
      ? "Dismiss results and clear selection"
      : "Dismiss results"
    : `Deselect all ${selectionNoun}`;

  return (
    /*
      `fixed` for the vertical pinning, with the horizontal centring delegated to
      the layout.

      `fixed` is required, not a style choice: the bar must stay at the bottom of
      the viewport regardless of how far the list is scrolled. A `sticky` bar
      only pins while it is still below the fold — measured, it dropped from
      bottom-900 to bottom-375 after scrolling 600px — because `main` is the
      scroll container and sticky is bounded by its containing block.

      `fixed` also means the bar is centred on the VIEWPORT, which put it left of
      the content it acts on whenever the rail and sidebar were on screen.
      `dashboard-layout` publishes `--content-area-left` (rail + sidebar, from the
      same numbers that render their widths), and `md:pl-` offsets the centring
      box by exactly that much. The padding is `md:`-scoped because the two
      regions are `hidden md:block` — below `md` there is nothing to exclude, and
      the layout's value is not read.

      The wrapper spans the viewport, so it must let clicks through to the rows
      behind it; only the bar itself takes the pointer.
    */
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center md:pl-(--content-area-left) print:hidden">
      {/*
        `w-max` (not `w-fit`): with a wrapping flex child, `fit-content` resolves
        the inner container to its WIDEST ITEM rather than the sum of its items,
        so the bar collapsed to ~470px and the buttons wrapped with room to
        spare. `max-content` measures the single-line row, then `max-w` clamps it
        to the content area, where the buttons wrap inside it.
      */}
      <div className="pointer-events-auto w-max max-w-[min(100%,60rem)] rounded-xl border border-border bg-card text-xs shadow-2xl animate-in slide-in-from-bottom-5 duration-200 print:hidden">
        {/*
          Row 1 — identity, actions, dismiss. Widths are assigned per block
          rather than by content: the count and the dismiss control are fixed, the
          actions take what is left and wrap inside it. The bar hugs its own
          content, so there is no gap between the last action and the close button.
        */}
        <div className="flex items-center gap-3 px-3 py-2">
          {selectedIds.length > 0 && (
            <div className="flex shrink-0 items-center gap-2 font-semibold text-foreground">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] tabular-nums text-primary">
                {selectedIds.length}
              </span>
              <span>Selected</span>
            </div>
          )}

          {selectedIds.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-l border-border pl-3">
              {renderActionControls()}
            </div>
          )}

          <div className="flex shrink-0 items-center border-l border-border pl-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDismiss}
              aria-label={dismissLabel}
              title={dismissLabel}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/*
          Row 2 — the outcome owns a full row. Inline, a long summary or a long
          refusal reason stretched the action row and pushed the buttons around.
        */}
        {(error || result) && (
          <div className="space-y-2 border-t border-border px-3 py-2">
            {error ? (
              <span className="font-medium text-destructive">{error}</span>
            ) : result ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      {BULK_ACTION_LABELS[result.action]}
                    </span>
                    <span className="min-w-0 text-foreground">
                      {summarizeBulkActionResult(result)}
                    </span>
                  </div>
                  {detailRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowDetails((open) => !open)}
                      aria-expanded={showDetails}
                      className="inline-flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      {showDetails ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      Details ({detailRows.length})
                    </button>
                  )}
                </div>

                {showDetails && detailRows.length > 0 && (
                  <div className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-muted/30">
                    {detailRows.map((item) => {
                      const name = rowLabels?.[item.id] ?? item.id;
                      return (
                        // Three assigned columns: a fixed name column, a fixed
                        // verdict, and the reason taking the remaining width (it
                        // wraps rather than being cut — the reason is the point).
                        <div
                          key={item.id}
                          className="flex items-start gap-3 px-3 py-2"
                        >
                          <span
                            className="w-36 shrink-0 truncate font-medium text-foreground"
                            title={name}
                          >
                            {name}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 font-medium",
                              item.outcome === "FAILED"
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          >
                            {item.outcome === "FAILED" ? "Failed" : "Skipped"}
                          </span>
                          <span className="min-w-0 max-w-[32rem] flex-1 text-muted-foreground">
                            {item.reason ?? "No reason reported."}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
