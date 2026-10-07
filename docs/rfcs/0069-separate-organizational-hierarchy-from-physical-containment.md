# RFC-0069: Separating Organizational Hierarchy from Physical Containment

**Status:** Draft (proposal — not implemented)
**Author:** Ananya Core Architecture & Spatial Engineering
**Created:** 2026-10-07
**Last Revised:** 2026-10-07
**Target Phase:** Spatial Integrity — Location Containment Model
**Related RFCs:** [RFC-0021](0021-warehouse-structure-and-bin-locations.md), [RFC-0062](0062-spatial-inventory-architecture.md), [RFC-0063](0063-spatial-inventory-data-model.md), [RFC-0064](0064-spatial-inventory-visualization.md), [RFC-0066](0066-spatial-inventory-implementation.md), [RFC-0067](0067-spatial-visual-first-ux.md), [RFC-0068](0068-inventory-builder-persistence.md)
**Related Code:**
- Canonical taxonomy: [`packages/inventory/src/spatial/location-model.ts`](../../packages/inventory/src/spatial/location-model.ts)
- Compatibility rules: [`packages/inventory/src/spatial/spatial-compatibility.ts`](../../packages/inventory/src/spatial/spatial-compatibility.ts)
- Location aggregate & use cases: [`packages/inventory/src/locations/`](../../packages/inventory/src/locations/)
- Schema: [`packages/database/src/schema/locations.ts`](../../packages/database/src/schema/locations.ts), [`packages/database/src/schema/spatial.ts`](../../packages/database/src/schema/spatial.ts)
- Consumers: [`apps/api/src/inventory-projections/inventory-projections.service.ts`](../../apps/api/src/inventory-projections/inventory-projections.service.ts), [`apps/api/src/spatial/spatial-layout.service.ts`](../../apps/api/src/spatial/spatial-layout.service.ts), [`apps/web/lib/spatial/inventory-builder-state.ts`](../../apps/web/lib/spatial/inventory-builder-state.ts)
- Read-only audit tool: [`tools/spatial-integrity/diagnose-location-hierarchy.mjs`](../../tools/spatial-integrity/diagnose-location-hierarchy.mjs)

---

# 1. Problem

The Ananya location system stores **three conceptually different relationships in two tables**, and one field carries **two different meanings at once**.

`locations.parentId` is written as an *organizational* parent (creation validates only that the parent exists and is active), but it is *read* as *physical containment* by several downstream systems:

- inventory projection rollup aggregates over the whole `parentId` subtree,
- the Inventory Builder restricts mappable locations to `parentId` descendants,
- the spatial layout service validates mapped locations with a `parentId` ancestor chain **and** the canonical containment graph.

Because the same field answers two questions, a location can be given an organizational parent that is physically impossible, and downstream systems will silently treat it as physical truth.

A read-only audit of the development database (2026-10-07) found **18 relationships that are not canonical physical containment**, all on demo data, e.g. `cabinet → bin` (15) and `shelf → shelf` (3). None of these were rejected at write time, because no containment rule is applied at the write boundary.

Additionally, three categories (`warehouse`, `room_area`, `aisle`) act as **context roots** — they legitimately own physical equipment in the product — yet they have **no** `allowedChildren` in the canonical graph. A `WAREHOUSE → RACK` relationship is therefore real but *not* expressible by the direct containment relation.

## 1.1 Why this must be fixed before it is enforced

Enforcing the canonical graph directly on `parentId` (RFC alternative **B**) would forbid `warehouse → cabinet`, which the product legitimately does today (7 such relationships exist and render correctly). The relationship is not an error; the *model* is missing a concept. The fix is to **separate the two relations**, not to make one of them stricter.

---

# 2. Current Architecture

```text
                        ┌──────────────────────────────────────────┐
                        │              locations                    │
                        │  id, code, name, kind, parentId, …        │
                        │  parent_id → locations.id (nullable,      │
                        │             onDelete: restrict)           │
                        └──────────────┬───────────────────────────┘
                                       │
             ┌─────────────────────────┼──────────────────────────────┐
             │                         │                              │
   ┌─────────▼─────────┐   ┌───────────▼───────────┐      ┌───────────▼────────────┐
   │ Organizational use │   │  Physical use         │      │  Spatial placement     │
   │ (what parentId     │   │  (what parentId is    │      │  (own graph)           │
   │  was written as)   │   │   READ as)            │      │                        │
   ├────────────────────┤   ├───────────────────────┤      ├────────────────────────┤
   │ create / update    │   │ inventory rollup       │      │ spatial_layouts        │
   │ detail page        │   │ (`getByLocation`)      │      │  .parentLocationId     │
   │ breadcrumbs        │   │ Builder descendant     │      │ spatial_layout_        │
   │ tree navigation    │   │  scope                 │      │  mappings.locationId   │
   │ barcode path       │   │ spatial mapping        │      │ spatial_nodes          │
   │                    │   │  ancestor chain        │      │  .parentSpatialNodeId  │
   └────────────────────┘   └───────────────────────┘      └────────────────────────┘
```

