# RFC-0068: Inventory Builder Persistence — Persistent Parametric Layouts & Location Mappings

**Status:** Proposed  
**Author:** Ananya Core Architecture & Spatial Engineering  
**Created:** 2026-10-02  
**Last Revised:** 2026-10-02 (Safety, Reconciliation & Concurrency Review)  
**Target Phase:** Phase 3 — Layout Persistence & Revision Lifecycle  
**Related RFCs:** [RFC-0021](0021-warehouse-structure-and-bin-locations.md), [RFC-0062](0062-spatial-inventory-architecture.md), [RFC-0063](0063-spatial-inventory-data-model.md), [RFC-0066](0066-spatial-inventory-implementation.md), [RFC-0067](0067-spatial-visual-first-ux.md)  
**Related Codebases:**
- Engine & Types: [`packages/inventory/src/spatial/parametric/`](../../packages/inventory/src/spatial/parametric/)
- Workspace State: [`apps/web/lib/spatial/inventory-builder-state.ts`](../../apps/web/lib/spatial/inventory-builder-state.ts)
- Database Schema: [`packages/database/src/schema/spatial.ts`](../../packages/database/src/schema/spatial.ts), [`packages/database/src/schema/locations.ts`](../../packages/database/src/schema/locations.ts)
- Database Driver & Executor: [`packages/database/src/index.ts`](../../packages/database/src/index.ts), [`packages/database/src/executor.ts`](../../packages/database/src/executor.ts)
- API Services: [`apps/api/src/spatial/spatial.service.ts`](../../apps/api/src/spatial/spatial.service.ts), [`apps/api/src/spatial/spatial.controller.ts`](../../apps/api/src/spatial/spatial.controller.ts)

---

# 1. Executive Summary

Phases 1, 2, 2.1, and 2.2 of the Ananya Inventory Builder established a deterministic parametric storage engine (`@ananya/inventory`), a duplex Next.js workspace UI (`@ananya/web`), strict one-to-one location mapping invariants, hierarchy scoping, stale mapping lifecycle tracking, and verified 2D/3D WebGL scene synchronization. However, all generated layouts and compartment-to-location mappings currently exist exclusively as **in-memory draft states** within browser React memory.

This RFC defines the production architecture for **Phase 3: Persistent Parametric Layouts, Revision-Aware Location Mappings, and Safe Spatial Node Publication**.

### Core Tenets of Phase 3 Design
1. **Decoupled Persistence**: Layout configuration and compartment mappings are persisted independently from authoritative location records and inventory balances. Saving, modifying, or archiving a layout performs **zero** direct mutations on `locations`, `inventory_transactions`, `inventory_projections`, or `inventory_reservations`.
2. **Reproducible Topology**: Stores the parametric template identity, version, dimensions, subdivision parameters, and naming rules so any saved layout can be deterministically reconstructed by `@ananya/inventory` without storing redundant coordinate geometry.
3. **One-to-One Non-Duplicate Mappings**: Maintains strict 1:1 slot-to-location mapping cardinality backed by database unique constraints.
4. **Spatial Node Ownership & Safe Reconciliation**: Published layouts synchronize coordinates into the existing `spatial_nodes` table using a strict ownership predicate (`metadata->>'source' = 'inventory_builder' AND metadata->>'layoutId' = :layoutId`). Publishing Layout A cannot mutate or delete nodes owned by Layout B or manual CAD authoring.
5. **Manual Authoring Protection & Recovery**: Manually authored 3D nodes are protected against silent overwrite. Overwrite requires explicit opt-in confirmation and archives the previous geometry in `metadata.supersededGeometry` for lossless recovery.
6. **Referential Integrity & Historical Immutability**: Active mappings use `onDelete: "restrict"` on `locationId` to prevent warehouse locations from being deleted out from under active layouts. Historical snapshots in `spatial_layout_revisions` store JSON snapshots, ensuring immutable audit history even if locations are later decommissioned.
7. **Atomic Revisions & Concurrency Locking**: Layout updates execute inside atomic database transactions using row locks on both the layout (`FOR UPDATE`) and all involved locations (`FOR SHARE`), preventing lost updates and race conditions from concurrent location reparenting or deactivation.
8. **Parent-Activity Policy (Phase 3.4.4)**: Draft creation, draft updates, reads, and revision-history inspection are allowed under an inactive parent container — planning work is never frozen by a maintenance window. Publication operationalizes the layout onto the container and therefore requires an active parent: `publishLayout` rejects with `INACTIVE_LAYOUT_PARENT` (HTTP 422) when the parent is inactive. Mapped-location activity rules are unchanged (`INACTIVE_LOCATION_MAPPED` still applies per mapped row).
9. **Stale Association Lifecycle Enforcement**: Captures the deterministic `acknowledgedChangeSignature` to differentiate benign dimensional resizing from semantic or topological shifts requiring operator re-approval.
9. **Zero Impact on Ledger & QR Semantics**: Layout changes never move inventory, delete transaction records, or invalidate existing hardware QR codes.

---

# 2. Repository Analysis: Verified Facts, Assumptions & Boundaries

