# Component Consolidation

> **Consolidation retires a duplicate component into a canonical one.**
> It never deletes or merges records: the retired component keeps its identity,
> its SKU and every historical foreign key that points at it.

This document covers both halves of the feature:

| Layer | Pass | Mutates data? |
| --- | --- | --- |
| Consolidation **preview** (preflight analysis) | 6A | No — `SELECT` only |
| Consolidation **execution** | 6B | Yes, in one transaction |

---

## 1. What this feature does

Given a duplicate finding, Component Intelligence can consolidate the duplicate
pair: one component survives (the **canonical** record), the other is **retired**
as consolidated into it.

The preview answers, before anything is touched:

1. Which two components are compared, and which one would survive.
2. Every database relationship that references either component.
3. What inventory, BOM, procurement and history impacts exist.
4. Which conflicts a reviewer must resolve, and which block outright.
5. Whether the operation is executable **right now**.

Execution then performs the migration inside a single database transaction, or
changes nothing at all.

### The lifecycle

`isActive` is retained, and consolidation formalizes what "inactive" means for a
record retired by a merge rather than manually deactivated. The state is derived,
never stored twice:

| State | Persisted shape |
| --- | --- |
| **ACTIVE** | `is_active = true`, `consolidated_into_component_id = null` |
| **CONSOLIDATED** | `is_active = false`, `consolidated_into_component_id = <canonical>`, plus `consolidation_id` and `consolidated_at` |

A consolidated component:

- stays queryable and historically identifiable,
- is never hard-deleted (the domain refuses it, and `consolidation_sources`
  references it with `RESTRICT`),
- may not receive new inventory transactions,
- may not be added to a new bill of materials line,
- may not be added to a new purchase order line,
- may not be the target of a new reservation,
- may not have its master data edited.

Those last five are enforced by `Component.assertCanCreateTransaction`, reached
through `assertComponentUsableForNewActivity` in
`apps/api/src/components/component-lifecycle.guard.ts`, which the inventory
ledger, BOM, purchase-order and reservation creation paths all call. The guard is
narrow by design: it refuses only a CONSOLIDATED component, so it cannot change
any pre-existing behaviour for missing or manually deactivated records.

---

## 2. Dependency map

Components are referenced by **36 FK-backed tables (37 columns)** and **4
polymorphic reference systems**. Every one is registered in
`component-consolidation-dependencies.ts` with an explicit classification and an
explicit consolidation behaviour.

Classification vocabulary:

| Classification | Meaning |
| --- | --- |
| `MUST_PRESERVE` | History. Left exactly as it is. |
| `MUST_REPOINT` | The reference moves to the surviving component. |
| `MUST_RECONCILE` | Needs a decision or a recalculation, not a plain update. |
| `MUST_NOT_CHANGE` | Consolidation must not touch it, **and its presence blocks** while rows are live. |
| `UNKNOWN` | Unclassified. Always blocks. |

Execution support: `SUPPORTED` (an adapter performs it), `UNSUPPORTED` (refused),
`NOT_APPLICABLE` (nothing to do — preserved or blocking).

### Migrated by an adapter

| Domain | Classification | What happens |
| --- | --- | --- |
| `inventory_projections` | MUST_RECONCILE | Issue/Receipt pair per non-zero location, then both projections recalculated from their own ledgers |
| `inventory_reservation_lines` | MUST_REPOINT | Open reservations follow the survivor; the availability invariant is re-checked first |
| `batches` | MUST_REPOINT | Reassigned to the survivor; a code collision blocks |
| `serials` | MUST_REPOINT | Reassigned to the survivor; a serial collision blocks |
| `component_attribute_values` | MUST_RECONCILE | Every difference requires an explicit decision |
| `supplier_components` | MUST_REPOINT | Follow the survivor; a supplier collision blocks |
| `bill_of_material_lines` | MUST_REPOINT | Repointed, or combined with an explicit scrap factor |
| `purchase_recommendations` | MUST_REPOINT | Pending recommendations follow the survivor |
| `component_intelligence_findings` | MUST_RECONCILE | The authorising finding becomes ACCEPTED; related duplicates become STALE |
| `documents` (polymorphic) | MUST_REPOINT | Attachments follow the survivor |
| `user_favorites` (polymorphic) | MUST_RECONCILE | Repointed, with the duplicate bookmark removed |

