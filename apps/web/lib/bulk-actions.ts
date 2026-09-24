import type {
  BulkActionItemResultDto,
  BulkActionResultDto,
  BulkActionType,
} from "./api/import-export-api";
import type { EntityType } from "./api/barcodes-api";

/**
 * Batch-action vocabulary for the shared data table.
 *
 * The rules here are deliberately pure: the toolbar renders from them, and the
 * specs assert them directly (this workspace has no DOM testing library).
 */

/** Button copy, keyed by the action the API reports as supported. */
export const BULK_ACTION_LABELS: Record<BulkActionType, string> = {
  DELETE: "Delete",
  ARCHIVE: "Archive",
  UPDATE_STATUS: "Set Active",
  ASSIGN_CATEGORY: "Assign Category",
  ASSIGN_LOCATION: "Assign Location",
  ASSIGN_MANUFACTURER: "Assign Manufacturer",
};

/**
 * Display order: the destructive action is last, so a mis-click never lands on
 * Delete where the reviewer expects Archive.
 */
export const BULK_ACTION_ORDER: BulkActionType[] = [
  "ARCHIVE",
  "UPDATE_STATUS",
  "ASSIGN_CATEGORY",
  "ASSIGN_LOCATION",
  "ASSIGN_MANUFACTURER",
  "DELETE",
];

export function orderBulkActions(actions: BulkActionType[]): BulkActionType[] {
  return [...actions].sort(
    (a, b) => BULK_ACTION_ORDER.indexOf(a) - BULK_ACTION_ORDER.indexOf(b),
  );
}

/** Mirrors `MAX_BULK_ACTION_IDS` in the API so the toolbar can say no first. */
export const BULK_ACTION_MAX_IDS = 500;

/**
 * Entity types a label can be printed for, mapped from the data table's
 * import/export entity type to the barcode API's entity type. Tables for any
 * other entity type simply do not offer label printing.
 */
export const LABEL_PRINT_ENTITY_TYPES: Record<string, EntityType> = {
  Component: "COMPONENT",
  Location: "LOCATION",
  WorkOrder: "WORK_ORDER",
  PurchaseOrder: "PURCHASE_ORDER",
  Project: "PROJECT",
};

export function labelPrintEntityType(
  entityType: string | undefined | null,
): EntityType | null {
  if (!entityType) return null;
  return LABEL_PRINT_ENTITY_TYPES[entityType] ?? null;
}

/**
 * A stable row id for selection and batch actions.
 *
 * TanStack defaults row ids to the row INDEX, which makes a selection on page 2
 * collide with the same index on page 1. Records are keyed by their own id;
 * only tables whose rows have no id fall back to a positional id.
 */
export function dataTableRowId(row: unknown, index: number): string {
  const id = (row as { id?: unknown } | null | undefined)?.id;
  if (typeof id === "string" && id.length > 0) return id;
  return `row-${index}`;
}

export interface DataTableSelection {
  ids: string[];
  /** False when a selected row has no record id — batch actions need one. */
  hasEveryRecordId: boolean;
}

export function dataTableSelection(rows: unknown[]): DataTableSelection {
  const ids: string[] = [];
  let hasEveryRecordId = true;

  rows.forEach((row, index) => {
    const id = (row as { id?: unknown } | null | undefined)?.id;
    if (typeof id === "string" && id.length > 0) {
      ids.push(id);
    } else {
      hasEveryRecordId = false;
      ids.push(dataTableRowId(row, index));
    }
  });

  return { ids, hasEveryRecordId };
}

/** Field names a table uses to name a record, most specific first. */
const ROW_LABEL_KEYS = [
  "name",
  "title",
  "sku",
  "code",
  "orderNumber",
  "documentNumber",
  "invoiceNumber",
  "accountNumber",
  "email",
];

/**
 * Best available human name for a row, used when a batch action reports back
 * about a record ("Resistor 10k — only DRAFT work orders can be deleted").
 */
export function dataTableRowLabel(row: unknown): string {
  const record = row as Record<string, unknown> | null | undefined;
  if (!record) return "Record";

  for (const key of ROW_LABEL_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  const id = record.id;
  if (typeof id === "string" && id.length > 0) {
    return id;
  }
  return "Record";
}

/** Copy for a table that has nothing to batch. */
export const BULK_ACTION_UNSUPPORTED_NOTE =
  "No batch actions are available for this table.";

/** Copy for a selection that cannot be addressed by record id. */
export const BULK_ACTION_NO_RECORD_IDS_NOTE =
  "These rows have no record id, so batch actions are unavailable.";

/** Copy shown while the supported-action list is still being read. */
export const BULK_ACTION_LOADING_NOTE = "Checking available batch actions...";

/**
 * One line the reviewer can read at a glance. It always states how many
 * records were actually changed, never just how many were sent.
 */
export function summarizeBulkActionResult(result: BulkActionResultDto): string {
  const parts = [
    `Applied to ${result.appliedCount} of ${result.requestedCount} record(s)`,
  ];
  if (result.skippedCount > 0) parts.push(`${result.skippedCount} skipped`);
  if (result.failedCount > 0) parts.push(`${result.failedCount} failed`);
  return parts.join(" · ");
}

/** The rows a reviewer needs to look at again, in selection order. */
export function bulkActionDetailRows(
  result: BulkActionResultDto,
): BulkActionItemResultDto[] {
  return result.results.filter((item) => item.outcome !== "APPLIED");
}

/**
 * Number of labels a batch print will actually emit, which is the number the
 * reviewer must see before pressing print.
 */
export function totalLabelCount(labelCount: number, copies: number): number {
  return labelCount * Math.max(1, copies);
}

/** Copies per label, kept inside the range a label sheet can repeat. */
export const LABEL_COPY_MIN = 1;
export const LABEL_COPY_MAX = 99;

export function clampLabelCopies(value: number): number {
  if (!Number.isFinite(value)) return LABEL_COPY_MIN;
  return Math.min(LABEL_COPY_MAX, Math.max(LABEL_COPY_MIN, Math.trunc(value)));
}