Following `AGENTS.md`, we distinguish between verified facts confirmed from the repository, reasonable engineering assumptions, and unknown areas.

### 2.1 VERIFIED (Facts Confirmed From Repository Files)

1. **Database Driver & Connection Pool**:
   - Driver: `pg` (`Pool` from `pg`), wrapped by `drizzle-orm/node-postgres` (`packages/database/src/index.ts:1-26`).
   - Transaction Executor: `toDbExecutor(tx)` narrows Drizzle's transaction handle to `DbExecutor` for multi-repository atomic operations (`packages/database/src/executor.ts:13-60`).
2. **Single-Tenant Database**: Grep search across `packages/database/src/schema/` reveals **no tenant columns** (`tenant_id`, `organization_id`) in any entity table (`components`, `locations`, `inventory_transactions`, `spatial_models`, `spatial_nodes`). Tenancy is represented exclusively via a singleton `organization_profile` table (`packages/database/src/schema/settings.ts:13`) for on-premise / dedicated enterprise deployment.
3. **Authoritative Location Tree**: `locations` (`packages/database/src/schema/locations.ts`) uses self-referencing `parentId` with foreign key `onDelete: "restrict"`. Unique constraint is on `code` (`locations_code_unique`).
4. **Location Deletion Guardrails**: `DeleteLocation` (`packages/inventory/src/locations/delete-location.ts:18-26`) and `DrizzleLocationRepository.isInUse` (`apps/api/src/infrastructure/repositories/drizzle-location.repository.ts:125-165`) block deletion if any goods receipts, inventory projections, warehouse transfers, production orders, material consumptions, or child locations exist.
5. **Existing Spatial Node Invariants**: `spatial_nodes` (`packages/database/src/schema/spatial.ts:123-192`) enforces a database unique constraint on `locationId` (`spatial_nodes_location_id_unique`). Exactly one `spatial_nodes` record may exist per `locations.id`.
6. **Existing Spatial Node Foreign Keys**:
   - `locationId -> locations.id (onDelete: "cascade")`
   - `modelId -> spatial_models.id (onDelete: "restrict")`
   - `parentSpatialNodeId -> spatial_nodes.id (onDelete: "set null")`
   - `anchorId -> spatial_anchors.id (onDelete: "set null")`
7. **Transaction Execution**: NestJS API executes atomic transactions via `db.transaction(async (tx) => { ... })` (`apps/api/src/spatial/spatial.service.ts:211`).
8. **Revision Pattern Precedent**: `packages/database/src/schema/documents.ts` uses an integer `currentVersion` on the parent table and appends historical snapshots to `document_versions`.
9. **Immutable Inventory Ledger**: `inventory_transactions` is strictly append-only. Stock mutations must originate from inventory transactions within database transactions (`ARCHITECTURE.md:37`, `AGENTS.md:52`).

### 2.2 ASSUMPTIONS (Reasonable Conclusions Verified Against Context)

1. **Single Layout Publication per Container**: A physical container location (e.g. Cabinet A) should have at most one active `PUBLISHED` layout at any point in time. Multiple draft layouts may exist during planning.
2. **Deterministic Regeneration**: Because `@ananya/inventory` generates coordinates deterministically from `ParametricStorageConfig`, storing the raw float coordinates of every compartment in the layout table is redundant. We store config inputs in `spatial_layouts` and relational slot-to-location mappings in `spatial_layout_mappings`.

### 2.3 UNKNOWN (Areas Requiring Explicit Architecture Policy)

1. **Manual Spatial Node Coexistence Policy**: Fully defined in Section 4 with explicit metadata ownership tags, strict reconciliation boundaries, and preserved superseded geometry.
2. **Batch Location Auto-Provisioning**: Whether Phase 3 should create physical `locations` rows for unmapped draft slots. (Explicitly deferred to Phase 3.5 to preserve domain separation).

---

# 3. Proposed Data Model & Referential Integrity

### 3.1 Justification of the Three-Table Design

We propose three tables:
1. `spatial_layouts`: Header record storing parametric configuration inputs, template discriminator, engine version, status, and monotonic revision counter.
2. `spatial_layout_mappings`: Normalized relational join table between layout slots and Ananya locations.
3. `spatial_layout_revisions`: Immutable audit log of configuration and mapping snapshots.

#### Architectural Evaluation of Alternatives
- **Alternative A: Storing Mappings as a JSON Array in `spatial_layouts`**  
  *Rejected*: A JSON array cannot enforce PostgreSQL foreign key constraints to `locations.id`. Deleting or reparenting a location would leave orphaned UUIDs inside JSON. Furthermore, unique constraints `(layoutId, slotId)` and `(layoutId, locationId)` cannot be enforced declaratively across JSON array items, risking race conditions and duplicate assignments. Querying "which layout maps location X?" would require a full table JSON scan (`jsonb_array_elements`) instead of an indexed B-tree lookup.
- **Alternative B: Two Tables (No Separate Revision History Table)**  
  *Rejected*: Storing only current state eliminates auditability and makes it impossible to reproduce the spatial layout as it existed on a historical date (essential for warehouse incident forensics and stock-count audits).

