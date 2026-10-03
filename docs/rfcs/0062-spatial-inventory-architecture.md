# RFC-0062: Spatial Inventory Architecture

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-09-30

---

# 1. Summary

This RFC establishes the high-level architecture for **Spatial Inventory** in Ananya ERP. Spatial Inventory introduces a physical twin and spatial visualization overlay on top of Ananya's existing inventory, warehouse, and location domain models.

The system bridges the cognitive gap between logical inventory records and their physical reality in laboratories, workshops, and warehouses. By mapping physical storage structures (e.g., rooms, racks, cabinets, drawers, and bins) to spatial geometry and interactive 2D/3D representations, users can visually locate components, navigate complex storage facilities, and execute picking and putaway operations with physical clarity.

Spatial Inventory is strictly an **overlay** and **presentation** layer. It never owns inventory balances, transaction ledgers, or location hierarchy truth.

---

# 2. Motivation & Problem Statement

Ananya already models components, stock levels, and physical storage hierarchies through the Inventory context ([RFC-0002](0002-inventory-domain-model.md), [RFC-0003](0003-inventory-ledger.md), [RFC-0004](0004-inventory-projection.md)) and the Warehouse context ([RFC-0021](0021-warehouse-structure-and-bin-locations.md)). A location hierarchy such as:

```text
Main Warehouse (WH-MAIN)
 └── Hardware Lab (ZONE-LAB)
      └── Storage Aisle 02 (AISLE-A02)
           └── Component Cabinet B (RACK-CAB-B)
                └── Drawer C2 (SHELF-C2)
                     └── Bin 04 (BIN-C2-04)
```

accurately models logical containment, ownership, and inventory projections. However, a text-only or tree-only hierarchy cannot visually convey physical reality:

1. **Physical Orientation & Layout**: Where is "Cabinet B" positioned inside the room relative to the entrance, workbench, or other cabinets?
2. **Dense Multi-Compartment Search**: When looking at a cabinet of 60 identical drawers or a reel rack with hundreds of slots, which exact compartment holds the desired component?
3. **Retrieval Friction**: Users must mentally parse alphanumeric codes (`BIN-C2-04`) and hunt physically across storage units, introducing delays and misplacement risks.
4. **Context & Proximity**: What other parts are stored immediately adjacent to this component? Is the shelf nearing physical capacity?
5. **Decoupling Hierarchy from Physical Visualization**: Existing operations require rapid visual confirmation without distorting the immutable transaction ledger.

Spatial Inventory resolves these challenges by introducing spatial models, nodes, and anchors mapped directly to authoritative locations.

---

# 3. Core Architectural Principles

```text
┌────────────────────────────────────────────────────────┐
│                   Component Catalog                    │
│             (What an item is — RFC-0002)               │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    Inventory Ledger                    │
│        (Stock movements & truth — RFC-0003)            │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                   Location Hierarchy                   │
│      (Authoritative containment — RFC-0002/0021)       │
└───────────────────────────┬────────────────────────────┘
                            │ optional mapping
┌───────────────────────────▼────────────────────────────┐
│                     Spatial Overlay                    │
│         (Physical representation — RFC-0063)           │
└───────────────────────────┬────────────────────────────┘
                            │
             ┌──────────────┴──────────────┐
             │                             │
┌────────────▼────────────┐   ┌────────────▼────────────┐
│         2D View         │   │         3D View         │
│ (Fast operational grid) │   │ (Spatial twin & context)│
└─────────────────────────┘   └─────────────────────────┘
```

The architecture adheres to four mandatory constraints:

### 1. Inventory & Location Remain the Authoritative Truth

The Spatial Inventory system is purely an observational physical digital twin. It **never** owns:

- Stock quantities or balances
- Component identities or catalog attributes
- Inventory ledger transactions or adjustments
- Reservations or allocations ([RFC-0008](0008-inventory-reservations.md))
- Authoritative location hierarchy or bin containment

All stock quantities remain derived strictly from the immutable Inventory Ledger ([RFC-0003](0003-inventory-ledger.md)) via Inventory Projections ([RFC-0004](0004-inventory-projection.md)).

### 2. Components Are Never Attached Directly to Meshes

A component is never associated directly with a 3D mesh, vertex, or geometry node (`Component -> Mesh` is strictly prohibited). The relationship must always traverse the domain boundary:

```text
Component ──> InventoryProjection ──> Location ──> SpatialNode ──> SpatialModel / SpatialAnchor
```

If a 3D model is deleted, updated, or temporarily unassigned, inventory integrity remains completely unaffected.

### 3. Location Hierarchy Operates Independently of 3D

