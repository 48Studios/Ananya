# Spatial Inventory Demo Dataset

A deterministic, idempotent and fully isolated development demo dataset for the **Spatial Inventory / Inventory Builder** system. It is designed to exercise every valid mapping state, all four parametric templates, builder-published spatial nodes, real ledger inventory and the recent regression fixes.

---

## Safety guarantees

1. **Namespace isolation** — every spatial entity (location, model, layout, anchor) is prefixed `DEMO-SPATIAL-`; every demo component/transaction uses `DEMO-`. Real operational data is never modified.
2. **Deterministic cleanup** — cleanup deletes only records carrying the demo prefix (or tracked in `manifest.json`). No truncations, no broad deletes.
3. **Domain fidelity** — the seed talks to the running API with a real session token. Locations, models, layouts, publication, archieving, nodes, components and ledger receipts all go through the same services, guards and DTO validation the UI uses.
4. **No fabricated geometry** — every derived dimension comes from `@ananya/inventory`'s parametric engine, the same engine the API and the Builder run, so the seeded geometry cannot drift from what the product generates.
5. **Idempotent** — running the seed twice creates no duplicate record and no revision churn; existing matching records are adopted, and operator-modified published layouts are never silently overwritten.

## Commands

```bash
# Seed (idempotent; adopts an existing demo dataset and repairs draft drift)
pnpm seed:spatial

# Reset: cleanup then seed in one command
pnpm seed:spatial --reset
# (equivalent: node tools/spatial-demo-dataset/seed.mjs --reset)

# Seed without the automatic verification report
node tools/spatial-demo-dataset/seed.mjs --no-verify

# Read-only verification / reconciliation report (exit 1 on problems)
pnpm seed:spatial:verify

# Cleanup (dry run by default; --execute removes only demo records)
node tools/spatial-demo-dataset/cleanup.mjs
node tools/spatial-demo-dataset/cleanup.mjs --execute
```

Prerequisite: the dev stack must be running (`pnpm dev`) and a login session must exist (the seeder reads a token from `ANANYA_TOKEN`, `/tmp/ai-test-token.env`, or the newest unexpired `user_sessions` row). The spatial engine build is read from `packages/inventory/dist`; run `pnpm --filter @ananya/inventory build` first on a clean checkout.

---

## Location hierarchy

```text
DEMO-SPATIAL-WAREHOUSE            warehouse  ROOT      | layout PUBLISHED
├── DEMO-SPATIAL-CABINET-A        cabinet    PARTIAL   | layout PUBLISHED   (primary demo)
│   ├── DEMO-SPATIAL-DRAWER-A01..A04 (deep drawers, mapped)
│   │   ├── DEMO-SPATIAL-BIN-A01-01 (anchored bin, mapped, stock)
│   │   └── DEMO-SPATIAL-BIN-A01-02 (anchored bin, mapped, stock)
│   ├── DEMO-SPATIAL-DRAWER-B01..B04 (shallow drawers, mapped)
│   └── DEMO-SPATIAL-DRAWER-C01..C04 (intentionally unmapped)
├── DEMO-SPATIAL-CABINET-B        cabinet    MAPPED    | layout PUBLISHED
│   └── DEMO-SPATIAL-DRAWER-D01..D03, E01..E03 (all mapped)
├── DEMO-SPATIAL-CABINET-C        cabinet    UNMAPPED  | layout DRAFT (zero mappings)
│   └── DEMO-SPATIAL-DRAWER-F01..F02, G01..G02 (available for parent-first mapping)
├── DEMO-SPATIAL-OPEN-BINS        cabinet    PARTIAL   | layout PUBLISHED
│   ├── DEMO-SPATIAL-BIN-OB-B01..B05, C01..C05 (mapped)
│   └── DEMO-SPATIAL-BIN-OB-A01..A05 (intentionally unmapped)
├── DEMO-SPATIAL-RACK             rack       MAPPED    | layout PUBLISHED
│   └── DEMO-SPATIAL-RACK-L1B1..L3B2 (all mapped)
├── DEMO-SPATIAL-TRAY             tray       UNMAPPED  | layout ARCHIVED
│   └── DEMO-SPATIAL-TRAY-A01..C04 (decommissioned, unmapped)
└── DEMO-SPATIAL-SHELF            shelf      UNMAPPED  | no layout (containerStatus NONE)
    └── DEMO-SPATIAL-SHELF-L1..L3
```

- 68 locations, 1 facility root, 7 containers, 3 hierarchy levels.
- `ROOT` is a placement status for top-level facilities; it is never counted as unmapped.

## Mapping-state matrix