```
┌─────────────────────────────────┐
│            locations            │
│  (Authoritative Warehouse Loc)  │
└────────────────┬────────────────┘
                 │
                 │ 1:0..1 (via parent_location_id, onDelete: "restrict")
                 ▼
┌─────────────────────────────────┐           1:N           ┌──────────────────────────────────┐
│         spatial_layouts         ├────────────────────────►│     spatial_layout_mappings      │
│   (Config, Version, Revision)   │                         │  (slot_id <-> location_id links) │
└────────────────┬────────────────┘                         └─────────────────▲────────────────┘
                 │                                                            │
                 │ 1:N (onDelete: "cascade")                                  │ references
                 ▼                                                            │ (onDelete: "restrict")
┌─────────────────────────────────┐                                           │
│    spatial_layout_revisions     │                                    ┌──────┴─────────┐
│  (Immutable Diff & Snapshots)   │                                    │   locations    │
└─────────────────────────────────┘                                    │  (Descendant)  │
                                                                       └────────────────┘
```

### 3.2 Drizzle Schema Specification

```typescript
// packages/database/src/schema/spatial.ts

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  sql,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { locations } from "./locations";
import { users } from "./auth";

/**
 * 1. Spatial Layouts (Parametric Layout Header & Version)
 *
 * Persists the parametric configuration for a physical container location.
 * Completely isolated from inventory quantities, ledger rows, and stock movements.
 */
export const spatialLayouts = pgTable(
  "spatial_layouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Authoritative physical container location (Cabinet A, Rack 01, Shelf Bay)
    parentLocationId: uuid("parent_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),

    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),

    // Parametric Engine Template Identity & Semantics
    templateType: varchar("template_type", { length: 64 }).notNull(), // SMD_DRAWER_CABINET, PALLET_RACK, etc.
    engineVersion: varchar("engine_version", { length: 32 }).notNull().default("1.0.0"),

    // ParametricStorageConfig JSON input parameters
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),

    // Monotonic integer revision counter for optimistic concurrency
    revision: integer("revision").notNull().default(1),

    // Status: DRAFT, PUBLISHED, ARCHIVED
    status: varchar("status", { length: 32 }).notNull().default("PUBLISHED"),

    // Cached count of compartments generated by engine for rapid filtering
    totalCompartments: integer("total_compartments").notNull().default(0),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("spatial_layouts_code_unique").on(table.code),
    // Enforce at most one PUBLISHED layout per physical parent container
    uniqueIndex("spatial_layouts_active_parent_unique")
      .on(table.parentLocationId)
      .where(sql`status = 'PUBLISHED'`),
    index("spatial_layouts_parent_location_id_idx").on(table.parentLocationId),
    index("spatial_layouts_template_type_idx").on(table.templateType),
    index("spatial_layouts_status_idx").on(table.status),
  ],
);

/**
 * 2. Spatial Layout Mappings (Persistent Compartment <-> Location Associations)
 *
 * Persists 1:1 associations between generated slots and physical child locations.
 * Uses onDelete: "restrict" on locationId to prevent warehouse locations from being
 * silently deleted out from under active spatial layouts.
 */
export const spatialLayoutMappings = pgTable(
  "spatial_layout_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    layoutId: uuid("layout_id")
      .notNull()
      .references(() => spatialLayouts.id, { onDelete: "cascade" }),

    // Deterministic compartment identifier from parametric engine (e.g. "drawer_slot_r0_c0")
    slotId: varchar("slot_id", { length: 64 }).notNull(),

    // Human-readable slot code at time of mapping (e.g. "A01", "L1-B1")
    slotCode: varchar("slot_code", { length: 64 }).notNull(),

    // Target Ananya location mapped to this compartment
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),

    // Logical grid coordinates
    logicalRow: integer("logical_row").notNull(),
    logicalCol: integer("logical_col").notNull(),

    // Stale review lifecycle
    isStale: boolean("is_stale").notNull().default(false),
    staleReason: text("stale_reason"),
    acknowledgedChangeSignature: varchar("acknowledged_change_signature", { length: 255 }),

    mappedAt: timestamp("mapped_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Invariant: at most one location per slot in a given layout
    uniqueIndex("spatial_layout_mappings_layout_slot_unique").on(table.layoutId, table.slotId),
    // Invariant: at most one slot per location in a given layout
    uniqueIndex("spatial_layout_mappings_layout_location_unique").on(table.layoutId, table.locationId),
    index("spatial_layout_mappings_layout_id_idx").on(table.layoutId),
    index("spatial_layout_mappings_location_id_idx").on(table.locationId),
    index("spatial_layout_mappings_is_stale_idx").on(table.isStale),
  ],
);

/**
 * 3. Spatial Layout Revisions (Immutable History Snapshots)
 *
 * Records configuration diffs, mapping adjustments, and author attribution for auditing.
 * JSON snapshots ensure historical immutability even if physical locations are later decommissioned.
 */
export const spatialLayoutRevisions = pgTable(
  "spatial_layout_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    layoutId: uuid("layout_id")
      .notNull()
      .references(() => spatialLayouts.id, { onDelete: "cascade" }),

    revisionNumber: integer("revision_number").notNull(),

    // Snapshot of config at this revision
    configSnapshot: jsonb("config_snapshot").$type<Record<string, unknown>>().notNull(),

    // Snapshot of mappings at this revision (immutable JSONB array)
    mappingsSnapshot: jsonb("mappings_snapshot")
      .$type<Array<{
        slotId: string;
        slotCode: string;
        locationId: string;
        locationCode: string;
        isStale: boolean;
        staleReason?: string;
        acknowledgedChangeSignature?: string;
      }>>()
      .notNull(),

    // Engine diff relative to previous revision
    diffSummary: jsonb("diff_summary").$type<Record<string, unknown>>().notNull(),

    changeDescription: text("change_description"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("spatial_layout_revisions_layout_rev_unique").on(table.layoutId, table.revisionNumber),
    index("spatial_layout_revisions_layout_id_idx").on(table.layoutId),
    index("spatial_layout_revisions_created_at_idx").on(table.createdAt),
  ],
);
```

