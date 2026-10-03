# Spatial Inventory Demo Dataset

A safe, idempotent, and fully isolated development demo dataset for testing and visualizing the **Spatial Inventory** architecture in Ananya ERP.

---

## Safety Guarantees

1. **Test-Data Namespace Isolation**:
   - All spatial entities (locations, spatial models, anchors, nodes) are prefixed with `DEMO-SPATIAL-`.
   - All demo components and transactions are prefixed with `DEMO-`.
   - Real operational data and existing storage locations (e.g. `OFC`, `CAB-01`, `WRB`) are never modified or overwritten.
2. **Deterministic Cleanup**:
   - Cleanup targets **only** records tracked in `manifest.json` and records carrying the demo prefix.
   - Zero table truncations. Real database data remains completely untouched.
   - Clean leaf-first topological deletion of locations.
3. **Domain & API Fidelity**:
   - Seeding and cleanup execute through the authoritative NestJS REST API with real DTO validation and domain service logic.
   - Inventory transactions are written to the immutable ledger and projections are recalculated via `RebuildInventoryProjections`.

---

## Commands

```bash
# 1. Seed demo dataset (idempotent, adopts existing records if present)
pnpm seed:spatial

# 2. Reset and re-seed from scratch in one command
pnpm seed:spatial --reset

# 3. Dry-run cleanup (inspects demo records without deleting)
node tools/spatial-demo-dataset/cleanup.mjs

# 4. Execute cleanup (safely removes ONLY demo data)
pnpm seed:spatial:reset
# or: node tools/spatial-demo-dataset/cleanup.mjs --execute
```

---

## Dataset Contents

### 1. Spatial Models & Procedural Anchors

| Model Code               | Name                  | Dimensions (W x H x D) | Anchors                                                    |
| :----------------------- | :-------------------- | :--------------------- | :--------------------------------------------------------- |
| `DEMO-SPATIAL-CABINET-6` | Demo 6 Drawer Cabinet | 600 x 900 x 400 mm     | `A01`, `A02`, `A03`, `A04`, `A05`, `A06` (2 rows x 3 cols) |
| `DEMO-SPATIAL-DRAWER`    | Demo Drawer           | 180 x 70 x 350 mm      | `BIN01`, `BIN02` (2 side-by-side compartments)             |
| `DEMO-SPATIAL-SHELF`     | Demo Shelf            | 1000 x 1500 x 350 mm   | `S01`, `S02`, `S03` (3 vertical tiers)                     |

### 2. Location Hierarchy & Spatial Mapping States

```text
DEMO-SPATIAL-WAREHOUSE (warehouse, root facility) [UNMAPPED]
│
├── DEMO-SPATIAL-CABINET-A (cabinet) [PARTIAL - mapped to DEMO-SPATIAL-CABINET-6]
│   ├── DEMO-SPATIAL-DRAWER-A01 [MAPPED -> Anchor A01; Model DEMO-SPATIAL-DRAWER]
│   │   ├── DEMO-SPATIAL-BIN-A01-01 [MAPPED -> Anchor BIN01]
│   │   └── DEMO-SPATIAL-BIN-A01-02 [MAPPED -> Anchor BIN02]
│   ├── DEMO-SPATIAL-DRAWER-A02 [MAPPED -> Anchor A02; Model DEMO-SPATIAL-DRAWER]
│   │   ├── DEMO-SPATIAL-BIN-A02-01 [MAPPED -> Anchor BIN01]
│   │   └── DEMO-SPATIAL-BIN-A02-02 [MAPPED -> Anchor BIN02]
│   ├── DEMO-SPATIAL-DRAWER-A03 [PARTIAL -> Anchor A03; No drawer model]
│   │   ├── DEMO-SPATIAL-BIN-A03-01 [UNMAPPED - Deep hierarchy test]
│   │   └── DEMO-SPATIAL-BIN-A03-02 [UNMAPPED]
│   ├── DEMO-SPATIAL-DRAWER-A04 [MAPPED -> Anchor A04]
│   ├── DEMO-SPATIAL-DRAWER-A05 [MAPPED -> Anchor A05]
│   └── DEMO-SPATIAL-DRAWER-A06 [UNMAPPED - Slot A06 vacant]
│
├── DEMO-SPATIAL-CABINET-B (cabinet) [PARTIAL - mapped to DEMO-SPATIAL-CABINET-6]
│   ├── DEMO-SPATIAL-DRAWER-B01 [MAPPED -> Anchor A01]
│   ├── DEMO-SPATIAL-DRAWER-B02 [MAPPED -> Anchor A02]
│   └── DEMO-SPATIAL-DRAWER-B03 [UNMAPPED]
│
└── DEMO-SPATIAL-SHELF-C (shelf) [PARTIAL - mapped to DEMO-SPATIAL-SHELF]
    ├── DEMO-SPATIAL-SHELF-C01 [MAPPED -> Anchor S01]
    ├── DEMO-SPATIAL-SHELF-C02 [MAPPED -> Anchor S02]
    └── DEMO-SPATIAL-SHELF-C03 [UNMAPPED]
```