### Preserved as history

`inventory_transactions`, `material_consumption_lines`, `production_orders`,
`material_requirements`, `production_recommendations`,
`manufacturing_traceability`, `finished_goods_receipt_lines`,
`purchase_invoice_lines`, `goods_receipt_lines`, `supplier_return_lines`,
`quotation_lines`, `sales_order_lines`, `fulfillment_request_lines`,
`customer_return_lines`, `warehouse_transfer_lines`, `stock_adjustment_lines`,
`stock_count_lines`, `cycle_count_lines`, `project_materials`, `warranty_claims`,
`ai_suggestion_feedback`, `activity_events` (polymorphic), `notifications`
(polymorphic), and the consolidation records themselves.

**The inventory ledger is append-only.** Consolidation never updates or repoints
a transaction; the source's balance is moved by posting new, attributable entries.

### Blocking

| Domain | Why |
| --- | --- |
| `purchase_order_lines` (open) | An issued order is a commercial commitment to a supplier; no domain operation amends it |
| `service_requests` | No rule defines what happens to an open repair request |
| `bill_of_materials` (as product) | A BOM belongs to the product it builds and cannot be moved |
| any `UNKNOWN` dependency | Nobody has reasoned about it |
| registry drift | The database has a component reference the registry does not represent |

### Coverage is verified, not asserted

`inspectDependencyCoverage()` compares the registry against
`information_schema` and reports drift. Both the preview and the execution guard
fail closed on drift. This check is not decorative: it caught
`production_recommendations.product_id` and `warranty_claims.product_id`, which
the original manual survey missed because they use `product_id` rather than
`component_id`.

---

### Eligibility

A finding must be a `DUPLICATE` whose two components still exist, whose match rule
is consolidatable, and whose status is **`PENDING` or `ACCEPTED`**.

| Finding status | Consolidatable | Why |
| --- | --- | --- |
| `PENDING` | ✅ | Not yet reviewed; consolidating directly is valid |
| `ACCEPTED` | ✅ | The duplicate was acknowledged; merging is the next step |
| `REJECTED` | ❌ | The duplication was denied |
| `DISMISSED` | ❌ | The duplication was denied |
| `STALE` | ❌ | The analysis no longer describes the records |

`ACCEPTED` is eligible deliberately. The duplicate workflow is:

```
duplicate detected
  → investigate
  → acknowledge/accept the duplicate     ("Accept finding")
  → review the consolidation preview     ("Review and consolidate")
  → resolve conflicts
  → final confirmation
  → consolidate
```

Accepting records that the duplication is real; it merges nothing. Consolidating
is the separate, explicitly confirmed action. Requiring `PENDING` would have
forced reviewers to skip the acknowledgement step entirely to keep consolidation
available.

Because the finding's status participates in the preview fingerprint, recording a
decision still **invalidates any preview taken beforehand** — the reviewer gets a
fresh analysis, which is exactly what should happen after the state changes. The
UI does this automatically: the investigation panel passes a revision key
(`${status}:${updatedAt}`) to the preview panel, so a decision discards the
analysis on screen rather than leaving a stale "ready to consolidate" state.

Consolidating an already-accepted finding **preserves the original
acknowledgement**: the reviewer, timestamp and decision notes recorded by the
accept decision are kept, and the consolidation facts are merged into the
finding's `metadata` (plus the consolidation record, which carries its own actor).

---

## 3. Inventory semantics

The ledger is append-only, so nothing historical is rewritten. For every location
where the retired component holds `S > 0`:

```
Issue   S   against the retired component   → its balance becomes 0
Receipt S   against the surviving component → its balance becomes C + S
```

Zero balances produce **no** entries: a movement that moves nothing would still
be a permanent, misleading row.

Afterwards both components' projections are recalculated from their own complete
ledgers using the same `CalculateInventoryProjection` the rest of the application
uses, so the result cannot disagree with a later global rebuild.

Guard rails that block rather than guess:

- the two components must share a unit of measure (no conversion rule exists),
- a negative source balance is refused (the ledger is already inconsistent),
- **any `InitialStock` ledger entry blocks the whole operation** (see below),
- if the recalculated source balance is not exactly 0, the whole operation is
  rolled back — consolidation must not claim it emptied a component when it did
  not.

### `InitialStock` is unsupported and blocks

`CalculateInventoryProjection` — the calculator behind
`RebuildInventoryProjections`, and therefore behind the `inventory_projections`
that `ReservationsService.getAvailableQuantity`, the MRP planner and this feature
all read — **has no `InitialStock` case**. An entry of that type falls through the
calculator's `default` branch and contributes nothing, so a rebuild can never
recover it.

Consequences, all verified against a live fixture:

- a component whose opening balance came from `InitialStock` reports `0` from the
  authoritative stock model while three ERP pages (component list, component
  detail fallback, inventory page) count it and show the real figure,
- consolidation reads source balances from projections, so it would post nothing
  and retire the component with its opening balance stranded,
- `RebuildInventoryProjections` does not help.

Because no reviewer decision can fix this — it is an inventory-modelling question
that affects reservations, MRP and every stock report — consolidation emits a
`BLOCKING` `INITIAL_STOCK_UNSUPPORTED` conflict and refuses. The inventory adapter
re-checks the same condition so it cannot be bypassed. Representing that stock
correctly is a separate ERP decision, deliberately not taken here.

---

## 4. BOM semantics

The manufacturing domain forbids two lines for the same component in one BOM, so
there are exactly three cases:

**Case A — only the retired component appears.** The line is repointed. Its id,
quantity, scrap factor and notes are preserved; only the consumed component
changes.

**Case B — only the surviving component appears.** Nothing to do.

**Case C — both appear in the same BOM.** A semantic collision. The only
supported resolution is `COMBINE`:

```json
{
  "bomId": "...",
  "resolution": "COMBINE",
  "scrapFactorResolution": { "strategy": "USE_CANONICAL" }
}
```

- the combined `quantity_per_unit` is `source + canonical`, never inferred,
- the scrap factor must be chosen (`USE_CANONICAL`, `USE_SOURCE` or `EXPLICIT`),
  because there is no defensible automatic choice between two different values,
- the absorbed line is removed and the retained line carries the result,
- both lines' engineering notes are kept, de-duplicated.

Only `DRAFT` BOMs can be amended. A released or obsolete BOM that mentions a
retired component **blocks**: changing an issued manufacturing instruction after
the fact is a separate engineering decision.

An unresolved collision blocks the whole operation. The preview exposes the
source quantity, canonical quantity, resulting quantity and both scrap factors so
the decision can be made with the numbers in front of the reviewer.

---

## 5. Polymorphic reference semantics

Four tables reference components by `(entity_type, entity_id)` with no foreign
key. Each has defined semantics:

| Table | Semantics | Action |
| --- | --- | --- |
| `activity_events` | HISTORICAL | Preserved — the event says what happened to *that* component at that time |
| `notifications` | HISTORICAL | Preserved — a message already shown, naming the component it was about |
| `documents` | CURRENT | Repointed — an attachment belongs to the entity it is filed against now |
| `user_favorites` | CURRENT | Repointed, with the duplicate source bookmark removed |

Favorites need reconciliation rather than a plain update because the schema has
no unique constraint on `(user, entity)`: consolidation is what creates the risk
of one part having two bookmarks. The canonical favorite is kept and the source
bookmark is dropped, so the user ends up with exactly one favorite per part.

A repoint also rewrites the favorite's `title` and `href`, which are denormalized
display data: the sidebar renders the title and navigates to the href, so moving
`entity_id` alone would leave a bookmark that names and links to the retired
component.

A polymorphic table with no policy stays **blocking**: a reference nobody has
classified must never be silently skipped.

---

### Fingerprint semantics

The preview returns a SHA-256 fingerprint over the authoritative state the
reviewer approved. Execution recomputes the preview **inside** its transaction and
refuses unless the fingerprint matches, so a preview can never be applied to state
it does not describe.

What participates:

- preview and intelligence versions,
- the finding's **lifecycle status** and fingerprint,
- both components' identity and `updatedAt`,
- eligibility, dependency counts, inventory by location, attribute values,
  category/manufacturer relations, BOM counts, conflicts, registry coverage.