| Container        | Placement  | Container layout | Deliberate state                                             |
| :--------------- | :--------- | :--------------- | :----------------------------------------------------------- |
| WAREHOUSE        | `ROOT`     | `PUBLISHED`      | Facility root with a published bay plan for its children     |
| CABINET-A        | `PARTIAL`  | `PUBLISHED`      | 8/12 slots mapped; row C intentionally vacant                 |
| CABINET-B        | `MAPPED`   | `PUBLISHED`      | 6/6 slots mapped; no stale mappings                           |
| CABINET-C        | `UNMAPPED` | `DRAFT`          | Draft with zero mappings — parent-first workflow              |
| OPEN-BINS        | `PARTIAL`  | `PUBLISHED`      | 10/15 slots mapped; tier A intentionally vacant               |
| RACK             | `MAPPED`   | `PUBLISHED`      | 6/6 rack bays mapped                                          |
| TRAY             | `UNMAPPED` | `ARCHIVED`       | Published then archived; archive pruned the builder nodes     |
| SHELF            | `UNMAPPED` | `NONE`           | No layout at all; children carry stock                        |

Expected reconciliation on the seeded dataset: `ROOT 1, MAPPED 34, PARTIAL 2, UNMAPPED 31` and `NONE 61, DRAFT 1, PUBLISHED 5, ARCHIVED 1`.

## Layouts and parametric templates

All layouts are created through `POST /spatial/layouts` and published/archived through the Builder endpoints, which reconciles **builder-owned spatial nodes** (`metadata.source = inventory_builder`, `metadata.layoutId`, `metadata.slotId`, scale `1`, exact generated coordinates).

| Layout code                     | Template             | Grid         | Container (mm)      | Slot envelope (mm)    | End state   |
| :------------------------------ | :------------------- | :----------- | :------------------ | :-------------------- | :---------- |
| `DEMO-SPATIAL-LAYOUT-WAREHOUSE` | `PALLET_RACK`        | 2 levels × 3 | 2600 × 2400 × 900   | 786.67 × 1080 × 900   | PUBLISHED   |
| `DEMO-SPATIAL-LAYOUT-CAB-A`     | `SMD_DRAWER_CABINET` | 3 rows × 4   | 720 × 900 × 320     | 171 × 289.33 × 308    | PUBLISHED   |
| `DEMO-SPATIAL-LAYOUT-CAB-B`     | `SMD_DRAWER_CABINET` | 2 rows × 3   | 600 × 900 × 400     | 189.33 × 436 × 388    | PUBLISHED   |
| `DEMO-SPATIAL-LAYOUT-CAB-C`     | `SMD_DRAWER_CABINET` | 2 rows × 2   | 420 × 620 × 300     | 196 × 296 × 288       | DRAFT       |
| `DEMO-SPATIAL-LAYOUT-OPEN-BINS` | `OPEN_BIN_MATRIX`    | 3 tiers × 5  | 1000 × 600 × 220    | 189.6 × 185.33 × 210  | PUBLISHED   |
| `DEMO-SPATIAL-LAYOUT-RACK`      | `PALLET_RACK`        | 3 levels × 2 | 2200 × 2400 × 900   | 1010 × 693.33 × 900   | PUBLISHED   |
| `DEMO-SPATIAL-LAYOUT-TRAY`      | `GRID_PARTS_TRAY`    | 3 rows × 4   | 300 × 200 × 60      | 70.5 × 61.33 × 48     | ARCHIVED    |

Geometry coverage:

- **Unequal slot proportions across the dataset** — rack bays are ~6× wider and ~2× shorter than the SMD drawer slots; tray cells are ~14× smaller. The parametric engine subdivides every template evenly, so a single layout cannot contain unequal cells; the dataset exercises the difference across templates instead of distorting geometry.
- **Different drawer bodies within one scene** — Cabinet A row A uses the deep drawer model (full slot envelope) while row B uses the shallow drawer model (half height). Both are attached to builder-owned nodes without altering builder ownership.
- **Dense grid** — the open-bin wall (15 slots, 8 mm gaps) and the tray (12 cells).
- **Depth for drawer animation** — 308/388 mm deep drawer bodies are openable in the operational 3D viewer.

## Models

| Model code                        | Source                            | Dimensions (mm)        | Anchors      |
| :-------------------------------- | :-------------------------------- | :--------------------- | :----------- |
| `DEMO-SPATIAL-MODEL-CABINET-A`    | Cabinet A container               | 720 × 900 × 320        | —            |
| `DEMO-SPATIAL-MODEL-CABINET-B`    | Cabinet B container               | 600 × 900 × 400        | —            |
| `DEMO-SPATIAL-MODEL-OPEN-BINS`    | Open bin container                | 1000 × 600 × 220       | —            |
| `DEMO-SPATIAL-MODEL-RACK`         | Rack container                    | 2200 × 2400 × 900      | —            |
| `DEMO-SPATIAL-MODEL-DRAWER-DEEP`  | Cabinet A slot envelope           | 171 × 289.33 × 308     | `BIN01`, `BIN02` |
| `DEMO-SPATIAL-MODEL-DRAWER-SHALLOW` | Cabinet A slot, 0.5 height      | 171 × 144.67 × 308     | —            |
| `DEMO-SPATIAL-MODEL-DRAWER-B`     | Cabinet B slot envelope           | 189.33 × 436 × 388     | —            |
| `DEMO-SPATIAL-MODEL-OPEN-BIN`     | Open bin slot envelope            | 189.6 × 185.33 × 210   | —            |
| `DEMO-SPATIAL-MODEL-RACK-BAY`     | Rack slot envelope                | 1010 × 693.33 × 900    | —            |

