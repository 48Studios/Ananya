import { db, type DbExecutor } from '@ananya/database';
import { sql } from '@ananya/database/query';

/**
 * Adapters use parameterized SQL keyed by the physical table/column names
 * declared in their own `tables` arrays, so this module needs no generated schema
 * bindings: the registry is verified against `information_schema` instead (see
 * {@link inspectDependencyCoverage}).
 */

/** A Drizzle SQL fragment, e.g. an extra `where` condition. */
type SqlFragment<T = unknown> = ReturnType<typeof sql<T>>;

/**
 * Component consolidation dependency registry (Pass 6A).
 *
 * READ-ONLY. This module is the single machine-checkable source of truth for
 * "what can reference a component, and can consolidation safely handle it?".
 *
 * It exists because Phase 0 discovered that components are referenced by 31
 * FK-backed tables and 4 polymorphic reference systems. A consolidation preview
 * that quietly missed one of them would be dangerous, so:
 *
 *  - every adapter declares the physical table/column pair it covers,
 *  - {@link assertDependencyCoverage} compares the registry against
 *    `information_schema` and FAILS CLOSED when the database has a component
 *    reference the registry does not represent,
 *  - anything unclassified or unsupported resolves to BLOCKING, never to
 *    "assume safe".
 *
 * Nothing here mutates data: adapters only count rows (`SELECT count(*)`).
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * What consolidation *would* have to do with a reference.
 *
 * This mirrors the Phase 0 matrix classification exactly.
 */
export type DependencyClassification =
  | 'MUST_PRESERVE'
  | 'MUST_REPOINT'
  | 'MUST_RECONCILE'
  | 'MUST_NOT_CHANGE'
  | 'UNKNOWN';

/**
 * Whether consolidation execution could currently handle the reference.
 *
 * `SUPPORTED` means "a correct action exists and is implementable with the
 * current domain semantics". It does NOT mean execution is enabled: Pass 6A is
 * read-only, so every adapter is reported with execution disabled regardless.
 */
export type ExecutionSupport = 'SUPPORTED' | 'UNSUPPORTED' | 'NOT_APPLICABLE';

/** Whether the reference is backed by a foreign key or a loose column pair. */
export type DependencyReferenceKind = 'FK' | 'POLYMORPHIC';

/** How the referenced rows relate to the business timeline. */
export type DependencyReferenceTemporality =
  'CURRENT' | 'HISTORICAL' | 'MIXED' | 'NOT_APPLICABLE';

/** Live analysis result for one dependency adapter. */
export interface DependencyAnalysis {
  id: string;
  label: string;
  entity: string;
  referenceKind: DependencyReferenceKind;
  classification: DependencyClassification;
  executionSupport: ExecutionSupport;
  temporality: DependencyReferenceTemporality;
  /** Rows referencing this component. */
  count: number;
  /** Rows that are still open/current, when the model can tell them apart. */
  openCount: number | null;
  /** Historical rows, when the model can tell them apart. */
  historicalCount: number | null;
  /** A few representative ids, for reviewer evidence. */
  sampleIds: string[];
  /** Why execution is blocked for this reference, when it is. */
  supportNote: string;
}

export interface ComponentDependencyAdapter {
  /** Stable adapter id; also used as the conflict `entityType`. */
  id: string;
  label: string;
  /** Physical table(s) this adapter represents. Verified against the database. */
  tables: Array<{ table: string; column: string }>;
  referenceKind: DependencyReferenceKind;
  classification: DependencyClassification;
  executionSupport: ExecutionSupport;
  temporality: DependencyReferenceTemporality;
  /** Human explanation of what consolidation would need to do. */
  supportNote: string;
  /** Reads (never writes) the references to one component. */
  analyze: (
    componentId: string,
    executor: DbExecutor,
  ) => Promise<{
    count: number;
    openCount?: number | null;
    historicalCount?: number | null;
    sampleIds: string[];
  }>;
}

/** UUID columns never appear as text; polymorphic ids are varchar. */
const COMPONENT_ENTITY_TYPE = 'Component';