---

# 4. Spatial Node Ownership, Reconciliation & Overwrite Safety

### 4.1 Strict Ownership Predicate

Ananya's 3D warehouse viewer, QR locate target resolver, and mobile pick assist rely on `spatial_nodes` for real-time 3D coordinate lookups. `spatial_nodes` enforces a 1:1 constraint on `locationId` (`spatial_nodes_location_id_unique`, `packages/database/src/schema/spatial.ts:187`).

To prevent cross-layout collisions and protect manually authored geometry, we establish an explicit **Ownership Predicate**:

```
A spatial_nodes record is owned by Layout L if and only if:
  node.metadata->>'source' = 'inventory_builder'
  AND node.metadata->>'layoutId' = L.id
```

### 4.2 Idempotent Reconciliation Algorithm

When a layout is published (`status = "PUBLISHED"`), the API reconciles the **validated desired mapping set** $D$ with the existing spatial nodes in the database within the transaction:

1. **Query Existing Builder Nodes ($E$):**
   ```sql
   SELECT * FROM spatial_nodes 
   WHERE metadata->>'source' = 'inventory_builder' 
     AND metadata->>'layoutId' = :layoutId;
   ```
   *Strict Isolation Guarantee:* This query selects **only** nodes previously created by this exact layout. Nodes owned by other layouts or manual CAD authoring are **never** included in $E$.

2. **Reconciliation Steps ($D$ vs $E$):**
   - **Case 1: Unchanged Nodes ($D \cap E$ with identical geometry):**
     If a mapped location already has an owned node with matching coordinates and bounding dimensions (within `0.001 mm`), **no database write is issued**. Identical publications produce **zero mutations**.
   - **Case 2: Modified Nodes ($D \cap E$ with changed geometry):**
     If slot dimensions, position ($x, y, z$), or parent offsets have shifted, an `UPDATE` statement updates `positionX, Y, Z` and `publishedRevision`.
   - **Case 3: Added Nodes ($D \setminus E$):**
     For each new mapped location not currently in $E$:
     - Check if `locationId` already has a `spatial_nodes` row in the database.
     - If yes, and `source !== 'inventory_builder'`, this triggers the **Manual Node Conflict Check** (Section 4.3).
     - If no, a new `spatial_nodes` record is inserted with the ownership metadata.
   - **Case 4: Pruned / Unmapped Nodes ($E \setminus D$):**
     Any node in $E$ whose `locationId` is no longer in $D$ (meaning the operator unmapped the slot) is **deleted from `spatial_nodes`**:
     ```sql
     DELETE FROM spatial_nodes WHERE id IN (:prunedNodeIds);
     ```
     *Reason:* Leaving obsolete nodes behind creates ghost 3D meshes in the warehouse viewer at superseded coordinates.

3. **Protection Against Failed / Partial Loads:**
   Destructive pruning of $E \setminus D$ is **strictly forbidden** if:
   - The layout payload is marked `status = "DRAFT"`.
   - DTO validation failed or was partial.
   - The transaction encountered any error before commit.

### 4.3 Manual Spatial Node Overwrite & Recovery

If a mapped location in $D$ already has a `spatial_nodes` record where `metadata->>'source' !== 'inventory_builder'` (e.g. manual transform gizmo placement, CAD import, or legacy manual mapping):

1. **Default Behavior (Refusal):**
   The transaction immediately aborts with `HTTP 409 Conflict` (`SPATIAL_NODE_OWNERSHIP_CONFLICT`):
   ```json
   {
     "statusCode": 409,
     "error": "SPATIAL_NODE_OWNERSHIP_CONFLICT",
     "message": "Location 'DEMO-DRAWER-01' has manually authored 3D coordinates. Publishing will overwrite manual geometry.",
     "conflictingLocationId": "151c14eb-bc01-4ec9-b5f3-0e7e768084e5",
     "conflictingLocationCode": "DEMO-DRAWER-01",
     "existingNode": {
       "position": { "x": 120.5, "y": 450.0, "z": 80.0 },
       "modelId": "...",
       "anchorId": "..."
     }
   }
   ```