Three distinct semantics are currently entangled:

| # | Concept | Storage today | Written by | Read as |
|---|---------|---------------|-----------|---------|
| 1 | Organizational hierarchy | `locations.parentId` | create/update (permissive) | navigation, breadcrumbs, tree, barcode path, **and** rollup / Builder / mapping |
| 2 | Physical containment | `SPATIAL_CATEGORY_DEFINITIONS[*].allowedChildren` (in code, not stored) | nothing (not persisted) | spatial mapping validation, Builder kind filtering |
| 3 | Spatial placement | `spatial_nodes.parentSpatialNodeId` | publish/archive | rendering, locate, ancestry checks |

Concept **(2) is not persisted anywhere**. It exists only as a validation rule inside the spatial layout service. That is why the write boundary cannot enforce it — there is nowhere to record the physical parent.

---

# 3. Evidence

All items below were confirmed from repository files and the development database during the 2026-10-07 audit. Cited facts are marked **VERIFIED**; conclusions that are reasoned but not directly asserted by code are marked **ASSUMPTION**.

### 3.1 VERIFIED — write boundary is organizational

- `CreateLocation` (`packages/inventory/src/locations/create-location.ts`) checks only parent existence + active. It calls neither `canContainLocation` nor any physical rule.
- `UpdateLocation` (`packages/inventory/src/locations/update-location.ts`) adds a self-parent guard and (as of the integrity cleanup) a bounded cycle check. It still performs **no** physical category validation.
- `Location.create` generates a **fresh identity**, so a create can never form a cycle; only re-parenting can. This is why the cycle check lives in `UpdateLocation` only.
- The `locations` table stores `parent_id` as a nullable self-FK with `onDelete: "restrict"`, no `CHECK`, and no cycle constraint.

### 3.2 VERIFIED — consumers read `parentId` as physical

- **Inventory rollup**: `inventory-projections.service.ts` (`getByLocation`) loads all locations, builds `childrenByParent` from `parentId`, BFS-walks the subtree, then aggregates. Its doc comment states it returns stock "at the given location and every descendant location".
- **Builder scope**: `inventory-builder-state.ts` / `compartment-inspector.tsx` restrict mappable candidates to `getDescendantLocationIds(..., parentId)` **and** `checkSpatialMappingCompatibility(...)`.
- **Spatial mapping**: `spatial-layout.service.ts` (`validateMappingsHierarchyAndActivity`) locks the `parentId` ancestor chain with `FOR SHARE` (deterministic id order, bounded retry) and rejects mappings whose location is not a `parentId` descendant, then applies `assertSlotKindCompatibility` → `canContainLocationWithinHierarchy`.

### 3.3 VERIFIED — the canonical graph and context roots

- `SPATIAL_CATEGORY_DEFINITIONS[*].allowedChildren` defines the direct physical containment graph; `canContainLocation` / `canContainLocationWithinHierarchy` / `resolveContainingCategories` operate on it.
- `warehouse`, `room_area`, `aisle` are `classification: "context"` with `allowedChildren: []`. They render as a cutaway **shell** (`WAREHOUSE_SHELL_KINDS`), never as a compartment body.
- The new descriptive predicate `isContextRootCategory()` / `canRootPhysicalEquipment()` identifies exactly those three categories. It does **not** modify `allowedChildren` and does **not** change any containment verdict (asserted by test).
- `classifyLocationHierarchyRelationship(parentKind, childKind)` classifies a persisted relationship as `canonical` / `context-root` / `legacy-compatible` / `violation`.

### 3.4 VERIFIED — the read-only audit (dev DB, 2026-10-07)

```
locations                       : 212
top-level (parent_id IS NULL)   :  73
existing cycles                 :   0        (max depth 3)

relationships scanned           : 139
canonical                       : 102
context-root                    :   7
legacy-compatible               :  12
violations                      :  18
  cabinet → bin                 :  15
  shelf → shelf                 :   3
```

- **All 18 violations are `DEMO-*` rows.** Verified: a query restricted to `code NOT LIKE 'DEMO-%'` returns **0 violations**.
- `legacy-compatible` (12) is the archived `GRID_PARTS_TRAY` layout, whose tray cells were recorded as `bin` locations (legacy `tray` → `bin`).
- `context-root` (7) is `warehouse → {cabinet ×4, rack, shelf, tray}`.

### 3.5 VERIFIED — spatial placement is a separate graph

- `spatial_nodes.parentSpatialNodeId` is a self-FK with `onDelete: "set null"`; exactly one node per location (`spatial_nodes_location_id_unique`).
- `spatial_layouts.parentLocationId` is `NOT NULL` with a partial unique index on `status = 'PUBLISHED'`.
- `spatial_layout_mappings.locationId` is a FK to `locations.id` with `onDelete: "restrict"`.

### 3.6 ASSUMPTION — product intent for context roots