What is deliberately excluded, because none of it is authoritative state:
`computedAt`, conflict `title`/`description` prose, `canonicalCandidates` ranking
metadata, `history.relatedFindings`, and anything derived from the executor or the
transaction. Repeating a preview on unchanged data therefore returns an identical
fingerprint, including when the second call runs inside a transaction — which is
exactly what execution does.

**The finding's status is part of the fingerprint, and that has a consequence for
the UI:** recording a review decision changes it. A preview taken while the
finding was `PENDING` stops being valid the moment the finding is decided, even
though no component was touched. The investigation panel therefore passes a
revision key (`${finding.status}:${finding.updatedAt}`) to the preview panel, so a
decision discards the analysis on screen instead of leaving a stale "ready to
consolidate" state that would submit a rejected fingerprint.

When the fingerprint does not match, the refusal names the current state that
caused it (for example "the review finding is now ACCEPTED") rather than blaming
the components.

Both the preview and execution read the finding through the **same executor** —
the transaction handle during execution — so the state being hashed is always the
snapshot the operation actually runs against.

---

## 6. Cross-subsystem transaction boundary

Execution runs inside one `db.transaction`, and every participating repository is
constructed with that transaction's executor (`@ananya/database`'s `DbExecutor`
and `toDbExecutor`). There is no code path that writes through the global client.

Sequence:

1. validate `confirmation === true`, load the finding,
2. **optimistic idempotency check** — if the source was already retired by a
   consolidation whose stored fingerprint matches the submitted one, return that
   result instead of moving inventory again,
3. open the transaction,
4. **lock** components, then dependency rows, then findings, all with
   `ORDER BY id` for a deterministic order (this is what prevents deadlock),
5. reload the components *from the transaction* and re-check the lifecycle,
6. **recompute the preview inside the transaction** and compare fingerprints — a
   preview generated before another user changed the data is not trusted,
7. refuse if anything still blocks,
8. capture pre-state,
9. insert the consolidation header (the retirement pointer is a foreign key to
   it, so it must exist first),
10. run the adapters in deterministic order,
11. retire the sources through the `RetireAsConsolidated` domain use case,
12. finalize the record with what each adapter did.

Any failure rolls back every mutation. Refusals are persisted afterwards in a
*separate* transaction, so the attempt is auditable without resurrecting partial
state.

---

## 7. Adapters

```
component-consolidation/
  component-consolidation.service.ts      orchestration
  component-consolidation.repository.ts   operation record persistence
  component-consolidation.types.ts        plan / context / adapter contract
  component-consolidation.errors.ts       refusal taxonomy
  component-consolidation.execution.dtos.ts
  consolidation-lock.service.ts           deterministic row locking
  polymorphic-references.ts               polymorphic policy definitions
  adapters/
    dependency-guard.adapter.ts           order 5   — blocks before any write
    inventory-consolidation.adapter.ts    order 10  — ledger + projections
    attribute-consolidation.adapter.ts    order 15
    bom-consolidation.adapter.ts          order 20
    supplier-consolidation.adapter.ts     order 25
    procurement-consolidation.adapter.ts  order 26
    batch-consolidation.adapter.ts        order 30
    serial-consolidation.adapter.ts       order 40
    reservation-consolidation.adapter.ts  order 50
    polymorphic-consolidation.adapter.ts  order 60
    finding-consolidation.adapter.ts      order 70
    retirement-consolidation.adapter.ts   order 80
```

`order` is a contract, not a preference: the guard runs before any write,
inventory moves before reservations are checked against post-move balances, and
retirement runs last so every migration sees an active source.

Each adapter re-validates its own preconditions and throws
`ConsolidationAdapterBlockedError` rather than applying a partial migration.

---

## 8. Attribute resolution

Classification is shared with the preview (`compareComponentAttributes` over
`loadAllAttributeValues`), so the two can never disagree about what needs a
decision.

| Classification | Requirement |
| --- | --- |
| `IDENTICAL` | Automatic |
| `CANONICAL_ONLY` | Automatic — the survivor keeps its value |
| `SOURCE_ONLY` | Explicit: `KEEP_SOURCE_VALUE`, `DISCARD_SOURCE_VALUE` or `EXPLICIT_VALUE` |
| `CONFLICTING` | Explicit: `KEEP_CANONICAL_VALUE`, `KEEP_SOURCE_VALUE` or `EXPLICIT_VALUE` |

