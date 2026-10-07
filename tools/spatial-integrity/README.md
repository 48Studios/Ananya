# Spatial Integrity Tooling

Read-only diagnostics for spatial data integrity. Nothing in this directory
writes, migrates, repairs, backfills, canonicalizes or re-parents data. Every
statement runs as a `SELECT` inside a `BEGIN READ ONLY` transaction.

## Location hierarchy diagnostic

Reports on two independent relations:

1. **Organizational hierarchy (`parentId`)** — classifies every persisted
   `locations.parent.kind → locations.child.kind` relationship and reports the
   ones that are **not**:
   - canonical physical containment (`SPATIAL_CATEGORY_DEFINITIONS.allowedChildren`), or
   - a valid **context-root** relationship (`isContextRootCategory`), or
   - an explicitly documented **legacy-compatible** pair.

2. **Physical containment readiness (`containerId`, RFC-0069 Phase 1)** — reports
   coverage and integrity of the new nullable column:
   - total locations, with/without `containerId`, and coverage %
   - container relationships, missing (dangling) references
   - invalid container relationships (via the existing
     `classifyLocationHierarchyRelationship` classifier — no second vocabulary)
   - inactive containers, self references, container cycles

   In Phase 1 the column is intentionally unpopulated, so coverage is expected
   to be **0%**.

It uses the exact same classifier the application uses
(`classifyLocationHierarchyRelationship` from `@ananya/inventory`), loaded from
the workspace build, so the report can never drift from the canonical taxonomy.

### Run

```bash
pnpm --filter @ananya/inventory build   # one-time, if not already built
node tools/spatial-integrity/diagnose-location-hierarchy.mjs
```

Environment:

- `ANANYA_DB_CONTAINER` — postgres container name (default `ananya-db`)
- `ANANYA_HIERARCHY_JSON=1` — emit a JSON report instead of text

Exit codes:

- `0` — no organizational violations and no container integrity issues
- `1` — violations or container issues found (safe to gate a review/CI step on)
- `2` — the diagnostic itself failed (e.g. inventory package not built)

### What it is not

- **Not** a runtime request on the Location APIs.
- **Not** a migration.
- **Not** an enforcement mechanism — it reports; it never blocks writes.
- **Not** a Phase 2 consumer — it does not read `containerId` as application
  truth; it only reports on the column's state.

## Physical containment backfill preview (RFC-0069 Phase 3A)

Computes the `containerId` value every location **would** receive if the Phase 3
backfill ran, and validates that every proposal is safe. **Read-only — it never
writes containerId.**

### Proposal rules

| Relationship classification | Proposed `containerId` |
|---|---|
| `canonical` | `parentId` |
| `context-root` | `parentId` |
| `legacy-compatible` | `parentId` (preserves legacy `tray → bin`) |
| `violation` | `NULL` (never repaired or guessed) |
| `parentId IS NULL` | `NULL` (no inferred facility ownership) |

The rules and safety validation live in the pure, unit-tested planner
`planPhysicalContainerBackfill` (`@ananya/inventory`); this script only supplies
read-only DB input and formats output.

### Safety validation (fails rather than guesses)

Before emitting proposals it verifies every proposal's container exists, is
active, satisfies `canBePhysicalContainer` (documented legacy pairs are exempt),
is not self-referential, and forms no container cycle. Any violation of these
checks marks the plan **UNSAFE** and exits non-zero.

### Run

```bash
pnpm --filter @ananya/inventory build   # one-time, if not already built
node tools/spatial-integrity/preview-physical-container-backfill.mjs
# or: pnpm preview:physical-container-backfill
```

Environment:

- `ANANYA_DB_CONTAINER` — postgres container name (default `ananya-db`)
- `ANANYA_BACKFILL_JSON=1` — emit the full JSON plan (for determinism diffing)

Exit codes:

- `0` — plan is SAFE
- `1` — plan is UNSAFE (proposals violate a safety check)
- `2` — the tool itself failed