The product intends a warehouse / room / aisle to *own* the physical equipment placed inside it (a warehouse "contains" cabinets and racks as scene contents). This is inferred from the rendered warehouse shell + composed children, and from the fact that the demo data was authored this way. No code asserts it as a containment rule today — which is precisely the gap this RFC closes.

---

# 4. Goals

1. Give **physical containment** its own persisted, first-class representation without overloading `parentId`.
2. Keep `parentId` meaning exactly one thing: **organizational hierarchy**.
3. Keep `spatial_nodes.parentSpatialNodeId` meaning exactly one thing: **spatial placement**.
4. Make `warehouse` / `room_area` / `aisle` able to **own physical equipment** as an explicit, named relation — without turning `allowedChildren` into a giant list.
5. Preserve all existing product behavior during migration (no destructive rewrite, no ledger change, no invalidated published layouts).
6. Ensure **no screen or subsystem invents its own containment semantics**.

# 5. Non-Goals

- No change to inventory transactions, the ledger, reservations, or transfers.
- No change to spatial publication semantics (revision lifecycle, stale mappings, node ownership).
- No new location categories, no new Builder presets.
- No removal of legacy `tray` / `slot` / context-alias compatibility.
- No enforcement of physical containment on `parentId`.
- No automatic destructive migration of demo data.

---

# 6. Proposed Architecture

Introduce **one** persisted relation: `locations.containerId`.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                              locations                                   │
│  id, code, name, kind,                                                   │
│  parentId     → locations.id   (organizational; permissive, cycled-safe) │
│  containerId  → locations.id   (physical; canonical-validated, nullable) │
└───────────┬────────────────────────────┬────────────────────────────────┘
            │                            │
   organizational                        physical
   (navigation, breadcrumbs,             (inventory physical rollup,
    tree, org rollup, barcode)            Builder candidate scope,
                                          spatial mapping ancestry)
            │                            │
            │                  ┌─────────▼──────────────────────────────┐
            │                  │ spatial_layouts.parentLocationId        │
            │                  │ spatial_layout_mappings.locationId      │
            │                  │ spatial_nodes.parentSpatialNodeId       │
            │                  │   (placement — still its own graph)     │
            │                  └─────────────────────────────────────────┘
```

- `parentId` — unchanged column, unchanged write semantics, now **documented** as organizational only.
- `containerId` — new nullable self-FK; the persisted form of concept (2).
- `parentSpatialNodeId` — unchanged; **never** derived from `containerId`.

### 6.1 Relationship between the two location relations

`parentId` and `containerId` are **independent**. A location may have:

| `parentId` | `containerId` | Meaning |
|---|---|---|
| set | set | stored inside a physical container, and grouped under an organizational parent (often the same) |
| set | null | grouped organizationally but not physically stored inside anything (e.g. a top-level cabinet) |
| null | set | physically inside a container whose organizational grouping differs (rare; requires care) |
| null | null | top-level organizational root with no physical container |

The RFC recommends a **UI-level convention** (`containerId` defaults to the organizational parent when the pair is physically valid) but **no schema-level coupling** — the two must remain independently settable so the model can express the truth.

---

# 7. Semantics

## 7.1 `parentId` — organizational hierarchy

**Means:** "this location is grouped under that location in the operational tree."

**May point to:** any location, subject only to acyclicity and active-parent rules.

**May represent:** organizational grouping, warehouse membership, room/area membership, and legacy groupings. It **may** coincide with physical containment, but it does not assert it.

**Must not be read as** physical containment by any subsystem after this RFC is implemented.

**Invariants (unchanged):**
- parent must exist and be active,
- a location may not parent itself,
- the `parentId` chain must be acyclic (existing `LocationHierarchyCycleError` guard remains).

## 7.2 `containerId` — physical containment

**Means:** "this location is physically stored inside that location."

**Valid container parent categories** are defined by a single predicate (Section 11):

```
canBePhysicalContainer(parent, child) =
    canContainLocation(parent, child)                          # canonical direct edge
 OR ( isContextRootCategory(parent)                            # context-root ownership
      AND ( isContextRootCategory(child)                       # a space inside a space
            OR isPhysicalRootCategory(child) ) )               # a space owning equipment