Ananya's recursive location structure (`parentId` in `locations` and `Warehouse -> Zone -> Aisle -> Rack -> Shelf -> Bin` in [RFC-0021](0021-warehouse-structure-and-bin-locations.md)) functions fully without any spatial data. Spatial nodes attach optionally to locations. A warehouse or drawer can exist, receive inventory, and transfer stock even if no 2D layout or 3D mesh has ever been configured.

### 4. Direct vs. Descendant Inventory Must Remain Distinguishable

In a hierarchical storage system, components can be stored directly at a parent node or within one of its child locations:

- **Direct Stock**: Components residing specifically at the target location (e.g., a bulk bin on a shelf).
- **Descendant Stock**: Components residing within child sub-locations (e.g., parts inside drawers inside a cabinet).

The spatial architecture preserves this distinction so that aggregated stock in sub-compartments is never misidentified as sitting loose inside the parent unit.

---

# 4. Authoritative Data Boundaries

To prevent coupling between visualization technologies and business logic, strict bounded context separation is enforced:

| Bounded Context / Domain         | Responsibilities                                                                                                  | Forbidden Operations                                                                   |
| :------------------------------- | :---------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| **`@ananya/inventory`**          | Component catalog, immutable transactions, ledger journal, stock projections, reservations.                       | Storing XYZ coordinates, camera viewpoints, mesh references, or 3D asset paths.        |
| **`@ananya/warehouse`**          | Physical bin addresses, operational purposes (Receiving, Storage, Quality Hold), capacity limits.                 | Direct manipulation of geometry or spatial transforms.                                 |
| **`@ananya/spatial` (Proposed)** | Spatial models (GLB/GLTF), spatial nodes, relative transforms, anchors, templates, camera targets.                | Writing stock balances, modifying inventory transactions, changing location parentage. |
| **UI Presentation Layer**        | 2D SVG/Canvas layouts, Three.js / React Three Fiber rendering, orbit controls, camera lerp, selection highlights. | Calculating business metrics or bypassing domain services.                             |

---

# 5. Spatial Overlay Model

The physical twin model is structured into four primary domain entities (detailed in [RFC-0063](0063-spatial-inventory-data-model.md)):

1. **`SpatialModel`**: A reusable geometric definition (e.g., standard 60-drawer SMD cabinet, 4-tier pallet rack, laboratory bench). Geometry is stored in open, web-standard formats (GLB/GLTF).
2. **`SpatialNode`**: A concrete physical occurrence of a spatial object placed in space, associated 1-to-1 or N-to-1 with a domain `Location`. Nodes maintain parent-relative transforms (position, rotation, scale).
3. **`SpatialAnchor`**: Named reference points or bounding regions within a `SpatialModel` (e.g., `Drawer A1`, `Shelf Level 3`, `Bin C4`). Anchors map directly to child locations without requiring separate 3D mesh files for every drawer.
4. **`SpatialTemplate`**: Algorithmic layout rules that generate grid-based anchors and matching child locations for structured multi-compartment organizers.

### Physical Digital Twin Relationship

```text
Domain Location (e.g., "Cabinet A")
       │
       ▼ (has optional)
  SpatialNode (Transform: pos=[12.0, 0.0, 4.5], rot=[0, 90, 0])
       │
       ├── references ──> SpatialModel ("SMD-Cabinet-60D.glb")
       │
       └── child nodes / anchors
             ├── Anchor "A1" ──> Child Location: Drawer A1
             ├── Anchor "A2" ──> Child Location: Drawer A2
             └── Anchor "A3" ──> Child Location: Drawer A3
```

---

# 6. Multi-Location Stock Distribution

In electronics engineering and manufacturing, a single component often resides across multiple physical locations:

- 500 pcs in Production Bench 1 (active reel)
- 2,500 pcs in SMD Cabinet A, Drawer A4 (secondary reserve)
- 10,000 pcs in Bulk Storage Warehouse, Rack 03 (overstock)

The spatial architecture supports this natively. A component query resolves all active `inventory_projections` across distinct location records. The user can select any location to launch a focused spatial view.

---

# 7. Search-to-Location Flow

Locating physical components is the central interaction of Spatial Inventory:

```text
User searches for Component (MPN / SKU / Keyword)
                     │
                     ▼
Retrieve Inventory Projections (RFC-0004)
                     │
                     ▼
Display Location Options & Quantities
                     │ (User clicks "Locate")
                     ▼
Resolve Target Location ID ──> SpatialNode / SpatialAnchor
                     │
                     ▼
Determine Visualization Mode (2D Grid or 3D Spatial Scene)
                     │
                     ▼
Highlight Target Node / Drawer + Animate Camera Focus
                     │
                     ▼
Display Contextual Breadcrumb & Inventory Details
```