`KEEP_CANONICAL_VALUE` is rejected for a `SOURCE_ONLY` attribute, because there is
no canonical value to keep and the strategy would silently mean "discard".

There is no latest-wins and no silent preference. Every retired component's
attribute values are removed once the decisions are applied.

---

## 9. Identity rules

- **Manufacturer mismatch blocks.** Manufacturer records are never merged, and
  consolidation never changes a manufacturer as a side effect.
- **Unrelated categories block.** The survivor keeps its own category;
  consolidation never moves a category. Related or missing categories are
  informational.
- **Unit mismatch blocks.** No conversion rule exists.
- **Self-consolidation and re-consolidation are refused** by the domain, before
  the database constraint is reached.

---

## 10. Record, idempotency and concurrency

### The operation record

`consolidations` is the authoritative log: canonical component, finding, status,
the approved `preview_fingerprint`, the validated `plan`, the `result` (every
adapter outcome and warning), the reviewer, and timestamps.

`consolidation_sources` holds one row per retired component with its `pre_state`
and `post_state`.

A `COMPLETED` row exists **if and only if** every mutation committed, because it
is written inside the same transaction.

### Idempotency

`consolidation_sources.source_component_id` is **unique**. A component can be
retired at most once, ever, enforced by the database rather than by a
check-then-insert. A replay whose fingerprint matches the stored one returns the
existing result; a replay with a different fingerprint is refused.

### Concurrency

Rows are locked in deterministic id order across components, dependency tables
and findings. The client fingerprint is an optimistic check; the locks are the
pessimistic backstop. After the locks are held, the state the operation validated
cannot change underneath it.

### Rollback

The transaction rolls back everything on failure. Pre-state is persisted for
diagnosis. There is deliberately **no "undo" feature**: the domain does not
support reversing a committed consolidation, and pretending otherwise would be
worse than the honest absence.

---

## 11. API

| Route | Guard | Purpose |
| --- | --- | --- |
| `POST /ml/components/review-queue/:id/consolidation-preview` | `ComponentWriteGuard` | Read-only preflight. Accepts the decisions made so far so it can report readiness. |
| `POST /ml/components/review-queue/:id/consolidate` | `ComponentWriteGuard` | Executes. Requires `Inventory.Update` and `confirmation: true`. |

`ComponentWriteGuard` requires an authenticated session holding
`Inventory.Update`, the same permission that gates component master-data edits.
Reviewer identity always comes from the authenticated principal, never the body.

Request body for execution:

```json
{
  "expectedPreviewFingerprint": "<sha256 from the preview>",
  "canonicalComponentId": "<must be one of the finding's two components>",
  "sourceComponentIds": ["<the other one>"],
  "attributeResolutions": [
    { "attributeDefinitionId": "...", "strategy": "KEEP_CANONICAL_VALUE" }
  ],
  "bomResolutions": [
    {
      "bomId": "...",
      "resolution": "COMBINE",
      "scrapFactorResolution": { "strategy": "USE_CANONICAL" }
    }
  ],
  "decisionNotes": "...",
  "confirmation": true
}
```

There is deliberately **no generic `dependencyResolutions` field**. A dependency
is either migrated by an adapter, preserved as history, or blocked because the
domain has no safe semantics — in which case the answer is an out-of-band
business decision (close the order, resolve the duplicate batch code), not a flag
the caller can assert. Accepting such a field and ignoring it would let a client
believe it had unblocked something it had not.

---

## 12. UI

The Pass 5C duplicate investigation modal is extended, not redesigned. The
consolidation section is absent when the preview cannot be loaded, and the
execution flow is mounted **only** when the backend reports `executable`.

Two distinct actions, with distinct wording:

| Action | Meaning |
| --- | --- |
| **Accept finding** | Acknowledges that the duplication is real. Merges nothing. The finding stays consolidatable. |
| **Review and consolidate** | The consolidation workflow: preview → resolve → confirm → execute. |