```

where `isPhysicalRootCategory(c)` = `classification === "physical" && root === "yes"`.

**Root / context semantics:** a context root (`warehouse`, `room_area`, `aisle`) may be a container of other context roots and of physical **root** categories. It may **not** be a container of a bare `compartment` / `reel_slot` (which require a physical parent).

**Null semantics:** `containerId = null` means "not physically stored inside another location". This is the correct value for:
- every context root at the top of a facility,
- any physical location at the top of its own physical assembly (e.g. an unparented cabinet),
- any relationship that cannot be expressed by the canonical graph and has not been manually reconciled.

**Does every physical location need one?** No. Only a location that is *inside* another location needs a non-null `containerId`. A top-level physical root legitimately has `null`.

**Can context roots be containers?** Yes — that is the entire point of the context-root relation. They remain `allowedChildren: []`; the ownership relation is a **separate predicate**, not a modification of the direct graph.

**Validation:** on write, `CreateLocation` / `UpdateLocation` validate `containerId` with `canBePhysicalContainer` plus acyclicity and active-container checks (Section 12). The canonical category graph remains the authority for category compatibility.

## 7.3 `spatial_nodes.parentSpatialNodeId` — spatial placement

**Means:** "this placed instance is positioned relative to that placed instance" (parent-relative transforms).

**Relationship to `containerId`:** **orthogonal.** `containerId` says *what a location is physically inside*; `parentSpatialNodeId` says *how an instance is laid out in the scene*. They usually correspond, but they are not interchangeable:

- A layout may place a child **inside** a container node (`containerId` = container) or as a **sibling/anchored** instance (a mapping with no slot), so placement can exist without a containing *node*.
- A node's parent may be a **frame** that is itself not a stored container (e.g. a warehouse shell), while the location's `containerId` is a specific cabinet.

**Rule:** spatial placement must **never** be derived from `containerId`, and `containerId` must **never** be inferred from `parentSpatialNodeId`. Publication reconciles geometry; it does not define containment.

---

# 8. Context Roots

`warehouse`, `room_area`, `aisle` must be able to own physical equipment **without** adding any category to `allowedChildren`.

The distinction this RFC draws:

| Relation | Question | Authority | Stored? |
|---|---|---|---|
| **Physical child containment** | "is B a *component part* of A's structure?" | `allowedChildren` / `canContainLocation` | via `containerId` |
| **Context-root ownership** | "does A's *space* hold B as equipment?" | `isContextRootCategory(A)` + `isPhysicalRootCategory(B)` | via `containerId` |

Consequences:

- `warehouse → rack`, `warehouse → cabinet`, `warehouse → shelf`, `warehouse → matrix_tray` are **valid `containerId` relationships** because the parent is a context root and the child is a physical root category. They are **not** valid `allowedChildren` edges and never will be.
- `warehouse → compartment` is **invalid** `containerId`: a compartment is not a physical root (`root: "conditional"`), so it must be inside a rack/shelf/drawer/bin, not directly in a space.
- `warehouse → room_area` and `warehouse → aisle` are valid (`context root → context root`) — a facility contains its rooms and aisles.
- The direct graph stays minimal and unchanged: `rack → shelf`, `shelf → {bin, matrix_tray, compartment, ic_tube_rail}`, `cabinet → {drawer, shelf}`, `dry_cabinet → {drawer, shelf, matrix_tray}`, `drawer → {bin, matrix_tray, compartment, ic_tube_rail}`, `bin → compartment`, `reel_rack → reel_slot`, `matrix_tray → compartment`.

This is why the context-root predicate is **necessary infrastructure**: it makes a real, already-relied-upon relation expressible without corrupting the physical graph.

---

# 9. Inventory Rollup

The ledger is untouched. Only the **read-side aggregation** is in scope.

### Options

**A. Roll up by `parentId` (status quo).**
Keeps current output exactly. But the rollup silently follows organizational edges that may be physically impossible — a cabinet's "total stock" can include bins that are not physically in the cabinet.

**B. Roll up by `containerId`.**
Answers the physical question ("what stock is physically inside this location") correctly. Changes output for the 18 demo violations and for any location whose organizational parent differs from its physical container.

**C. Explicitly support both, as two named primitives.**
- **physical rollup** — over `containerId` descendants ("stock physically here").
- **organizational rollup** — over `parentId` descendants ("stock grouped under this branch").

### Recommendation: **C**

Neither question is illegitimate:
- a warehouse operator picking from a cabinet asks the **physical** question;
- a planner looking at a facility branch asks the **organizational** question.

Collapsing them is the bug being fixed. The RFC recommends two explicitly named capabilities, with the **physical** primitive implemented first and the **organizational** primitive retained for existing screens.

### Where results differ (worked examples, from the audit)

| Location | `parentId` descendants | `containerId` descendants | Difference |
|---|---|---|---|
| `DEMO-SPATIAL-OPEN-BINS` (cabinet, 15 bins) | 15 bins | **0** (a cabinet physically contains drawers/shelves; all 15 bins get `containerId = null`) | organizational rollup includes 15 bins; physical does not |
| `DEMO-SPATIAL-TRAY` (legacy tray → matrix_tray, 12 bins) | 12 bins | 12 bins (documented legacy pair) | same — legacy pair preserved |
| `DEMO-SPATIAL-WAREHOUSE` (context root) | 7 equipment rows | 7 equipment rows | same — context-root ownership is valid |
| a top-level cabinet (37 of 41) | 0 | 0 | same |

Migration therefore changes rollup output **only** for genuinely non-physical relationships, and the fallback (§10) keeps output stable until Phase 4.

### Ledger guarantee

`calculate-inventory-projection` filters transactions by exact `sourceLocationId` / `destinationLocationId`. Rollup is a *presentation* aggregate over projections. **No transaction is read, rewritten, or reinterpreted.**

---

# 10. Builder Scope

**Current:** mappable candidates = `parentId` descendants ∩ kind-compatible.

**Invariant that must hold:** *a layout parent may only map locations that are physically valid descendants of that layout parent.*

### Rules (future)

1. The layout root (`spatial_layouts.parentLocationId`) is the physical container being authored.
2. A candidate location is eligible iff it is a **`containerId` descendant** of the layout root **and** `canBePhysicalContainer` / slot compatibility accepts its category for the target slot.
3. **Organizational descendants are not eligible** unless they are also physical descendants. An organizational-only grouping never grants Builder access.
4. Context roots as layout roots: a warehouse layout may map physical root categories it owns (warehouse bay plan). It may not map a bare `compartment`.

### Fallback (Phase 2)

While `containerId` is partially populated, eligibility = `containerId` descendant **OR** (`containerId IS NULL` **and** the `parentId` relationship is not a `violation` per `classifyLocationHierarchyRelationship`). This preserves current behavior for un-migrated rows without ever extending scope along a known-violation edge.

---

# 11. Spatial Mapping

Authority for each check, with **exactly one** owner per question (no ambiguous double validation):

| Check | Authority | Notes |
|---|---|---|
| **Layout ownership** | `spatial_layouts.parentLocationId` + `metadata.source/layoutId` node-ownership predicate | unchanged (RFC-0068) |
| **Physical containment** | `containerId` ancestry **AND** canonical category compatibility (`canBePhysicalContainer`) | the single physical authority |
| **Organizational visibility** | `parentId` ancestry | *presentation/authorization* only; never grants mapping eligibility |
| **Inactive parent** | existing `INACTIVE_LAYOUT_PARENT` rule | unchanged |
| **Archived layout** | existing status machine | unchanged |
| **Stale mappings** | existing `acknowledgedChangeSignature` | unchanged; hierarchy drift now keyed on `containerId` |

### Avoiding double validation

Today, physical containment is validated **twice** — once via the `parentId` ancestor chain and once via the canonical graph. After this RFC the chain check reads `containerId` ancestry, and the category check reads the canonical graph. The two are **different questions** (which specific location vs which category), so they are complementary, not duplicate. The `parentId` chain lock remains only to detect **organizational** drift for presentation, and must not gate a mapping.

### Concurrency (unchanged shape)

The existing `FOR SHARE` chain lock (`getAncestorChainIds`, deterministic id order, bounded retry) is retargeted to walk `containerId`. The lock-ordering argument in RFC-0068 §5.1 is preserved: replacing one self-referencing chain with another of the same shape keeps the wait-graph acyclic, provided every location mutation still takes an exclusive row lock and the chain is always locked in id order.

### Publication semantics

**Unchanged.** Revision bumping, idempotent republish, spatial-node reconciliation, archive cleanup, and stale-mapping lifecycle all remain as specified in RFC-0068.

---

# 12. API Contract

*(Design only — no DTO changes in this task.)*

### `CreateLocation` / `UpdateLocation`

| Field | Type | Required | Validated as |
|---|---|---|---|
| `parentId` | `string \| null` (UUID) | optional | organizational: exists, active, acyclic, not self |
| `containerId` | `string \| null` (UUID) | optional, **nullable** | physical: exists, active, acyclic, not self, `canBePhysicalContainer(container.kind, kind)` |

`containerId` is **independently validated** from `parentId`. Supplying one never implies the other. `containerId: null` explicitly clears physical containment; omitting it leaves it unchanged (matching `parentId` semantics).

### `Location` response

```jsonc
{
  "id": "…",
  "code": "…",
  "kind": "cabinet",
  "parentId": "…",      // organizational
  "containerId": "…",   // physical (null when not physically contained)
  // …
}
```

Both fields are returned. Neither is derived from the other.

### Errors for invalid physical containment

| Condition | Error | HTTP |
|---|---|---|
| container does not exist | `ContainerLocationNotFoundError` | 400 |
| container is inactive | `InactiveContainerLocationError` | 409 |
| container is self | `CannotContainSelfError` | 400 |
| would create a `containerId` cycle | `ContainerHierarchyCycleError` | 400 |
| category not physically containable | `InvalidPhysicalContainmentError` | 400 |

Error names mirror the existing `CannotParentToSelfError` / `InactiveParentLocationError` / `LocationHierarchyCycleError` family so the exception filter and clients stay consistent.

---

# 13. UI

### Location form / detail

Two clearly labeled, independent fields:

- **Organizational Parent** — "where this location appears in the tree" (existing behaviour, existing picker).
- **Physical Container** — "what this location is physically stored inside" (new picker, constrained to `canBePhysicalContainer`).

Ergonomics:
- When `containerId` is null and `parentId` is physically valid, offer a single "Same as organizational parent" toggle (default on) so the common case stays one click.
- Show the **Physical Container** field only for physical categories; hide it for context roots whose only valid containers are other context roots.
- Location detail renders both, labeled, with the physical chain shown alongside the organizational hierarchy path.

### Builder

The Builder header must name the physical container being authored ("Authoring layout for **Cabinet A** — physical container") and, when a candidate is excluded, show the reason from the canonical classifier. This makes the distinction visible exactly where it matters, without adding a second navigation tree.

### Scope discipline

No screen may compute containment from `kind` string comparisons. Every containment question routes through the canonical predicates. (The Facilities KPI already consumes `isContextRootCategory`; that pattern becomes the standard.)

---

# 14. Data Integrity

Rules, each with its authority and failure mode:

| Rule | Applies to | Behaviour |
|---|---|---|
| Self container | `containerId = id` | reject (`CannotContainSelfError`) |
| Container cycle | re-parenting a container | bounded ancestor walk; reject (`ContainerHierarchyCycleError`) |
| Organizational cycle | `parentId` | **existing** guard retained unchanged |
| Invalid category containment | `containerId` pair | reject via `canBePhysicalContainer` |
| Inactive container | `containerId` target | reject on write; publication keeps its existing `INACTIVE_LAYOUT_PARENT` rule |
| Deleting a container | delete location | blocked by existing `onDelete: "restrict"` + `LocationHasChildrenError`; **extend the child check to also consider `containerId`** |
| Moving a location | update | re-validate its own `containerId`; do **not** silently re-derive children's containers |
| Archived layout | publication | unchanged |
| Published layout | publication | unchanged (one published layout per parent location) |

Malformed pre-existing cycles must be handled **safely**: all traversal is bounded with a visited guard, so an existing cycle terminates instead of hanging (already implemented for the organizational walk).

---

# 15. Legacy Data

Per the actual diagnostic categories. **No destructive automatic migration.**

| Pattern | Count | Decision | `containerId` |
|---|---|---|---|
| `warehouse → cabinet/rack/shelf/tray` | 7 | **Valid** context-root ownership | set to the warehouse |
| `tray → bin` (legacy `tray`) | 12 | **Documented legacy-compatible** pair | set to the tray (`matrix_tray`) |
| `cabinet → bin` | 15 | Not physically containable (`bin` is a physical root; `cabinet` is not a context root). Preserve organizationally | **leave `null`**; flag for manual reconciliation |
| `shelf → shelf` | 3 | Not containable; sub-levels of a shelf unit. Preserve organizationally | **leave `null`**; flag for manual reconciliation |
| unparented cabinets | 37 | Legitimate top-level physical roots | **leave `null`** (optional Phase 3: assign the facility context root) |
| legacy `tray` kind row | 1 | Retain `tray` compatibility; canonicalizes to `matrix_tray` | as `tray → bin` above |
| `bin → drawer` (inverse) | 2 | Not canonical (correct edge is `drawer → bin`) | **leave `null`**; manual reconciliation |

**Justification for leaving `null`:** a `null` container is an honest statement ("not physically contained as far as we can determine") and is *erased-losslessly* — it never asserts a false physical fact. Auto-assigning a container that the canonical graph rejects would recreate exactly the split-authority bug this RFC removes. Because every violation is DEMO data, nothing in production is blocked by this choice.

**DEMO rows are never required to be migrated for correctness.** They are seed data; they can be re-authored, or left organizational-only, without touching the ledger.

---

# 16. Migration Plan

Additive, reversible, and read-compatible at every step.

### Phase 1 — Schema + read-only tooling
- Add nullable `containerId` (self-FK, `onDelete: "restrict"`, indexed) via a versioned SQL migration.
- Ship the read-only diagnostic (already present) and extend it to report `containerId` coverage.
- No reader changes. No data writes. **Rollback: drop the column.**

### Phase 2 — Dual-read / fallback
- Physical consumers resolve `containerId`; when `null`, fall back to `parentId` **only if** `classifyLocationHierarchyRelationship(parent.kind, child.kind)` is not a `violation`.
- Behaviour is byte-identical to today for all rows that have not been migrated.
- **Rollback: disable the fallback flag; behaviour returns to Phase 1.**

### Phase 3 — Populate `containerId` for unambiguous relationships
- Backfill only rows where `canBePhysicalContainer(parent.kind, child.kind)` **and** the existing `parentId` relationship is `canonical` / `context-root` / `legacy-compatible`.
- Rows that are `violation` are **excluded** and reported.
- Idempotent, re-runnable, non-destructive. **Rollback: set `containerId = null` (no source data was altered).**

### Phase 4 — Switch physical consumers
- Inventory physical rollup, Builder scope, and spatial-mapping ancestry read `containerId` exclusively.
- Organizational rollup and navigation continue on `parentId`.
- Verify against recorded pre-switch outputs. **Rollback: re-enable the Phase 2 fallback.**

### Phase 5 — Remove fallback
- Only after verification: delete the fallback branch and require `containerId` for newly created in-container locations.
- `parentId` is never removed.

**Guarantees throughout:** inventory transactions are never read, rewritten, or reinterpreted; `parentId` values are never changed; published layouts stay valid because publication semantics are untouched.

---

# 17. Rollback

| Phase | Rollback action | Data loss |
|---|---|---|
| 1 | drop `containerId` | none |
| 2 | disable fallback | none |
| 3 | `containerId = null` | none (no source mutation) |
| 4 | re-enable fallback | none |
| 5 | restore fallback branch | none |

There is **no point** in the plan where rollback requires rewriting inventory, locations' `parentId`, or spatial layouts.

---

# 18. Compatibility

- **Backward compatible:** `containerId` is additive and nullable; every existing client keeps working.
- **Legacy kinds** (`tray`, `tube`, `slot`, context aliases) remain accepted on write and canonicalized. The documented legacy pairs remain valid **containment** relationships.
- **Published layouts** remain valid; no revision or node is rewritten.
- **Read-only fallback** guarantees no output changes until Phase 4 is verified.
- **`allowedChildren` is never modified**, so every existing containment verdict is preserved.

---

# 19. Security / Concurrency Considerations

- **Authorization is not containment.** `parentId` visibility is a *presentation* concern; it must never be used to grant physical mapping eligibility, and vice versa.
- **Lock shape unchanged.** The container chain is locked `FOR SHARE` in deterministic id order, preserving the RFC-0068 §5.1 deadlock-freedom argument. Every location mutation still takes an exclusive row lock.
- **Bounded traversal** everywhere, so a malformed pre-existing cycle cannot produce an unbounded loop or a lock-hold stall.
- **No new mutation surface:** population happens in an idempotent maintenance path, not on request paths.
- **Fail closed** on ambiguity: an unresolvable `containerId` is treated as `null`, never guessed.

---

# 20. Testing

| Area | Tests |
|---|---|
| Organizational-only hierarchy | create/update/reparent via `parentId`; acyclicity; self-parent; inactive parent |
| Physical-only hierarchy | `containerId` create/update; `canBePhysicalContainer` accept/reject matrix |
| Context roots | `warehouse/room_area/aisle → physical root` accepted; `→ compartment` rejected; `allowedChildren` unchanged |
| Canonical containment | regression on `canContainLocation` / `WithinHierarchy`; verdicts unchanged |
| Container cycles | `A→B→A`, `A→B→C→A`, self; bounded termination on malformed data |
| Organizational cycles | existing guards retained |
| Inventory rollup | physical vs organizational outputs; ledger untouched; worked examples from §9 |
| Builder scope | physical descendants eligible; organizational-only descendants rejected; context-root roots |
| Spatial mapping | `containerId` ancestry + category check; no double-validation ambiguity |
| Published layouts | unchanged publish/archive/stale behaviour |
| Legacy fallback | un-migrated rows behave identically to today; violation edges never extend scope |
| Migration correctness | Phase 3 idempotency; violation rows excluded; pre/post output equality for canonical/context-root/legacy rows |
| Diagnostic | classification logic; read-only guarantee (row counts unchanged) |

---

# 21. Acceptance Criteria

The eventual implementation MUST guarantee:

1. `parentId` never silently becomes physical containment.
2. `containerId` — and only `containerId` — is canonical physical containment.
3. The canonical graph (`SPATIAL_CATEGORY_DEFINITIONS[*].allowedChildren`) remains the authority for physical category compatibility.
4. Context roots remain separate from physical child categories.
5. Spatial placement remains distinct from location containment.
6. Inventory transactions are untouched.
7. Existing published layouts remain valid.
8. Legacy data can be represented without destructive rewriting.
9. No screen invents its own containment semantics.

---

# 22. Open Questions

1. **Should `containerId` be required for *newly created* in-container locations** (Phase 5), or remain optional with a warning?
2. **Do `cabinet → bin` and `shelf → shelf` represent an intended packing form** (e.g. bins packed directly in a cabinet) that should become a canonical/legacy pair, or are they demo modelling artifacts?
3. ~~**Should a context root be allowed to contain a non-root physical category** (e.g. `warehouse → drawer`) as a convenience, or must equipment always sit under its physical root?~~ **RESOLVED (RFC-0069 Phase 3A, 2026-10-07):** a context root may directly contain only a **context root** or a canonical **physical ROOT** category (`classification === "physical" && root === "yes"`). `warehouse → drawer` is therefore **valid** (a drawer is a physical root); `warehouse → compartment` and `warehouse → reel_slot` remain **invalid** (they are `root: "conditional"` and must sit inside their physical root). The Phase 2 `canBePhysicalContainer` formula is unchanged.
4. **Organizational visibility**: is `parentId` ever an authorization boundary today, or purely presentational?
5. **Rollup default**: which rollup should the existing `/by-location` endpoint use after Phase 4 — physical, organizational, or an explicit mode parameter?
6. **Un-parented cabinets**: should Phase 3 auto-assign them to the facility context root, or leave them `null`?
7. **Diagnostic gating**: should the read-only diagnostic run in CI and fail on `violation` count above a recorded baseline?

---

# 23. Alternatives Considered

### A. Keep `parentId` for everything
Rejected. This is the status quo; it is the defect. Physical rollup, Builder scope, and mapping would continue to depend on an unvalidated field, and context roots remain inexpressible.

### B. Enforce canonical containment directly on `parentId`
Rejected. It would forbid `warehouse → cabinet` (7 real, correctly-rendering rows) and `cabinet → bin` (15 demo rows) at write time — a **capability regression**, not a fix. It also provides no way to express context-root ownership, and it conflates "org grouping" with "physical part-of". It would additionally invalidate existing demo data and require blocking validation on the create path.

### C. Add `containerId` **(recommended)**
Separates the two relations without removing either capability. Additive, nullable, backward compatible, reversible, with a read-only fallback that makes migration behaviour-preserving. Reuses the new context-root predicate to express a relation the product already relies on. Requires no ledger change and no published-layout change.

**Why C on the evidence:** the audit proves the two relations are *not* the same — creation is permissive/organizational, mapping is strict/physical — and that the product depends on **both** (warehouse-rooted equipment is real; physically-impossible nesting is also present). The only model that expresses both truths without losing a capability is two relations. Options A and B each sacrifice one truth; D (hybrid) collapses to C plus extra complexity.

### D. Hybrid (dual-write `parentId` as physical, keep a separate org tree)
Rejected as a distinct option. It is C with an inverted default and an extra copy of the organizational tree; it adds coupling and duplicate authority without adding expressiveness.

---

# 24. Consequences

**Positive:** one authority per question; physical containment becomes persistable and enforceable; context roots expressible; migration is reversible and behaviour-preserving; no ledger or publication impact.

**Negative / costs:** a new column and predicate to maintain; two fields for users to understand (mitigated by the "same as organizational parent" default); physical consumers must migrate in a coordinated phase; the fallback branch exists for a bounded period.

---

# 25. Implementation Sketch (not implemented)

Files that **would** change in a future implementation, per phase:

**Phase 1 — schema & tooling**
- `packages/database/src/schema/locations.ts` (add `containerId`, index)
- `packages/database/migrations/*` (new versioned SQL migration)
- `tools/spatial-integrity/diagnose-location-hierarchy.mjs` (report `containerId` coverage)

**Phase 2 — dual-read**
- `packages/inventory/src/locations/location.ts` (prop + `create`/`update`/`rehydrate`)
- `packages/inventory/src/locations/location.repository.ts` (persist `containerId`)
- `apps/api/src/infrastructure/repositories/drizzle-location.repository.ts` (column mapping)
- `packages/inventory/src/spatial/location-model.ts` (`canBePhysicalContainer`, `isPhysicalRootCategory`)

**Phase 3 — population**
- `tools/spatial-integrity/*` (idempotent backfill script, read-only report first)

**Phase 4 — switch consumers**
- `apps/api/src/inventory-projections/inventory-projections.service.ts` (physical rollup primitive)
- `apps/web/lib/spatial/inventory-builder-state.ts` + `apps/web/components/spatial/builder/compartment-inspector.tsx` (Builder scope)
- `apps/api/src/spatial/spatial-layout.service.ts` (ancestry on `containerId`)
- `packages/inventory/src/spatial/spatial-layout.types.ts` (`getDescendantLocationIds` / `getAncestorChainIds` container variants)

**Phase 5 — remove fallback**
- the fallback branches introduced in Phase 2

**Phase 4/5 — API & UI**
- `apps/api/src/locations/{create,update}-location.dto.ts`, `location-exception.filter.ts`
- `apps/web/components/locations/location-form.tsx`, `apps/web/app/inventory/locations/[id]/page.tsx`

**No phase touches:** `inventory_transactions`, `spatial_layouts` / `spatial_layout_mappings` semantics, `spatial_nodes.parentSpatialNodeId` semantics, or `SPATIAL_CATEGORY_DEFINITIONS[*].allowedChildren`.

---

# 26. Decision Summary

**Key architectural decision:** introduce a nullable, independently-validated **`containerId`** as the sole persisted representation of **physical containment**, keep **`parentId`** as **organizational hierarchy** only, keep **`parentSpatialNodeId`** as **spatial placement** only, and express **context-root ownership** through a dedicated predicate (`isContextRootCategory` + physical-root detection) rather than by extending `allowedChildren`.

**Unresolved decisions:** the seven Open Questions in §22 — most notably whether `cabinet → bin` / `shelf → shelf` reflect an intended packing form, and which rollup the existing endpoint should default to after Phase 4.

**Confirmation:** this RFC is a design document. **No code, data, or schema was changed. No migration was created. Nothing was committed or pushed.** The change set remains exactly the files produced by the Spatial Integrity Cleanup task (24 files), and no database rows were written.