If a location lacks a spatial model, the interface degrades gracefully to the human-readable hierarchical breadcrumb path (`Warehouse > Zone > Aisle > Rack > Shelf > Bin`).

---

# 8. 2D and 3D Coexistence

Neither 2D nor 3D is considered superior; they fulfill complementary operational needs:

- **2D Operational View**: Fast, lightweight, dense grid representation ideal for mobile handhelds, drawer matrices, and high-speed picking.
- **3D Spatial Context**: Provides physical room context, orientation, vertical elevation on racks, and spatial navigation across large facilities.

Both views subscribe to the same underlying spatial node and inventory projection state ([RFC-0064](0064-spatial-inventory-visualization.md)).

---

# 9. Architectural Extensibility

The decoupled spatial overlay architecture directly enables future capabilities without disrupting core ERP transactions:

- **Barcode & QR Integration**: Scanning a physical QR code on a cabinet or drawer resolves its `Location` ID, immediately triggering the corresponding 2D/3D visual focus ([RFC-0065](0065-spatial-inventory-ux.md)).
- **Visual Pick-Lists**: Sequenced picking routes across storage racks can highlight target compartments step-by-step ([RFC-0066](0066-spatial-inventory-implementation.md)).
- **Physical Pick-to-Light / Hardware Indicators**: Webhook or MQTT event hooks can trigger external hardware controllers (e.g., LED strip on a drawer) upon spatial selection.
- **Augmented Reality (AR) & Indoor Navigation**: Standard GLTF transforms allow future WebXR integration without changing the database schema.

---

# 10. Architectural Invariants

1. **Transaction Immutability**: No spatial operation may create, modify, or delete rows in `inventory_transactions`.
2. **Zero Orphaned Inventory**: Deleting a `SpatialNode` or `SpatialModel` deletes only physical rendering data; under no circumstances may it delete or alter `locations` or `inventory_projections`.
3. **Graceful Fallback**: The entire Ananya web application must remain 100% operational in headless, text-only, or WebGL-disabled environments.
4. **Relational Consistency**: A `SpatialNode` must always reference a valid `Location` entity. If a `Location` is removed (following standard domain constraints), its associated `SpatialNode` is cascadingly removed.

---

# 11. Alternatives Considered

### Alternative A: Embedding Spatial Coordinates in the `locations` Table

- _Approach_: Add `x, y, z, rotation_x, rotation_y, rotation_z, mesh_url` columns directly to `locations`.
- _Why Rejected_: Violates separation of concerns. Non-physical or logical locations (e.g., "In Transit", "Supplier RMA", "Scrap") have no spatial properties. Furthermore, multiple visual representations or reusable templates would result in duplicated, denormalized geometric data.

### Alternative B: Direct Integration with CAD/BIM File Formats (STEP/IFC)

- _Approach_: Store raw mechanical CAD files (STEP, IGES, SolidWorks) and parse them in the browser.
- _Why Rejected_: CAD files are massive (tens to hundreds of megabytes), slow to parse, proprietary, and lack optimized runtime mesh structures. Web-standard GLB/GLTF assets with server-side conversion provide instant loading and 60 FPS rendering on commodity client devices.

---

# 12. Related RFCs

- [RFC-0002: Inventory Domain Model](0002-inventory-domain-model.md) — Ubiquitous language for Components, Locations, and Inventory.
- [RFC-0003: Inventory Ledger](0003-inventory-ledger.md) — Authoritative source of truth for all inventory movements.
- [RFC-0004: Inventory Projection](0004-inventory-projection.md) — Derived real-time stock balances per location.
- [RFC-0008: Inventory Reservations](0008-inventory-reservations.md) — Allocation of inventory to production orders.
- [RFC-0021: Warehouse Structure & Bin Locations](0021-warehouse-structure-and-bin-locations.md) — Physical warehouse hierarchy and bin aggregate roots.
- [RFC-0024: Warehouse Transfers](0024-warehouse-transfers.md) — Movement of stock between locations.
- [RFC-0063: Spatial Inventory Data Model](0063-spatial-inventory-data-model.md) — Persistence schema, entities, and spatial relationships.
- [RFC-0064: Spatial Inventory Visualization](0064-spatial-inventory-visualization.md) — 2D and 3D rendering pipeline and camera behavior.
- [RFC-0065: Spatial Inventory UX](0065-spatial-inventory-ux.md) — User experience, search-to-locate workflows, and QR interactions.
- [RFC-0066: Spatial Inventory Implementation](0066-spatial-inventory-implementation.md) — Phased rollout and engineering guardrails.