### Guarantees

- PostgreSQL read-only (`BEGIN READ ONLY`); no INSERT / UPDATE / DELETE /
  TRUNCATE / ALTER / DROP.
- Deterministic and idempotent: two runs on the same data produce byte-identical
  output.
- Never populates `containerId`. This is the **preview**; the actual backfill is
  a later, separately-reviewed step.

## Physical containment backfill (RFC-0069 Phase 3B)

Executes the approved backfill: `locations.container_id = locations.parent_id`
for EXACTLY the relationships the Phase 3A planner approves (canonical /
context-root / legacy-compatible). Violations and unparented rows are never
written.

`planPhysicalContainerBackfill` remains the **sole authority** — this script
never re-implements the decision logic.

### Safety model

1. **Approved-count guard.** Before any write the plan must reproduce the counts
   the Phase 3A review approved:

   | guard key | approved |
   |---|---|
   | `assignments` | 151 |
   | `violations` | 18 |
   | `canonical` | 132 |
   | `context-root` | 7 |
   | `legacy-compatible` | 12 |
   | `unparented` | 101 |

   Any mismatch aborts with **no write** (exit 1). Override a guard with
   `--expect-<key>=<n>` only after an explicit re-approval.

2. **Single transaction.** Fingerprints of the `parentId` graph, location
   identity, kinds, ledger and spatial tables are captured before the write and
   asserted identical after it. If ANY assertion fails the transaction is
   **ROLLED BACK** — a partial backfill is never committed.

3. **Idempotent.** Rows already carrying the approved `containerId` are not
   rewritten (`IS DISTINCT FROM`), so a second run performs zero updates.

### Run

```bash
pnpm --filter @ananya/inventory build   # one-time
pnpm backfill:physical-containment                     # dry run (default)
pnpm backfill:physical-containment -- --execute        # perform the backfill
```

### Exit codes

- `0` — guard passed (dry run) or backfill committed
- `1` — planner unsafe, guard mismatch, or a post-write assertion failed (rolled back)
- `2` — the tool itself failed

### What it never does

Never modifies `parentId`, location kinds, `inventory_transactions`, spatial
layouts/mappings/nodes, or published layouts. Never repairs violations, never
migrates unparented cabinets, never guesses a physical container. Not wired into
application startup or migrations — it is an explicit maintenance command.

## Physical containment integrity verifier (RFC-0069)

Read-only validation of the persisted `containerId` graph. **Exits non-zero on
any integrity failure** (suitable for CI gating after a backfill).

Validates:

1. every non-null `containerId` references an existing location,
2. every container is active,
3. no location contains itself,
4. no container cycles exist,
5. every parent/child category relationship satisfies `canBePhysicalContainer`,
6. context-root relationships satisfy the context-root rule,
7. legacy-compatible relationships are explicitly classified (reported, not failed),
8. no compartment / reel-slot is used as a physical container,
9. container ancestry is deterministic (bounded; reports max depth),
10. `parentId` relationships are unchanged (when a baseline map is supplied),
11. `inventory_transactions` is unchanged (when an expected count is supplied).

The rules live in the pure, unit-tested `verifyPhysicalContainmentIntegrity`
(`@ananya/inventory`).

### Run

```bash
pnpm --filter @ananya/inventory build   # one-time
node tools/spatial-integrity/verify-physical-containment.mjs
# or: pnpm verify:physical-containment
```

Environment:

- `ANANYA_DB_CONTAINER` — postgres container name (default `ananya-db`)
- `ANANYA_VERIFY_JSON=1` — emit the JSON report
- `ANANYA_EXPECT_LEDGER=N` — assert the ledger row count equals `N`

Exit codes:

- `0` — integrity OK
- `1` — integrity failure
- `2` — the tool itself failed

Read-only: every statement runs inside `BEGIN READ ONLY`; no write is issued.