/** How many ids are returned as reviewer evidence per dependency. */
export const DEPENDENCY_SAMPLE_LIMIT = 5;

interface AdapterInput {
  id: string;
  label: string;
  tables: Array<{ table: string; column: string }>;
  referenceKind?: DependencyReferenceKind;
  classification: DependencyClassification;
  executionSupport: ExecutionSupport;
  temporality?: DependencyReferenceTemporality;
  supportNote: string;
  analyze: ComponentDependencyAdapter['analyze'];
}

function adapter(input: AdapterInput): ComponentDependencyAdapter {
  return {
    referenceKind: 'FK',
    temporality: 'CURRENT',
    ...input,
  };
}

/**
 * Counts rows via `SELECT count(*)` plus a bounded id sample.
 *
 * Bounded on purpose: the preview must never load an unbounded number of rows
 * into memory just to describe an impact. Table/column names come from the
 * registry constants (never from request input) and the component id is always a
 * bound parameter.
 */
async function countComponentRows(
  table: string,
  column: string,
  componentId: string,
  executor: DbExecutor,
): Promise<{ count: number; sampleIds: string[] }> {
  const totals = await executor.execute(
    sql`select count(*)::int as total from ${sql.identifier(table)} where ${sql.identifier(column)} = ${componentId}`,
  );
  const count = Number((totals.rows[0] as { total?: number })?.total ?? 0);
  if (count === 0) return { count: 0, sampleIds: [] };

  const sample = await executor.execute(
    sql`select id from ${sql.identifier(table)} where ${sql.identifier(column)} = ${componentId} order by id limit ${DEPENDENCY_SAMPLE_LIMIT}`,
  );

  return {
    count,
    sampleIds: (sample.rows as Array<{ id: string }>).map((row) => row.id),
  };
}

/**
 * Counts rows matching `column = componentId` plus an extra raw SQL condition,
 * used to split open/current references from historical ones.
 */
async function countComponentRowsWhere(
  table: string,
  column: string,
  componentId: string,
  condition: SqlFragment<unknown>,
  executor: DbExecutor,
): Promise<number> {
  const totals = await executor.execute(
    sql`select count(*)::int as total from ${sql.identifier(table)} where ${sql.identifier(column)} = ${componentId} and ${condition}`,
  );
  return Number((totals.rows[0] as { total?: number })?.total ?? 0);
}

// ---------------------------------------------------------------------------
// FK-backed adapters (31 tables / 32 columns)
// ---------------------------------------------------------------------------

