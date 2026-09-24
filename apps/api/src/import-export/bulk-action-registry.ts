import { BulkActionType } from './dtos';

/**
 * Bulk actions the ERP can genuinely carry out, keyed by import/export entity
 * type.
 *
 * A pair is only listed when a real mutation exists behind it, so the review
 * toolbar can never offer an action that would silently do nothing:
 *
 * - `DELETE` delegates to the owning module's own delete path, so every domain
 *   refusal (a category with children, a non-DRAFT work order, a location in
 *   use, a system role, ...) still applies and is reported per record.
 * - `ARCHIVE` and `UPDATE_STATUS` write the entity's `isActive` flag through
 *   the module's existing update path (`isActive: false` / `isActive: true`) —
 *   the same capability the Edit forms already expose. "Set Active" is the
 *   label the toolbar has always shown for `UPDATE_STATUS`.
 *
 * Entity types that are absent have no safe bulk mutation today: ledger tables
 * such as OpeningInventory must never be deleted, and workflow documents such
 * as Service Requests only move through their own transitions.
 */
export const BULK_ACTION_SUPPORT: Record<string, readonly BulkActionType[]> = {
  AttributeDefinition: [
    BulkActionType.DELETE,
    BulkActionType.ARCHIVE,
    BulkActionType.UPDATE_STATUS,
  ],
  Category: [
    BulkActionType.DELETE,
    BulkActionType.ARCHIVE,
    BulkActionType.UPDATE_STATUS,
  ],
  Component: [
    BulkActionType.DELETE,
    BulkActionType.ARCHIVE,
    BulkActionType.UPDATE_STATUS,
  ],
  Manufacturer: [
    BulkActionType.DELETE,
    BulkActionType.ARCHIVE,
    BulkActionType.UPDATE_STATUS,
  ],
  Supplier: [
    BulkActionType.DELETE,
    BulkActionType.ARCHIVE,
    BulkActionType.UPDATE_STATUS,
  ],
  Location: [
    BulkActionType.DELETE,
    BulkActionType.ARCHIVE,
    BulkActionType.UPDATE_STATUS,
  ],
  Unit: [
    BulkActionType.DELETE,
    BulkActionType.ARCHIVE,
    BulkActionType.UPDATE_STATUS,
  ],
  Role: [BulkActionType.DELETE],
  BOM: [BulkActionType.DELETE],
  WorkOrder: [BulkActionType.DELETE],
  PurchaseOrder: [BulkActionType.DELETE],
};

/**
 * Upper bound on one request, mirroring the review queue's 500-per-run cap: a
 * batch is reviewed by a human afterwards, and an unbounded loop over ids is
 * not something one HTTP request should carry.
 */
export const MAX_BULK_ACTION_IDS = 500;

/** The actions this entity type supports, in the order the toolbar shows them. */
export function supportedBulkActions(entityType: string): BulkActionType[] {
  return [...(BULK_ACTION_SUPPORT[entityType] ?? [])];
}

export function isBulkActionSupported(
  entityType: string,
  action: BulkActionType,
): boolean {
  return (BULK_ACTION_SUPPORT[entityType] ?? []).includes(action);
}
