# RFC-0065: Spatial Inventory UX

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-09-30

---

# 1. Summary

This RFC defines the user experience, interaction paradigms, and interface specifications for **Spatial Inventory** in Ananya ERP.

The primary design principle of Spatial Inventory is:

> **"I know what component I need; show me exactly where it is."**

The primary user action is **Locate**, not merely "View in 3D". 3D spatial exploration is never made the default or mandatory interaction simply because it is visually impressive. The user experience prioritizes operational speed, unambiguous physical hierarchy, human-readable breadcrumbs, dual 2D/3D presentation, and mobile-friendly barcode/QR scanning.

---

# 2. Design Principles & Alignment with `DESIGN.md`

All spatial user interfaces adhere to Ananya's core design system (`DESIGN.md`):

1. **Content First & Minimal Clutter**: The interface must disappear behind the physical inventory data. We avoid gratuitous 3D chrome, floating decorative widgets, or non-standard visual controls.
2. **Standard Primitives & Dialog Shells**: All modal overlays, location inspection drawers, and component dialogs compose official Shadcn primitives and the shared `DialogShell` (`apps/web/components/ui/dialog-shell.tsx`).
3. **Canonical Status Indicators**: Every inventory and location indicator uses `<StatusBadge />` with semantic styling (e.g., Emerald for active stock, Amber for low-stock warnings, Destructive for empty or discrepancy).
4. **Zero Native Select Policy**: Entity pickers, warehouse selectors, and search filters compose official `<Combobox>` (`Popover` + `Command`) or `<Select>` primitives.

---

# 3. Core User Workflows

## 3.1 The Component Locate Workflow

When an engineer or warehouse operator searches for a component (via global search, BOM review, or production order issue):

```text
┌────────────────────────────────────────────────────────┐
│ Global Search / Component Page: GRM188R71H104KA93      │
│ 100nF 50V X7R 0603 Ceramic Capacitor                   │
│ Total System Stock: 4,820 pcs                          │
├────────────────────────────────────────────────────────┤
│ Physical Stock Locations:                              │
│                                                        │
│ 1. Cabinet A / Drawer A4                      500 pcs  │
│    Path: WH-MAIN > ZONE-LAB > CAB-A > D-A4             │
│    [ Locate ]   [ View 2D ]   [ View 3D ]              │
│                                                        │
│ 2. Cabinet B / Drawer C2                    1,200 pcs  │
│    Path: WH-MAIN > ZONE-LAB > CAB-B > D-C2             │
│    [ Locate ]   [ View 2D ]   [ View 3D ]              │
│                                                        │
│ 3. Bulk Rack 02 / Shelf B / Bin 14          3,120 pcs  │
│    Path: WH-MAIN > ZONE-BULK > RACK-02 > S-B > B-14    │
│    [ Locate ]   [ View 2D ]   [ View 3D ]              │
└────────────────────────────────────────────────────────┘
```

### Action Behavior:

- Clicking **[ Locate ]**:
  1. Opens the optimal spatial viewer (defaults to 2D for drawer cabinets, 3D for warehouse bulk racks).
  2. Highlights the exact storage compartment (`DRAWER-C2`) with an emerald locator ring and pulse.
  3. Centers the view (or camera lerp in 3D) directly on the target unit.
  4. Keeps the persistent physical breadcrumb path visible at the top of the viewport.
  5. Opens a slide-over sheet displaying component details, available quantity, and rapid action buttons (`Issue Stock`, `Transfer`, `Print Label`).

---

## 3.2 Human-Readable Storage Breadcrumbs

Every physical location in the system presents a continuous, human-readable breadcrumb trail:

```text
Warehouse Main  >  Hardware Lab  >  Storage Aisle 02  >  Cabinet B  >  Drawer C2  >  Bin 04
```

### Interaction Rules:

- **Clickable Hierarchy**: Clicking any segment in the breadcrumb immediately navigates to and focuses that parent or ancestor location.
- **Copyable Path**: A single-click copy button copies the canonical string path (`WH-MAIN/ZONE-LAB/AISLE-02/CAB-B/D-C2/B-04`) for use in pick tickets or physical labelling.
- **Parent vs. Child Clarity**: When viewing `Cabinet B`, the breadcrumb clearly establishes that `Drawer C2` is a child compartment inside it, not a standalone unit.

---

## 3.3 Direct vs. Descendant Stock Clarity

The interface strictly resolves ambiguities between parent containers and child compartments:

```text
┌────────────────────────────────────────────────────────┐
│ Location: Component Cabinet A (CAB-A)                  │
│ Kind: Rack / Cabinet                                   │
├────────────────────────────────────────────────────────┤
│ Aggregated Total Stock: 4,820 components               │
│ Direct Stock (at Cabinet level): 0 components          │
│ Child Compartments: 60 drawers (42 occupied, 18 empty) │
├────────────────────────────────────────────────────────┤
│ Drawer Matrix (2D View):                               │
│ [ A1: 500 pcs ] [ A2: 1200 pcs ] [ A3: Empty    ] ... │
│ [ B1: 250 pcs ] [ B2: 800 pcs  ] [ B3: 1500 pcs ] ... │
│ [ C1: Empty   ] [ C2: 3120 pcs ] [ C3: Empty    ] ... │
└────────────────────────────────────────────────────────┘
```

- **Direct Stock**: Components placed directly on the shelf or container without an intervening sub-bin.
- **Contained Stock**: Total components across all recursive child drawers or bins.
- The UI never displays contained stock as if it were sitting loose in the parent container.

---

## 3.4 2D / 3D Mode Switching

Users can switch seamlessly between 2D and 3D visual representations with a persistent segmented control:

```text
[ ⊞ 2D Grid ]  [ ⬡ 3D Scene ]  [ ☰ Tree List ]
```

- **Default Mode Selection**:
  - Dense multi-compartment units (drawers, SMD cabinets, bin trays) default to **2D Grid**.
  - Facility floor plans, multi-aisle warehouses, and tall pallet racks default to **3D Scene**.
  - Users can persist their preferred default view in their personal preferences (`packages/database/src/schema/preferences.ts`).
- **Synchronized State**: Switching modes preserves the active selection, highlight, and inspection sheet without reloading data.

---

## 3.5 QR Code Integration

Physical storage units and component packaging feature high-density QR codes for rapid mobile interaction:

```text
┌───────────────────────┐           ┌───────────────────────┐
│     Location QR       │           │     Component QR      │
│  "loc:ananya:CAB-B"   │           │  "cmp:ananya:GRM188"  │
└───────────┬───────────┘           └───────────┬───────────┘
            │ Scan                              │ Scan
            ▼                                   ▼
  Opens Location Page                 Opens Component Page
  • Shows physical 2D layout          • Shows total stock across all WH
  • Lists all stored parts            • Lists all physical locations
  • Shows occupancy & capacity        • Highlights primary pick location
```

### QR Workflows:

1. **Scanning a Location Tag** (e.g., on a drawer front):
   - Opens the location details sheet on mobile.
   - Highlights the drawer in the 2D cabinet view.
   - Lists all components stored in that drawer with lot/serial details.
2. **Scanning a Component Reel / Bag**:
   - Opens the component overview.
   - Automatically ranks locations by proximity or stock quantity.
   - Provides a prominent "Locate This Part" button to trigger visual guidance.

---

## 3.6 Handling Unmapped or Empty Locations

A storage location may exist in Ananya's warehouse hierarchy before any 3D model or 2D grid template has been configured:

1. **Unmapped Locations**:
   - The interface displays the full human-readable breadcrumb path and alphanumeric address.
   - A subtle informative banner appears:
     > `No spatial model configured for this location. [Assign Model or Template]`
   - Standard inventory transactions (Receipt, Issue, Transfer, Adjust) operate with 100% functionality without spatial dependencies.
2. **Empty Locations**:
   - Empty drawers or bins are rendered with dashed borders (`border-dashed border-muted`) and muted styling.
   - Clicking an empty compartment opens a quick-action sheet:
     > `Empty Bin (BIN-C2-03) — Capacity: 1,000 units — [Putaway / Assign Stock]`

---

## 3.7 Mobile Handheld & Tablet UX

Warehouse operators frequently use rugged Android mobile computers or tablets:

- **Speed Over 3D**: On mobile devices, 2D Grid layouts and the text-first breadcrumb path are prioritized to maximize touch targets and battery life.
- **Integrated Camera Scanner**: The search bar includes an inline camera barcode/QR scanner button.
- **Large Touch Targets**: Drawer cells and action buttons adhere to minimum `44px x 44px` touch targets.
- **One-Handed Navigation**: Critical action drawers slide up from the bottom of the viewport (`Sheet side="bottom"`).

---

# 4. Related RFCs

- [RFC-0002: Inventory Domain Model](0002-inventory-domain-model.md) — Base concepts of Components and Locations.
- [RFC-0021: Warehouse Structure & Bin Locations](0021-warehouse-structure-and-bin-locations.md) — Physical warehouse hierarchy and bin storage context.
- [RFC-0062: Spatial Inventory Architecture](0062-spatial-inventory-architecture.md) — Architectural principles and data boundaries.
- [RFC-0063: Spatial Inventory Data Model](0063-spatial-inventory-data-model.md) — Relational schema for models, nodes, and anchors.
- [RFC-0064: Spatial Inventory Visualization](0064-spatial-inventory-visualization.md) — 2D and 3D rendering engine and camera behavior.
- [RFC-0066: Spatial Inventory Implementation](0066-spatial-inventory-implementation.md) — Phased rollout plan.