export const COMPONENT_DEPENDENCY_ADAPTERS: readonly ComponentDependencyAdapter[] =
  [
    // --- Inventory ledger and projections -----------------------------------
    adapter({
      id: 'inventory_transactions',
      label: 'Inventory ledger transactions',
      tables: [{ table: 'inventory_transactions', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      // A ledger enty is a historical fact; repointing would rewrite history.
      executionSupport: 'UNSUPPORTED',
      temporality: 'HISTORICAL',
      supportNote:
        'The inventory ledger is append-only. Consolidation must never repoint transactions; retained history must stay on the source component while the canonical balance is corrected with new, attributable entries. An `InitialStock` entry is a special case: `CalculateInventoryProjection` has no case for it, so it never reaches inventory_projections and cannot be moved at all — consolidation refuses while one exists.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'inventory_transactions',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'inventory_projections',
      label: 'Inventory balances (projections)',
      tables: [{ table: 'inventory_projections', column: 'component_id' }],
      classification: 'MUST_RECONCILE',
      executionSupport: 'SUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'Balances are derived from the ledger. Consolidation posts an Issue against the retired component and a matching Receipt against the surviving one for every location with a non-zero balance, then recalculates both projections from their own complete ledgers.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'inventory_projections',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'inventory_reservation_lines',
      label: 'Inventory reservations',
      tables: [
        { table: 'inventory_reservation_lines', column: 'component_id' },
      ],
      classification: 'MUST_REPOINT',
      executionSupport: 'SUPPORTED',
      temporality: 'MIXED',
      supportNote:
        'Open reservations (DRAFT/ACTIVE) are repointed onto the surviving component, preserving line ids and quantities. Consolidation refuses to run if repointing would reserve more stock at a location than the surviving component holds there. Fulfilled, released, cancelled and expired reservations are history and are left untouched.',
      analyze: async (componentId, executor) => {
        // Reservation statuses: DRAFT / ACTIVE / FULFILLED / RELEASED / EXPIRED / CANCELLED.
        const all = await countComponentRows(
          'inventory_reservation_lines',
          'component_id',
          componentId,
          executor,
        );
        const openCount = await countComponentRowsWhere(
          'inventory_reservation_lines',
          'component_id',
          componentId,
          sql`reservation_id in (select id from inventory_reservations where status in ('DRAFT', 'ACTIVE'))`,
          executor,
        );
        return {
          count: all.count,
          openCount,
          historicalCount: all.count - openCount,
          sampleIds: all.sampleIds,
        };
      },
    }),
    adapter({
      id: 'batches',
      label: 'Component batches',
      tables: [{ table: 'batches', column: 'component_id' }],
      classification: 'MUST_REPOINT',
      executionSupport: 'SUPPORTED',
      supportNote:
        'Batches are unique per (component, batch number), so they are repointed onto the surviving component keeping their id, batch number and dates. A collision BLOCKS: two batches that share a number but belong to different components are not provably the same physical lot, and merging them would discard the source batch dates and supplier reference.',
      analyze: (componentId, executor) =>
        countComponentRows('batches', 'component_id', componentId, executor),
    }),
    adapter({
      id: 'serials',
      label: 'Component serial numbers',
      tables: [{ table: 'serials', column: 'component_id' }],
      classification: 'MUST_REPOINT',
      executionSupport: 'SUPPORTED',
      supportNote:
        'Serials are unique per (component, serial number). Each serial is repointed keeping its serial number and location, because a serial identifies one physical unit. A collision BLOCKS rather than renumbering or dropping an identity.',
      analyze: (componentId, executor) =>
        countComponentRows('serials', 'component_id', componentId, executor),
    }),

    // --- Master data attached to the component ------------------------------
    adapter({
      id: 'component_attribute_values',
      label: 'Structured attribute values',
      tables: [{ table: 'component_attribute_values', column: 'component_id' }],
      classification: 'MUST_RECONCILE',
      executionSupport: 'SUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'Values are unique per (component, attribute). Every differing attribute requires an explicit reviewer decision (KEEP_CANONICAL_VALUE, KEEP_SOURCE_VALUE, DISCARD_SOURCE_VALUE or EXPLICIT_VALUE); the source values are removed once the decisions are applied.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'component_attribute_values',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'supplier_components',
      label: 'Supplier part relationships',
      tables: [{ table: 'supplier_components', column: 'component_id' }],
      classification: 'MUST_REPOINT',
      executionSupport: 'SUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'Supplier mappings are repointed onto the surviving component so it keeps every sourcing option. A collision BLOCKS: two vendor part numbers for one supplier contradict each other and consolidation will not choose between them.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'supplier_components',
          'component_id',
          componentId,
          executor,
        ),
    }),

    // --- Manufacturing structure -------------------------------------------
    adapter({
      id: 'bill_of_material_lines',
      label: 'BOM component lines',
      tables: [{ table: 'bill_of_material_lines', column: 'component_id' }],
      classification: 'MUST_REPOINT',
      executionSupport: 'SUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'A BOM line for the retired component only is repointed onto the surviving component, keeping its line id, quantity and scrap factor. When a BOM contains both components the lines are combined: the quantity is the explicit sum of both and the scrap factor must be chosen by the reviewer. Released and obsolete BOMs cannot be amended and block the operation.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'bill_of_material_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'bill_of_materials',
      label: 'BOMs produced from this component',
      tables: [{ table: 'bill_of_materials', column: 'component_id' }],
      classification: 'MUST_NOT_CHANGE',
      executionSupport: 'UNSUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'A BOM belongs to the product it builds. A BOM that produces a component being retired cannot be moved onto another product, and releasing a second BOM for one product is rejected by the domain. Consolidation blocks while such a BOM exists.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'bill_of_materials',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'material_consumption_lines',
      label: 'Material consumption records',
      tables: [{ table: 'material_consumption_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Consumption records document what was actually issued to production. They are historical and must keep their original component identity.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'material_consumption_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'production_orders',
      label: 'Production orders',
      tables: [{ table: 'production_orders', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Production orders record what was built. They are historical and must keep their original component identity.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'production_orders',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'material_requirements',
      label: 'MRP material requirements',
      tables: [{ table: 'material_requirements', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Requirements belong to a completed planning run snapshot. Rewriting them would falsify the planning record; a new run supersedes them.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'material_requirements',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'production_recommendations',
      label: 'MRP production recommendations',
      tables: [{ table: 'production_recommendations', column: 'product_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'A production recommendation belongs to a planning run and names the product to build. It is a snapshot of a past planning decision, so it keeps its original component identity.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'production_recommendations',
          'product_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'manufacturing_traceability',
      label: 'Manufacturing traceability records',
      tables: [{ table: 'manufacturing_traceability', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Traceability is a quality record of what physically went into a build. It must keep its original component identity.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'manufacturing_traceability',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'finished_goods_receipt_lines',
      label: 'Finished goods receipt lines',
      tables: [
        { table: 'finished_goods_receipt_lines', column: 'component_id' },
      ],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Receipt lines document production output at a point in time and stay historically correct.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'finished_goods_receipt_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),

    // --- Procurement --------------------------------------------------------
    adapter({
      id: 'purchase_order_lines',
      label: 'Purchase order lines',
      tables: [{ table: 'purchase_order_lines', column: 'component_id' }],
      classification: 'MUST_NOT_CHANGE',
      executionSupport: 'UNSUPPORTED',
      temporality: 'MIXED',
      supportNote:
        'What was ordered is history: repointing would claim the surviving component was ordered. Open orders are a live commitment to a supplier and no domain operation supports changing the component on an issued order, so consolidation blocks while an open order line exists.',
      analyze: async (componentId, executor) => {
        const all = await countComponentRows(
          'purchase_order_lines',
          'component_id',
          componentId,
          executor,
        );
        const openCount = await countComponentRowsWhere(
          'purchase_order_lines',
          'component_id',
          componentId,
          sql`purchase_order_id in (select id from purchase_orders where status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED'))`,
          executor,
        );
        return {
          count: all.count,
          openCount,
          historicalCount: all.count - openCount,
          sampleIds: all.sampleIds,
        };
      },
    }),
    adapter({
      id: 'purchase_invoice_lines',
      label: 'Purchase invoice lines',
      tables: [{ table: 'purchase_invoice_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Supplier invoices are financial documents. They must keep the component that was actually billed.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'purchase_invoice_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'goods_receipt_lines',
      label: 'Goods receipt lines',
      tables: [{ table: 'goods_receipt_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Receipts document what physically arrived and have already produced ledger entries.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'goods_receipt_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'supplier_return_lines',
      label: 'Supplier return lines',
      tables: [{ table: 'supplier_return_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Returns document what was sent back to a supplier at a point in time.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'supplier_return_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'purchase_recommendations',
      label: 'Purchase recommendations',
      tables: [{ table: 'purchase_recommendations', column: 'component_id' }],
      classification: 'MUST_REPOINT',
      executionSupport: 'SUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'Pending recommendations are forward-looking suggestions. They are repointed onto the surviving component so a buyer cannot be told to order a record that no longer exists. Recommendations that a planning run already acted on are history and are preserved.',
      analyze: async (componentId, executor) => {
        const all = await countComponentRows(
          'purchase_recommendations',
          'component_id',
          componentId,
          executor,
        );
        const openCount = await countComponentRowsWhere(
          'purchase_recommendations',
          'component_id',
          componentId,
          sql`status = 'PENDING'`,
          executor,
        );
        return {
          count: all.count,
          openCount,
          historicalCount: all.count - openCount,
          sampleIds: all.sampleIds,
        };
      },
    }),

    // --- Outbound / sales ---------------------------------------------------
    adapter({
      id: 'quotation_lines',
      label: 'Quotation lines',
      tables: [{ table: 'quotation_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'A quotation records what was offered to a customer at a price. Rewriting it would falsify the commercial record.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'quotation_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'sales_order_lines',
      label: 'Sales order lines',
      tables: [{ table: 'sales_order_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Sales order lines are the commercial record of what was sold and must stay historically accurate.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'sales_order_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'fulfillment_request_lines',
      label: 'Fulfillment request lines',
      tables: [{ table: 'fulfillment_request_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Fulfillment requests document demand that was served and drive ledger movements.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'fulfillment_request_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'customer_return_lines',
      label: 'Customer return lines',
      tables: [{ table: 'customer_return_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Returns document what a customer sent back at a point in time.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'customer_return_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),

    // --- Warehouse operations ----------------------------------------------
    adapter({
      id: 'warehouse_transfer_lines',
      label: 'Warehouse transfer lines',
      tables: [{ table: 'warehouse_transfer_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'MIXED',
      supportNote:
        'Transfers document physical movements between locations and have already produced ledger entries. Open transfers are a live commitment.',
      analyze: async (componentId, executor) => {
        const all = await countComponentRows(
          'warehouse_transfer_lines',
          'component_id',
          componentId,
          executor,
        );
        const openCount = await countComponentRowsWhere(
          'warehouse_transfer_lines',
          'component_id',
          componentId,
          sql`transfer_id in (select id from warehouse_transfers where status in ('DRAFT', 'SUBMITTED', 'DISPATCHED'))`,
          executor,
        );
        return {
          count: all.count,
          openCount,
          historicalCount: all.count - openCount,
          sampleIds: all.sampleIds,
        };
      },
    }),
    adapter({
      id: 'stock_adjustment_lines',
      label: 'Stock adjustment lines',
      tables: [{ table: 'stock_adjustment_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Adjustments document a correction that was made, with its own ledger entries.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'stock_adjustment_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'stock_count_lines',
      label: 'Stock count lines',
      tables: [{ table: 'stock_count_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'MIXED',
      supportNote:
        'Count lines record what was physically observed at a point in time, including open count sheets.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'stock_count_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'cycle_count_lines',
      label: 'Cycle count lines',
      tables: [{ table: 'cycle_count_lines', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'MIXED',
      supportNote:
        'Cycle count lines record periodic counting activity, including open counts.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'cycle_count_lines',
          'component_id',
          componentId,
          executor,
        ),
    }),

    // --- Projects and service ----------------------------------------------
    adapter({
      id: 'project_materials',
      label: 'Project material allocations',
      tables: [{ table: 'project_materials', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'MIXED',
      supportNote:
        'Project materials record what was allocated to a project, including open allocations.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'project_materials',
          'component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'warranty_claims',
      label: 'Warranty claims',
      tables: [{ table: 'warranty_claims', column: 'product_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'A warranty claim is a customer-facing quality and commercial record naming the product it concerns. It must keep the component that was actually sold and claimed against.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'warranty_claims',
          'product_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'service_requests',
      label: 'Service requests',
      tables: [{ table: 'service_requests', column: 'component_id' }],
      classification: 'MUST_NOT_CHANGE',
      executionSupport: 'UNSUPPORTED',
      temporality: 'MIXED',
      supportNote:
        'A service request references the item under repair. No domain rule defines what happens to an open request when its component is consolidated, and silently moving it would claim a different item was in for repair. Consolidation blocks while a service request exists.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'service_requests',
          'component_id',
          componentId,
          executor,
        ),
    }),

    // --- Intelligence and feedback -----------------------------------------
    adapter({
      id: 'component_intelligence_findings',
      label: 'Intelligence findings',
      tables: [
        { table: 'component_intelligence_findings', column: 'component_id' },
        {
          table: 'component_intelligence_findings',
          column: 'related_component_id',
        },
      ],
      classification: 'MUST_RECONCILE',
      executionSupport: 'SUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'The finding that authorised the consolidation is closed as ACCEPTED with the consolidation id recorded, and related duplicate findings involving either component are marked STALE. Findings are never deleted, so the review history survives.',
      analyze: async (componentId, executor) => {
        // Both sides of the relationship matter: a finding *about* the record and
        // a finding *against* it must both be reconciled.
        const totals = await executor.execute(
          sql`select count(*)::int as total from component_intelligence_findings where component_id = ${componentId} or related_component_id = ${componentId}`,
        );
        const count = Number(
          (totals.rows[0] as { total?: number })?.total ?? 0,
        );
        if (count === 0) return { count: 0, sampleIds: [] };

        const sample = await executor.execute(
          sql`select id from component_intelligence_findings where component_id = ${componentId} or related_component_id = ${componentId} order by id limit ${DEPENDENCY_SAMPLE_LIMIT}`,
        );
        return {
          count,
          sampleIds: (sample.rows as Array<{ id: string }>).map(
            (row) => row.id,
          ),
        };
      },
    }),
    adapter({
      id: 'ai_suggestion_feedback',
      label: 'AI feedback history',
      tables: [{ table: 'ai_suggestion_feedback', column: 'component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Review feedback is an append-only evidence trail for model evaluation. It is never rewritten or moved.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'ai_suggestion_feedback',
          'component_id',
          componentId,
          executor,
        ),
    }),

    // --- Consolidation records (owned by this feature) ----------------------
    adapter({
      id: 'components_consolidated_into',
      label: 'Consolidation retirement pointer',
      tables: [
        { table: 'components', column: 'consolidated_into_component_id' },
      ],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'The retirement pointer is written by consolidation itself and records which record absorbed a retired component. It is never repointed or cleared: doing so would erase the explanation of where a component went.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'components',
          'consolidated_into_component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'consolidations_canonical_component',
      label: 'Consolidation operation records',
      tables: [{ table: 'consolidations', column: 'canonical_component_id' }],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'The consolidation operation record names the component that survived. It is an immutable audit record and is never rewritten.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'consolidations',
          'canonical_component_id',
          componentId,
          executor,
        ),
    }),
    adapter({
      id: 'consolidation_sources_source_component',
      label: 'Consolidation source records',
      tables: [
        { table: 'consolidation_sources', column: 'source_component_id' },
      ],
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'One row per retired source component, carrying the pre/post state of the operation. Unique per source component, which is what makes consolidation idempotent at the database level. Never rewritten.',
      analyze: (componentId, executor) =>
        countComponentRows(
          'consolidation_sources',
          'source_component_id',
          componentId,
          executor,
        ),
    }),
  ];

// ---------------------------------------------------------------------------
// Polymorphic reference systems
// ---------------------------------------------------------------------------

/**
 * Polymorphic adapters reference components by `(entity_type, entity_id)` with no
 * foreign key, so the database itself cannot enforce their integrity and no
 * domain rule defines what consolidation should do with them.
 */
async function countPolymorphic(
  table: 'activity_events' | 'documents' | 'notifications' | 'user_favorites',
  componentId: string,
  executor: DbExecutor,
): Promise<{ count: number; sampleIds: string[] }> {
  const rows = await executor.execute(
    sql`select count(*)::int as total from ${sql.identifier(table)} where entity_type = ${COMPONENT_ENTITY_TYPE} and entity_id = ${componentId}`,
  );
  const total = Number((rows.rows[0] as { total?: number })?.total ?? 0);
  if (total === 0) return { count: 0, sampleIds: [] };

  const sample = await executor.execute(
    sql`select id from ${sql.identifier(table)} where entity_type = ${COMPONENT_ENTITY_TYPE} and entity_id = ${componentId} order by id limit ${DEPENDENCY_SAMPLE_LIMIT}`,
  );
  return {
    count: total,
    sampleIds: (sample.rows as Array<{ id: string }>).map((row) => row.id),
  };
}

/**
 * Polymorphic reference adapters. Every one is classified `UNKNOWN` with
 * `UNSUPPORTED` execution, because Phase 0 could not determine migration
 * semantics for them (they are the §13/§35 stop condition).
 */
export const POLYMORPHIC_DEPENDENCY_ADAPTERS: readonly ComponentDependencyAdapter[] =
  [
    adapter({
      id: 'activity_events',
      label: 'Activity history entries',
      tables: [{ table: 'activity_events', column: 'entity_id' }],
      referenceKind: 'POLYMORPHIC',
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'Activity events record that something happened to a specific component at a specific time. They are preserved: repointing would rewrite the audit trail.',
      analyze: (componentId, executor) =>
        countPolymorphic('activity_events', componentId, executor),
    }),
    adapter({
      id: 'documents',
      label: 'Documents and attachments',
      tables: [{ table: 'documents', column: 'entity_id' }],
      referenceKind: 'POLYMORPHIC',
      classification: 'MUST_REPOINT',
      executionSupport: 'SUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'Documents and attachments describe the entity they are filed against now, so they follow the surviving component rather than being stranded on a retired record.',
      analyze: (componentId, executor) =>
        countPolymorphic('documents', componentId, executor),
    }),
    adapter({
      id: 'notifications',
      label: 'Notifications',
      tables: [{ table: 'notifications', column: 'entity_id' }],
      referenceKind: 'POLYMORPHIC',
      classification: 'MUST_PRESERVE',
      executionSupport: 'NOT_APPLICABLE',
      temporality: 'HISTORICAL',
      supportNote:
        'A notification is a message a user was already shown, and the message text names the component it was about. It is preserved as a historical record of a communication rather than repointed.',
      analyze: (componentId, executor) =>
        countPolymorphic('notifications', componentId, executor),
    }),
    adapter({
      id: 'user_favorites',
      label: 'User favorites',
      tables: [{ table: 'user_favorites', column: 'entity_id' }],
      referenceKind: 'POLYMORPHIC',
      classification: 'MUST_RECONCILE',
      executionSupport: 'SUPPORTED',
      temporality: 'CURRENT',
      supportNote:
        'A favorite is a live shortcut into the catalog and must resolve to the component that still exists. Repointed onto the surviving component, with the duplicate source bookmark removed when the user already favorited it.',
      analyze: (componentId, executor) =>
        countPolymorphic('user_favorites', componentId, executor),
    }),
  ];

/** Every adapter, FK-backed and polymorphic. */
export const ALL_DEPENDENCY_ADAPTERS: readonly ComponentDependencyAdapter[] = [
  ...COMPONENT_DEPENDENCY_ADAPTERS,
  ...POLYMORPHIC_DEPENDENCY_ADAPTERS,
];

// ---------------------------------------------------------------------------
// Coverage verification (fails closed)
// ---------------------------------------------------------------------------

export interface ComponentReferenceOnDatabase {
  table: string;
  column: string;
}

export interface DependencyCoverageReport {
  dbReferences: ComponentReferenceOnDatabase[];
  registeredReferences: ComponentReferenceOnDatabase[];
  /** References present in the database but missing from the registry. */
  unregistered: ComponentReferenceOnDatabase[];
  /** Registry entries whose table/column no longer exists. */
  stale: ComponentReferenceOnDatabase[];
  ok: boolean;
}

/**
 * Compares the registry against the live database and reports drift.
 *
 * This is the machine-checkable guard the pass requires: a new FK to
 * `components.id` that nobody registered shows up as `unregistered`, and the
 * preview fails closed rather than silently ignoring the relationship.
 *
 * Reads `information_schema` only.
 */
export async function inspectDependencyCoverage(
  executor: DbExecutor = db,
): Promise<DependencyCoverageReport> {
  const rows = await executor.execute(sql`
    select tc.table_name as table_name, kcu.column_name as column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_name = 'components'
      and ccu.column_name = 'id'
    order by tc.table_name, kcu.column_name
  `);

  const dbReferences: ComponentReferenceOnDatabase[] = (
    rows.rows as Array<{ table_name: string; column_name: string }>
  ).map((row) => ({ table: row.table_name, column: row.column_name }));

  const registeredReferences = ALL_DEPENDENCY_ADAPTERS.flatMap((entry) =>
    entry.tables.map((table) => ({
      table: table.table,
      column: table.column,
      referenceKind: entry.referenceKind,
    })),
  )
    .filter((reference) => reference.referenceKind === 'FK')
    .map(({ table, column }) => ({ table, column }));

  const key = (reference: ComponentReferenceOnDatabase) =>
    `${reference.table}.${reference.column}`;
  const registeredKeys = new Set(registeredReferences.map(key));
  const dbKeys = new Set(dbReferences.map(key));

  const unregistered = dbReferences.filter(
    (reference) => !registeredKeys.has(key(reference)),
  );
  const stale = registeredReferences.filter(
    (reference) => !dbKeys.has(key(reference)),
  );

  return {
    dbReferences,
    registeredReferences,
    unregistered,
    stale,
    ok: unregistered.length === 0 && stale.length === 0,
  };
}

/** Raised when the registry and the database disagree. */
export class DependencyCoverageError extends Error {
  constructor(public readonly report: DependencyCoverageReport) {
    super(
      `Component dependency registry does not match the database. Unregistered: ${
        report.unregistered
          .map((reference) => `${reference.table}.${reference.column}`)
          .join(', ') || 'none'
      }. Stale: ${
        report.stale
          .map((reference) => `${reference.table}.${reference.column}`)
          .join(', ') || 'none'
      }.`,
    );
    this.name = 'DependencyCoverageError';
  }
}

/**
 * Analysis result for every adapter, plus coverage status.
 *
 * Coverage is NOT enforced here (the preview service decides how to fail), so
 * callers can report drift as a blocking conflict instead of throwing.
 */
export interface DependencyAnalysisResult {
  analyses: DependencyAnalysis[];
  coverage: DependencyCoverageReport;
  /** Total referencing rows across every adapter. */
  totalReferences: number;
  /** Adapters whose classification or support state blocks execution. */
  blockingDependencyIds: string[];
}

/**
 * Counts every component reference for one component and classifies it.
 *
 * Read-only: each adapter performs `select count(*)` and a bounded id sample.
 */
export async function analyzeComponentDependencies(
  componentId: string,
  executor: DbExecutor = db,
): Promise<DependencyAnalysisResult> {
  const coverage = await inspectDependencyCoverage(executor);

  const analyses: DependencyAnalysis[] = [];
  for (const entry of ALL_DEPENDENCY_ADAPTERS) {
    const result = await entry.analyze(componentId, executor);
    analyses.push({
      id: entry.id,
      label: entry.label,
      entity: entry.tables[0]?.table ?? entry.id,
      referenceKind: entry.referenceKind,
      classification: entry.classification,
      executionSupport: entry.executionSupport,
      temporality: entry.temporality,
      count: result.count,
      openCount: result.openCount ?? null,
      historicalCount: result.historicalCount ?? null,
      sampleIds: result.sampleIds,
      supportNote: entry.supportNote,
    });
  }

  return {
    analyses,
    coverage,
    totalReferences: analyses.reduce((total, entry) => total + entry.count, 0),
    blockingDependencyIds: analyses
      .filter(
        (entry) =>
          entry.classification === 'UNKNOWN' ||
          entry.executionSupport === 'UNSUPPORTED',
      )
      .map((entry) => entry.id),
  };
}

/** True when a dependency id is registered (used by fail-closed checks). */
export function isRegisteredDependencyId(id: string): boolean {
  return ALL_DEPENDENCY_ADAPTERS.some((entry) => entry.id === id);
}