2. **Opt-in Overwrite with Lossless Recovery:**
   To overwrite, the client must explicitly submit `overwriteManualSpatialNodes: true` after operator confirmation in the UI modal.
   - **Geometry Preservation:** Before updating coordinates, the API archives the previous manual geometry into the node's metadata:
     ```json
     {
       "source": "inventory_builder",
       "layoutId": "...",
       "slotId": "drawer_slot_r0_c0",
       "supersededGeometry": {
         "positionX": "120.5000",
         "positionY": "450.0000",
         "positionZ": "80.0000",
         "rotationX": "0.0000",
         "rotationY": "0.0000",
         "rotationZ": "0.0000",
         "modelId": "...",
         "anchorId": "...",
         "overwrittenAt": "2026-10-02T13:45:00Z",
         "overwrittenBy": "user-uuid"
       }
     }
     ```
   - **Recovery Mechanism:** If the builder layout is later archived or deleted, or if the operator triggers `POST /spatial/layouts/:id/restore-superseded-nodes`, the API inspects `supersededGeometry` and restores the manual coordinates, clearing the builder tags.
3. **Scope Guardrail:** The overwrite check and flag apply **strictly** to the mapped locations in the current layout. Unrelated spatial nodes in the warehouse are completely unaffected.

---

# 5. Concurrency, Row Locking & Atomic Transactions

### 5.1 Multi-Row Locking Sequence

To prevent race conditions where another administrator concurrently reparents or deactivates a location while an operator is saving a layout, the transaction executes a **two-phase row-locking sequence**:

```
Transaction Step 1:
  SELECT * FROM spatial_layouts WHERE id = :layoutId FOR UPDATE;
  -> Exclusively locks the layout header against concurrent layout writers.
  -> (Create has no header yet: it locks the parent container row FOR SHARE instead.)

Transaction Step 2:
  SELECT id, parent_id, is_active, code
  FROM locations
  WHERE id IN (:parentLocationId, ...:mappedLocationIds)
  FOR SHARE;
  -> Places shared locks on the parent container and all mapped locations.
  -> Prevents concurrent transactions from updating or deleting these locations until our commit completes.

Transaction Step 3 (hierarchy chain lock — Phase 3.4.3):
  Derive the ancestor chain of every mapped location (parent -> ... -> mapped)
  from the current hierarchy snapshot, then:
  SELECT id FROM locations WHERE id IN (:chainIds...) ORDER BY id FOR SHARE;
  -> Places shared locks on EVERY row the descendant-membership verdict depends
  -> on, not just the two endpoints. Reparenting an intermediate ancestor takes
  -> an exclusive row lock, so it now serializes strictly before-or-after this
  -> validation instead of slipping through unlocked.
  Re-read the chain links under lock and re-verify membership; on mismatch,
  re-derive and retry (bounded: 3 attempts), then fail closed with
  CONCURRENT_HIERARCHY_MUTATION. Never trust the pre-lock snapshot alone.
```

### 5.1a Parent-Activity Gate on Publication (Phase 3.4.4)

Publication reads the parent's `is_active` from the same `FOR UPDATE`-locked
parent row that serializes competing publications (Step 2b above) and rejects
with `INACTIVE_LAYOUT_PARENT` (HTTP 422) when the parent is inactive. Because
the check runs inside the publication transaction against a locked row:

- a deactivation that commits *before* publication acquires the parent lock is
  observed and publication rejects;
- a deactivation attempted *while* publication holds the lock waits until the
  transaction commits or rolls back, so the two orderings are strictly
  serialized and the final state always matches the commit order.

Draft creation, draft updates, reads, and revision-history inspection never
check parent activity and are unaffected. Mapped-location activity enforcement
(`INACTIVE_LOCATION_MAPPED` per mapped row) is unchanged.

### 5.1b Hierarchy-Locking Invariant (Phase 3.4.3)

**Rule: any transaction validating a location-hierarchy predicate must hold
`FOR SHARE` on every row the predicate reads, in deterministic id order, and
re-verify after locking.**

Rationale: a descendant-membership verdict for mapped location M depends on
every row on the path `parent -> ... -> M`. Locking only the endpoints (parent
+ mapped) leaves intermediate ancestors unlocked, so a concurrent single-row
reparent of an intermediate node commits an invalid mapping — and publishes 3D
nodes for a location outside the container — with no lock wait and no error.
The chain lock closes exactly this gap.

Ordering argument (why no deadlocks):
- All chain locks are `FOR SHARE` in a single `ORDER BY id` statement. Shared
  locks are mutually compatible, so concurrent layout transactions (create /
  update / publish, any parents) never wait on each other over chain order.
- Every location mutation (`PUT /locations/:id`, `DELETE /locations/:id`,
  bulk archive/activate) is a single-row `UPDATE`/`DELETE` taking one exclusive
  row lock and holding no other layout-relevant lock while waiting. A writer
  can wait on a chain lock, but can never hold-while-wait across two rows, so
  no wait-cycle is constructible.