```
Duplicate investigation
  → Accept finding           (acknowledge the duplicate; optional, order-independent)
  → Consolidation preview
  → Resolve conflicts        (explicit decision per attribute and BOM collision)
  → Review and consolidate   (opens the confirmation)
  → FINAL CONFIRMATION       (states canonical, source, changes, warnings)
  → Consolidate components   (enabled only after the acknowledgement)
  → Consolidation complete   (id, canonical link, warnings)
```

Guarantees:

- a blocker can never be bypassed from the UI — the execute section is absent
  rather than disabled when anything blocks,
- one accidental click cannot execute: the execute button lives in a separate
  stage and stays disabled until the reviewer ticks the acknowledgement,
- a confirmation opened against one preview is discarded when the preview
  changes,
- recording a review decision reloads the preview (via the finding revision key),
  so a stale "ready to consolidate" state can never remain on screen,
- a refusal refreshes the preview rather than leaving stale facts on screen.

---

## 13. Tests

| Suite | Coverage |
| --- | --- |
| `component-consolidation-dependencies.spec.ts` | Registry completeness, fail-closed rules, ledger never repointable, blocking domains stay blocking |
| `consolidation-transaction-boundary.spec.ts` | Source scan: no adapter writes through the global client, exactly one transaction, every repository bound to the executor |
| `component-attribute-values.loader.spec.ts` | Attribute classification, no silent winner, deterministic order |
| `bill-of-materials.spec.ts` (`@ananya/manufacturing`) | `repointLine` / `combineConsolidatedLine` invariants, circular and duplicate prevention, released-BOM refusal |
| `component-consolidation-preview.integration-spec.ts` | Live coverage check, preview content, fingerprint determinism, BOM collision resolution, direction override, refusals, HTTP guards, **scoped no-mutation snapshot** |
| `component-consolidation-execution.integration-spec.ts` | Commit, ledger movement, the full inventory accounting matrix (A–I), `InitialStock` blocking, attribute decisions, BOM repoint and combine, **rollback with zero partial state at two stages**, idempotent replay, **fingerprint determinism across repeats/delays/transactions**, immediate preview→execute, **the acknowledge-then-consolidate workflow (W1–W8)**, concurrent consolidation, confirmation, forged ids, polymorphic semantics, favorites, retirement guards, HTTP guard on `/consolidate` |
| `component-consolidation-preview.spec.ts` (web) | Preview presentation, and that execution is gated on `executable` with an explicit confirmation |

The execution spec snapshots every affected table for its own fixture pair before
and after, and asserts equality on every rollback path. It creates fixtures with
run-unique ids and removes them in `afterAll` **without swallowing errors**, so a
cleanup failure surfaces instead of leaking rows into the development database.

---

## 14. Known limitations

1. **Batch and serial collisions block.** Two batches (or serials) that share a
   code but belong to different components are not provably the same physical
   item, and merging them would discard the source's dates and supplier
   reference. The reviewer must resolve the underlying data question first.
2. **Open purchase orders block.** Amending an issued order is a commercial
   decision with supplier implications.
3. **Service requests block.** No domain rule defines what an open repair request
   means once its component is retired.
4. **A BOM that produces a retired component blocks**, because the BOM cannot be
   moved and issuing a second BOM for one product is rejected by the domain.
5. **Only draft BOMs can be amended.**
6. **Released and obsolete BOMs** that reference a retired component block.
7. **`InitialStock` blocks.** The projection calculator has no case for it, so
   the quantity is invisible to the stock model every subsystem reads. Fixing
   that is an ERP-wide inventory decision, not a consolidation decision.
8. **One duplicate pair at a time.** The API accepts a source list, but the
   finding that authorises the operation describes one pair.
9. **No rollback of a committed consolidation.** The domain has no inverse
   operation; the record's pre-state exists for diagnosis, not for undo.
10. **Rollback is proven at adapter orders 30 and 50** (batch and reservation),
    which is after inventory, attributes, BOM, supplier and procurement have all
    already written. Orders 60–80 rely on the single-transaction boundary, which
    `consolidation-transaction-boundary.spec.ts` verifies by source scan rather
    than by forcing a failure.

None of these are silent: each one is reported as a `BLOCKING` conflict with an
explanation, and execution refuses rather than guessing.