The model dimensions are computed from generated slot geometry at seed time (`from` descriptors in [dataset.mjs](dataset.mjs)), so the operational 2D/3D viewers render exactly the slot the Builder authored.

## Inventory

Baseline stock is written through the immutable ledger (`POST /inventory-transactions`) and projections are rebuilt, never hand-edited.

| SKU                   | Location                   | Mapped? | Quantity | Purpose                       |
| :-------------------- | :------------------------- | :------ | :------- | :---------------------------- |
| `DEMO-R-10K-0805`     | `DEMO-SPATIAL-BIN-A01-01`  | yes     | 5,000    | Primary mapped deep bin       |
| `DEMO-C-100N-0805`    | `DEMO-SPATIAL-BIN-A01-02`  | yes     | 3,000    | Second mapped deep bin        |
| `DEMO-R-100K-0603`    | `DEMO-SPATIAL-DRAWER-A02`  | yes     | 2,500    | Mapped drawer                 |
| `DEMO-LED-GREEN-0805` | `DEMO-SPATIAL-DRAWER-B01`  | yes     | 1,000    | Shallow mapped drawer         |
| `DEMO-IC-ATTINY`      | `DEMO-SPATIAL-DRAWER-C01`  | **no**  | 50       | Inventory independent of mapping |
| `DEMO-CONN-JST`       | `DEMO-SPATIAL-RACK-L1B1`   | yes     | 500      | Mapped rack bay               |
| `DEMO-FAST-M3`        | `DEMO-SPATIAL-SHELF-L2`    | **no**  | 1,200    | Container with no layout      |
| `DEMO-R-10K-0805`     | `DEMO-SPATIAL-DRAWER-D01`  | yes     | 2,000    | Multi-location locate chooser |
| `DEMO-C-100N-0805`    | `DEMO-SPATIAL-BIN-OB-B01`  | yes     | 800      | Mapped open bin               |

Capacity metadata (`{ capacity, capacityUnit }`) is applied to a few locations (drawer A01/A02, bin A01-01, shelf L2) to exercise the occupancy visualization mode.

## Manual walkthrough

1. **Spatial Inventory** (`/inventory/locations/spatial`) — the tree shows `Facility root`, `Mapped`, `◐ 8/12` and `Layout` badges; KPIs reconcile with the matrix above.
2. **Warehouse details** (`/inventory/locations?…` → `DEMO-SPATIAL-WAREHOUSE`) — canonical section order, `Facility root` + `Layout published` chips; 3D shows four containers placed by the bay plan, each contained inside its authored bay (an oversized model such as the full pallet rack is shrunk to fit its slot), and a three-item staging tray.
3. **Primary cabinet** (`DEMO-SPATIAL-CABINET-A`, `?view=spatial3d`) — 8 mapped drawers (deep row A, shallow row B) and 4 unmapped drawers; 2D and 3D both report `8 / 4`; click a drawer to open it (transient, view-only).
4. **Mapped vs unmapped leaf** — `DEMO-SPATIAL-BIN-A01-01` shows `Mapped` and renders its drawer's frame with the bin selected, while the requested route stays on the bin; `DEMO-SPATIAL-DRAWER-C01` shows `Unmapped`.
5. **Draft workflow** — open `DEMO-SPATIAL-CABINET-C` in the Builder Workspace: the draft layout loads with zero mappings and four drawers ready to map; publishing it creates the builder-owned nodes.
6. **Archived layout** — `DEMO-SPATIAL-TRAY` shows `Layout archived` with no spatial nodes.
7. **Inventory independence** — Location Details for `DEMO-SPATIAL-DRAWER-C01` (unmapped) still shows its 50 pcs.

## Verification

`pnpm seed:spatial` runs [verify.mjs](verify.mjs) automatically and fails non-zero on any problem. It checks:

- declared locations exist; root/container/depth counts;
- mapping-state distribution (`ROOT / MAPPED / PARTIAL / UNMAPPED`);
- container-status distribution (`NONE / DRAFT / PUBLISHED / ARCHIVED`);
- spatial integrity: no orphan mappings, no orphan builder nodes, no duplicates, one published layout per parent, no stale mappings, published layouts have revision snapshots, complete builder ownership metadata, no nodes on inactive locations;
- geometry: every published mapping's node coordinates match the generated slot centres within 0.01 mm, scale is 1, ownership metadata is correct and the parent node link matches the location hierarchy; published layouts expose container dimensions;
- inventory: every seeded quantity is visible in projections, and stock exists in both mapped and unmapped locations.

## Cleanup

`cleanup.mjs` removes, in order: demo inventory transactions/projections, demo spatial layouts (cascading mappings and revisions), demo spatial nodes, demo spatial models (cascading anchors), demo components, and finally demo locations leaf-first through the API. It then rebuilds projections and resets `manifest.json`.