- Upgrading within one transaction (e.g. publish holds `FOR UPDATE` on the
  parent, then requests `FOR SHARE` covering it) is a no-op, not a wait.
- This mirrors the established repo convention for id-ordered row locking
  (`apps/api/src/ml/component-consolidation/consolidation-lock.service.ts`):
  same order everywhere, no opposite-order grabs.

Scope note: no location-mutation path changes. The invariant is enforced
unilaterally by the layout service because all writers already take exclusive
row locks — the protocol is asymmetric by design. If a future writer ever
needs multi-row location updates in one statement, it must adopt id ordering
at that time.

### 5.2 Atomic Execution Flow

```typescript
// apps/api/src/spatial/spatial-layout.service.ts

return await db.transaction(async (tx) => {
  const executor = toDbExecutor(tx);

  // 1. Lock layout header exclusively
  const [layout] = await tx
    .select()
    .from(spatialLayouts)
    .where(eq(spatialLayouts.id, layoutId))
    .for("update");

  if (!layout) throw new SpatialLayoutNotFoundError(layoutId);

  // 2. Atomic expected-revision check (Retryable Conflict)
  if (layout.revision !== dto.expectedRevision) {
    throw new SpatialLayoutRevisionConflictError(
      layout.revision,
      dto.expectedRevision,
      layout.updatedBy,
      layout.updatedAt,
    );
  }

  // 3. Lock parent and mapped locations in shared mode
  const mappedLocIds = dto.mappings.map((m) => m.locationId);
  const lockIds = [layout.parentLocationId, ...mappedLocIds];
  
  const lockedLocations = await tx
    .select({
      id: locations.id,
      parentId: locations.parentId,
      isActive: locations.isActive,
      code: locations.code,
    })
    .from(locations)
    .where(inArray(locations.id, lockIds))
    .for("share");

  const locMap = new Map(lockedLocations.map((l) => [l.id, l]));

  // Verify all mapped locations exist
  for (const m of dto.mappings) {
    const loc = locMap.get(m.locationId);
    if (!loc) throw new LocationNotFoundError(m.locationId);
    if (!loc.isActive) {
      throw new InactiveLocationMappingError(loc.code, m.slotId);
    }
  }

  // 4. In-transaction descendant hierarchy validation
  const validDescendantIds = await getDescendantLocationIdsInTx(executor, layout.parentLocationId);
  for (const m of dto.mappings) {
    if (m.locationId === layout.parentLocationId) {
      throw new ParentCannotBeSlotError(layout.parentLocationId);
    }
    if (!validDescendantIds.has(m.locationId)) {
      throw new ConcurrentHierarchyMutationError(
        locMap.get(m.locationId)!.code,
        "Location no longer belongs to parent container hierarchy",
      );
    }
  }

  // 5. Domain Engine Validation & Stale Signature Check
  const validation = validateParametricConfig(dto.config);
  if (!validation.isValid) throw new InvalidParametricConfigError(validation.errors);

  const generated = generateStorageCompartments(dto.config);
  const diff = diffParametricCompartments(layout.config, generated.compartments);

  // 6. Replace Active Relational Mappings
  await tx.delete(spatialLayoutMappings).where(eq(spatialLayoutMappings.layoutId, layoutId));
  if (dto.mappings.length > 0) {
    await tx.insert(spatialLayoutMappings).values(
      dto.mappings.map((m) => ({
        layoutId,
        slotId: m.slotId,
        slotCode: m.slotCode,
        locationId: m.locationId,
        logicalRow: m.logicalRow,
        logicalCol: m.logicalCol,
        isStale: m.isStale ?? false,
        staleReason: m.staleReason,
        acknowledgedChangeSignature: m.acknowledgedChangeSignature,
      }))
    );
  }

  // 7. Append Immutable Revision Snapshot
  await tx.insert(spatialLayoutRevisions).values({
    layoutId,
    revisionNumber: layout.revision,
    configSnapshot: layout.config,
    mappingsSnapshot: previousMappingsSnapshot,
    diffSummary: diff,
    authorId: user.id,
    changeDescription: dto.changeDescription,
  });

  // 8. Reconcile 3D Spatial Nodes (if PUBLISHED)
  if (dto.status === "PUBLISHED" || layout.status === "PUBLISHED") {
    await reconcileSpatialNodesInTx(
      executor,
      layout,
      generated.compartments,
      dto.mappings,
      dto.overwriteManualSpatialNodes ?? false,
    );
  }

  // 9. Increment Monotonic Revision
  const nextRevision = layout.revision + 1;
  const [updated] = await tx
    .update(spatialLayouts)
    .set({
      config: dto.config,
      templateType: dto.templateType,
      revision: nextRevision,
      status: dto.status ?? layout.status,
      totalCompartments: generated.totalCompartments,
      updatedBy: user.id,
      updatedAt: new Date(),
    })
    .where(eq(spatialLayouts.id, layoutId))
    .returning();

  return updated;
});
```