### 3. Demo Components & Inventory Ledger

| Component SKU         | Description                   | Stock Location            | Quantity  | Test Purpose                                           |
| :-------------------- | :---------------------------- | :------------------------ | :-------- | :----------------------------------------------------- |
| `DEMO-R-10K-0805`     | 10k Ohm 0805 SMD Resistor     | `DEMO-SPATIAL-BIN-A01-01` | 5,000 pcs | Primary mapped bin                                     |
| `DEMO-R-10K-0805`     | 10k Ohm 0805 SMD Resistor     | `DEMO-SPATIAL-DRAWER-B01` | 2,000 pcs | **Multi-location chooser test**                        |
| `DEMO-C-100N-0805`    | 100nF 50V 0805 MLCC Capacitor | `DEMO-SPATIAL-BIN-A01-02` | 3,000 pcs | Single location mapped bin                             |
| `DEMO-R-100K-0603`    | 100k Ohm 0603 SMD Resistor    | `DEMO-SPATIAL-BIN-A02-01` | 2,500 pcs | Mapped bin in Drawer A02                               |
| `DEMO-LED-GREEN-0805` | Green 0805 Indicator LED      | `DEMO-SPATIAL-BIN-A02-02` | 1,000 pcs | Mapped bin in Drawer A02                               |
| `DEMO-IC-ATTINY`      | ATtiny85-20SU AVR MCU         | `DEMO-SPATIAL-BIN-A03-01` | 50 pcs    | **Deep unmapped bin -> nearest spatial ancestor test** |
| `DEMO-CONN-JST`       | JST-XH 4-Pin 2.50mm Header    | `DEMO-SPATIAL-SHELF-C01`  | 500 pcs   | Shelf tier storage                                     |

---

## Verification & Manual Testing Walkthrough

1. **Spatial Tree & Coverage (`/inventory/spatial`)**:
   - Open `/inventory/spatial` in the browser.
   - Observe the 4 root/facility locations (`DEMO-SPATIAL-WAREHOUSE`, Cabinet A, Cabinet B, Shelf C).
   - Check the mapping status badges:
     - `DEMO-SPATIAL-WAREHOUSE`: **UNMAPPED**
     - `DEMO-SPATIAL-CABINET-A`: **PARTIAL** (due to unmapped A06 and unmapped bins under A03)
     - `DEMO-SPATIAL-CABINET-B`: **PARTIAL** (due to unmapped B03)
     - `DEMO-SPATIAL-SHELF-C`: **PARTIAL** (due to unmapped C03)
     - `DEMO-SPATIAL-DRAWER-A01`: **MAPPED** (both bins mapped)
     - `DEMO-SPATIAL-DRAWER-A03`: **PARTIAL** (bins unmapped)

2. **Spatial Models & Anchors (`/inventory/spatial-models`)**:
   - Verify `Demo 6 Drawer Cabinet`, `Demo Drawer`, and `Demo Shelf`.
   - Inspect anchors and procedural millimeter dimensions.

3. **2D Operational View**:
   - Select `DEMO-SPATIAL-CABINET-A` to see the 2x3 drawer matrix grid with active stock counts.
   - Select `DEMO-SPATIAL-DRAWER-A01` to see the 2 side-by-side bins with 5,000 and 3,000 pcs.

4. **Component → Locate**:
   - Navigate to `/inventory/components` and search `DEMO-`.
   - On `DEMO-R-10K-0805`: Click **Locate**. The Locate modal appears presenting two stock options (`BIN-A01-01` and `DRAWER-B01`). Selecting either navigates directly to the spatial view with the target highlighted.
   - On `DEMO-IC-ATTINY`: Click **Locate**. The component is in unmapped `BIN-A03-01`. The resolver correctly traverses up to `DEMO-SPATIAL-CABINET-A` and focuses `DEMO-SPATIAL-DRAWER-A03`.

5. **Barcode & QR Scanning**:
   - Open the Barcode Scanner (`/scan` or scan button in the top bar).
   - Scan any demo code (e.g. `DEMO-SPATIAL-CABINET-A` or `DEMO-R-10K-0805`).
   - The scanner instantly identifies the entity and navigates to its operational page.