### 5.3 Categorization of Errors: Retryable Conflicts vs. Non-Retryable Failures

```
                           Error Category
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
Retryable Conflict                              Non-Retryable Validation Error
(409 Conflict)                                  (400 Bad Request / 422 Unprocessable)
- REVISION_CONFLICT                             - PARENT_CANNOT_BE_SLOT (400)
  (Another user saved revision N+1)             - INVALID_PARAMETRIC_CONFIG (400)
- SPATIAL_NODE_OWNERSHIP_CONFLICT               - CONCURRENT_HIERARCHY_MUTATION (422)
  (Manual node exists; opt-in required)         - INACTIVE_LOCATION_MAPPED (422, mapped row)
                                                - INACTIVE_LAYOUT_PARENT (422, parent container)
                                                - DUPLICATE_LOCATION_MAPPING (409)

Client Recovery Flow:                           Client Recovery Flow:
- Fetch latest server revision                  - Highlight offending slot in UI
- Display Diff Modal (Local vs Remote)          - Operator must modify configuration
- Re-submit with updated expectedRevision         or resolve warehouse master data
```

---

# 6. Failure Scenarios & Error Handling Matrix

| Failure Scenario | Trigger Condition | Database Action | API Error Code | HTTP Status | Error Category | UI Handling & Recovery |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **Concurrent Revision Collision** | Operator B submits `expectedRevision: 3` after Operator A already committed revision 4. | Transaction rolls back immediately on `FOR UPDATE` check. | `REVISION_CONFLICT` | `409 Conflict` | Retryable | Builder displays side-by-side **Revision Collision Modal** showing remote changes vs local edits, prompting operator to merge or reload. |
| **Concurrent Location Reparenting** | Location `DEMO-DRAWER-01` was moved to a different cabinet in the locations module while layout was being drafted. | Aborts during in-transaction `FOR SHARE` hierarchy check. | `CONCURRENT_HIERARCHY_MUTATION` | `422 Unprocessable` | Non-Retryable | Displays warning identifying the moved location; marks slot as unmapped and asks operator to save without it. |
| **Concurrent Location Deactivation** | Location was deactivated (`isActive = false`) by warehouse admin while builder was open. | Aborts during in-transaction location check. | `INACTIVE_LOCATION_MAPPED` | `422 Unprocessable` | Non-Retryable | Prompts operator that target location was decommissioned; removes from draft mappings. |
| **Publication Under Inactive Parent** | Parent container was deactivated before or during publication. Drafts remain editable and readable. | Publication aborts during in-transaction parent-activity check against the `FOR UPDATE`-locked parent row; no revision, status, or node changes. | `INACTIVE_LAYOUT_PARENT` | `422 Unprocessable` | Non-Retryable | Prompts operator to reactivate the parent container before publishing; draft work is preserved. |
| **Manual Spatial Node Collision** | Target location already has a 3D node created by CAD import or manual transform gizmo. | Aborts during spatial node reconciliation check. | `SPATIAL_NODE_OWNERSHIP_CONFLICT` | `409 Conflict` | Actionable Conflict | Displays confirmation dialog asking if operator intends to overwrite manual CAD placement (`overwriteManualSpatialNodes: true`). |
| **Parent Location Mapped as Slot** | Request attempts to map `parentLocationId` to one of its own interior compartments. | Aborts during hierarchy validation. | `PARENT_CANNOT_BE_SLOT` | `400 Bad Request` | Non-Retryable | Inspector highlights slot in red; excludes parent container from dropdown. |
| **Duplicate Slot Mapping** | Two different slots attempt to map the same `locationId`. | Blocked by `uniqueIndex("spatial_layout_mappings_layout_location_unique")`. | `DUPLICATE_LOCATION_MAPPING` | `409 Conflict` | Non-Retryable | Invariant enforced in state machine; database rejects as safety net. |
| **Database Failure during Node Sync** | Network timeout or syntax error during spatial node insert. | Complete transaction rollback. | `SPATIAL_SYNC_FAILED` | `500 Internal Error` | Server Failure | Transaction rolled back; revision unincremented; error logged in `activity_events`. |

---

# 7. Migration, Backward Compatibility & Non-Negotiable Invariants

### 7.1 Database Migration Plan
1. **Schema Migration SQL**:
   - File: `packages/database/drizzle/0020_spatial_layouts.sql`
   - Generated via `pnpm --filter @ananya/database db:generate`.
   - Creates `spatial_layouts`, `spatial_layout_mappings`, and `spatial_layout_revisions`.
   - Adds indexes and partial unique constraint `spatial_layouts_active_parent_unique`.
2. **Backward Compatibility**:
   - Existing `locations`, `spatial_models`, `spatial_anchors`, and `spatial_nodes` tables are **unaltered**.
   - Locations without persistent layouts continue functioning normally via legacy 2D grid fallbacks.
   - Zero downtime required; migration is strictly additive.
3. **Rollback Script**:
   - `DROP TABLE IF EXISTS spatial_layout_revisions;`
   - `DROP TABLE IF EXISTS spatial_layout_mappings;`
   - `DROP TABLE IF EXISTS spatial_layouts;`
   - Clean drop leaves existing warehouse tables completely intact.

### 7.2 Non-Negotiable System Invariants

1. **Inventory Invariance**: Layout persistence tables have no foreign keys to `inventory_transactions` or `inventory_projections`, and no code path capable of altering stock quantities.
2. **Ledger Immutability**: No ledger record is ever created, modified, or deleted by layout authoring.
3. **QR Code Permanence**: Barcode strings are derived from `locations.code`, which is never modified by spatial layout persistence.
4. **Physical Safety**: Deleting a spatial layout never deletes a physical warehouse location.

---

# 8. Phased Implementation Plan

```
Phase 3.1: Database Migration & Schema
  ├── Add `spatial_layouts`, `spatial_layout_mappings`, and `spatial_layout_revisions` to packages/database/src/schema/spatial.ts
  ├── Generate Drizzle migration SQL
  └── Export inferSelect / inferInsert types in @ananya/database

Phase 3.2: Domain Repositories & API Service Implementation
  ├── Implement Drizzle repositories for layouts and mappings in apps/api/src/spatial/
  ├── Add SpatialLayoutService with atomic transaction runner, revision checks, and two-phase row locking
  ├── Implement idempotent spatial_nodes reconciliation with metadata ownership tags and supersededGeometry
  └── Expose endpoints in SpatialController with DTO validation and Inventory.Read / Inventory.Update guards

Phase 3.3: Web Workspace Save/Load Flow & Collision Dialog
  ├── Update apps/web/lib/spatial/inventory-builder-state.ts to manage layoutId, revision, and isDirty
  ├── Add "Save Layout" / "Save as Draft" buttons with dirty state indicators in inventory-builder-workspace.tsx
  ├── Implement revision conflict resolution modal (diffing local draft vs remote revision)
  └── Hydrate builder workspace on deep-link /spatial/builder?location=<parentId> from persisted layout

Phase 3.4: Comprehensive Test Suite & Acceptance
  ├── Vitest unit tests for DTO constraints and signature generation
  ├── Concurrency tests proving 409 Conflict on revision mismatch under parallel requests
  ├── Hierarchy safety integration tests (rejecting parent-as-slot, concurrent reparenting, and inactive locations)
  └── Playwright E2E browser tests verifying full load -> edit -> save -> reload -> conflict lifecycle
```

---

# 9. Acceptance Criteria & Test Strategy

| Test Layer | Acceptance Criteria | Execution Tool |
| :--- | :--- | :--- |
| **Unit Tests** (`@ananya/inventory`) | - Deterministic signature generation matches between engine and state machine.<br>- Diff engine accurately detects row orientation inversion. | Vitest |
| **Optimistic Concurrency** (`apps/api`) | - Two parallel `PUT` requests with `expectedRevision: 1`: exactly one succeeds with revision 2; the second fails with `409 Conflict`.<br>- Revision mismatch response returns remote author details. | Vitest Concurrent Runner |
| **Hierarchy Safety** (`apps/api`) | - Attempt to save a mapping for a location belonging to another cabinet throws `CONCURRENT_HIERARCHY_MUTATION` (422).<br>- Attempt to map parent container to a slot throws `PARENT_CANNOT_BE_SLOT` (400).<br>- Mapped location marked `isActive = false` throws `INACTIVE_LOCATION_MAPPED` (422). | Vitest + Test DB |
| **Spatial Node Ownership** (`apps/api`) | - Publication creates `spatial_nodes` with `metadata.source = 'inventory_builder'`.<br>- Re-publishing without edits makes 0 coordinate changes (idempotent).<br>- Unmapping a slot deletes its corresponding `spatial_nodes` record.<br>- Attempting to overwrite a manual CAD node without flag throws `SPATIAL_NODE_OWNERSHIP_CONFLICT` (409).<br>- Overwriting with `overwriteManualSpatialNodes: true` preserves superseded geometry in `metadata.supersededGeometry`. | Vitest + Test DB |
| **E2E Acceptance** (`apps/web`) | - Load layout from DB -> update width -> save succeeds.<br>- Open layout in two tabs -> Tab 1 saves -> Tab 2 attempts save -> Tab 2 displays conflict resolution modal.<br>- Stale mapping acknowledgment survives dimension resizing in persistent round-trip. | Playwright Chromium |

---

# 10. Remaining Blockers Before Phase 3.1 Implementation

Before executing Phase 3.1 code and database migrations, the following alignments are confirmed complete:
1. **Migration Sequence Verification:** Verified that the next Drizzle migration sequence index is `0020_spatial_layouts.sql` (last migration in `packages/database/drizzle/` is `0019_safe_ikaris.sql`).
2. **Repository Boundary Alignment:** Confirmed that `DrizzleSpatialLayoutRepository` will accept `DbExecutor` via `toDbExecutor(tx)` matching the pattern in `packages/database/src/executor.ts`.
3. **No Upstream Schema Conflicts:** Confirmed that `locations` and `spatial_nodes` schemas require zero breaking changes to support Phase 3.
