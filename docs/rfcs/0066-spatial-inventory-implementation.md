# RFC-0066: Spatial Inventory Implementation

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-09-30

---

# 1. Summary

This RFC establishes the phased implementation roadmap, dependency relationships, and engineering guardrails for delivering **Spatial Inventory** into Ananya ERP.

Implementation follows a strictly progressive, risk-mitigated approach. Core domain models and lightweight 2D operational renderers are built and verified before introducing WebGL 3D renderers, authoring editors, or physical hardware integrations.

---

# 2. Phased Implementation Roadmap

```text
Phase 1: Domain & Persistence
  (Schema, Drizzle tables, NestJS spatial module, DTOs, unit tests)
       │
       ▼
Phase 2: 2D Operational Visualization
  (Dense grid/drawer matrix, Shadcn UI components, direct vs descendant stock)
       │
       ▼
Phase 3: 3D Digital Twin Viewer
  (Three.js / React Three Fiber, GLB loader, camera lerp, scene selection)
       │
       ▼
Phase 4: Search-to-Location Integration
  (Global search, BOM viewer, inventory projection lookup, automated locate focus)
       │
       ▼
Phase 5: Spatial Layout Editor & Templates
  (Model library, placement gizmos, anchor generation, parametric templates)
       │
       ▼
Phase 6: QR Code & Mobile Scanner Integration
  (Physical label generation, mobile camera scanning, instantaneous location navigation)
       │
       ▼
Phase 7: Sequenced Picking & Putaway Workflows
  (Multi-bin pick lists, visual route guidance, stock verification)
       │
       ▼
Phase 8: Advanced Capabilities & Hardware Integration
  (Density heatmaps, smart cabinet pick-to-light LED triggers, environmental telemetry)
```

---

# 3. Detailed Phase Specifications

## Phase 1 — Domain & Data Model

- **Scope**:
  - Implement Drizzle ORM schema for `spatial_models`, `spatial_anchors`, `spatial_nodes`, and `spatial_templates` in `packages/database/src/schema/spatial.ts`.
  - Create database migration scripts (`pnpm db:generate`).
  - Create NestJS module `apps/api/src/spatial/` with validated DTOs (`class-validator`), domain services, and repository interfaces.
  - Implement unit and integration tests verifying referential integrity with `locations.id`.
- **Exit Criteria**:
  - All existing `@ananya/inventory` and `@ananya/warehouse` tests pass.
  - CRUD operations on spatial nodes do not alter inventory tables.
  - Locations function with or without associated spatial records.

## Phase 2 — 2D Operational Representation

- **Scope**:
  - Implement 2D Grid / Matrix component (`apps/web/components/spatial/matrix-grid.tsx`) using SVG and CSS Grid.
  - Implement parent-to-child location breadcrumb trail.
  - Visual differentiation between direct stock and descendant stock.
  - Support semantic visual states (Normal, Hover, Selected, Locate-Target, Empty, Low-Stock).
- **Exit Criteria**:
  - Sub-10ms render time for a 60-drawer matrix.
  - Full keyboard accessibility and mobile responsiveness.

## Phase 3 — 3D Digital Twin Viewer

- **Scope**:
  - Integrate Three.js and React Three Fiber into Next.js (`apps/web/components/spatial/three-viewport.tsx`).
  - Support Draco-compressed GLB asset loading with browser caching.
  - Implement raycasting object selection, hover detection, and bounded orbit controls.
  - Implement animated camera transitions (Lerp/Slerp) to target nodes.
- **Exit Criteria**:
  - Sustained 60 FPS on standard desktop browsers.
  - Memory-safe component unmounting with WebGL context disposal.
  - Graceful fallback to 2D when WebGL2 is unsupported.

## Phase 4 — Search-to-Location Integration

- **Scope**:
  - Connect global component search (`apps/web/components/search/`) to spatial locate handlers.
  - Add "Locate in Spatial Viewer" actions to Component Detail pages and BOM lists.
  - Support multi-location resolution (user selects which stock location to inspect).
  - Automatically center camera and trigger visual pulsing highlight on the target compartment.
- **Exit Criteria**:
  - One-click navigation from component search result to highlighted drawer in <1 second.

## Phase 5 — Spatial Editor & Templates

- **Scope**:
  - Implement visual layout configuration interface for warehouse administrators.
  - Model asset management (upload GLB, inspect dimensions, set origin).
  - Parametric template generator (define rows, columns, and pitch to auto-create child locations and anchors).
  - Visual transform gizmos (translate, rotate) with parent-relative coordinate persistence.
- **Exit Criteria**:
  - Administrators can configure a new 60-drawer cabinet and map all 60 drawers in under 2 minutes using templates.

## Phase 6 — QR Code & Mobile Integration

- **Scope**:
  - Standardized QR label generation (`apps/web/components/labels/qr-label-printer.tsx`) for storage bins and locations.
  - Mobile camera scanner integration using HTML5 Barcode Detection API.
  - Scanning location QR navigates directly to its 2D/3D operational dashboard.
- **Exit Criteria**:
  - Scanning physical drawer QR opens the correct drawer details sheet in mobile browser in <800ms.

## Phase 7 — Sequenced Picking & Putaway Workflows

- **Scope**:
  - Connect production orders and fulfillment requests ([RFC-0017](0017-production-orders.md), [RFC-0028](0028-order-fulfillment-requests.md)) to spatial pick sequences.
  - Deterministic location sorting (by aisle, rack, shelf level, bin) to minimize transit.
  - Visual "Next Pick" step-through guidance highlighting current compartment.
- **Exit Criteria**:
  - Multi-item pick lists can be visually guided compartment-by-compartment.

## Phase 8 — Advanced Capabilities & Hardware Integration

- **Scope**:
  - Visual storage density and inventory velocity heatmaps.
  - Webhook / MQTT event bus hooks for physical pick-to-light smart drawers and LED strip controllers.
  - Environmental sensor overlay (temperature, humidity telemetry per bin).

---

# 4. Mandatory Engineering Guardrails

To prevent architectural drift and maintain system reliability, all pull requests implementing spatial features must strictly satisfy the following ten guardrails:

| #      | Guardrail                                            | Enforcement Rule                                                                                                                                                                             |
| :----- | :--------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **3D data is never authoritative**                   | The spatial layer is strictly an observational projection. No stock quantities, balances, or transactions may be stored in spatial tables.                                                   |
| **2**  | **Zero location hierarchy duplication**              | Location containment logic lives exclusively in `locations` (`parentId`) and `warehouses`. Spatial nodes mirror this structure but never duplicate containment business rules.               |
| **3**  | **Zero mesh-to-inventory coupling**                  | Components are never attached directly to meshes or vertices. Relationships must traverse `Component -> InventoryProjection -> Location -> SpatialNode`.                                     |
| **4**  | **Inventory movements use domain transactions**      | Moving physical stock between locations must execute via `@ananya/inventory` transaction services inside database transactions. Spatial transforms are never used to record stock transfers. |
| **5**  | **Deleting spatial data never deletes inventory**    | Cascading rules strictly prohibit deleting `locations` or `inventory_projections` when a `spatial_node`, `spatial_model`, or `spatial_template` is deleted.                                  |
| **6**  | **Location deletion respects inventory constraints** | Deleting a location must verify that zero stock remains at that location before permitting removal. Spatial data deletion cannot bypass this check.                                          |
| **7**  | **Graceful degradation without models**              | All inventory search, viewing, picking, and management features must operate seamlessly even if no 2D or 3D spatial models exist for a location.                                             |
| **8**  | **No premature 3D editor complexity**                | Do not implement complex 3D authoring editors or gizmos before the underlying relational data model and 2D renderers are thoroughly tested and stable.                                       |
| **9**  | **Zero browser CAD/STEP parsing**                    | The web application only consumes web-standard, pre-optimized GLB/GLTF assets. Direct parsing of heavy STEP/IGES files in client browsers is prohibited.                                     |
| **10** | **Templates over manual geometry authoring**         | Repetitive multi-compartment storage (e.g., drawer matrices) must be generated using parametric `SpatialTemplate` formulas rather than manually authoring dozens of redundant meshes.        |

---

# 5. Architectural Success Criterion

> **The Modular Monolith Test**:
> If the entire spatial module (`apps/api/src/spatial/`, `apps/web/components/spatial/`, and `packages/database/src/schema/spatial.ts`) were to be completely removed or disabled via feature flag, **the core Ananya ERP inventory, location, and warehouse management systems must continue to function with 100% operational and mathematical integrity.**

If removing the spatial visualization layer causes any failure in inventory balance calculations, transaction logging, or location hierarchy management, the architectural boundary has been violated.

---

# 6. Related RFCs

- [RFC-0002: Inventory Domain Model](0002-inventory-domain-model.md) — Base concepts of Components, Locations, and Inventory.
- [RFC-0003: Inventory Ledger](0003-inventory-ledger.md) — Authoritative immutable transaction log.
- [RFC-0004: Inventory Projection](0004-inventory-projection.md) — Derived real-time stock balances per location.
- [RFC-0017: Production Orders](0017-production-orders.md) — Manufacturing production orders.
- [RFC-0021: Warehouse Structure & Bin Locations](0021-warehouse-structure-and-bin-locations.md) — Warehouse hierarchy and physical bin management.
- [RFC-0024: Warehouse Transfers](0024-warehouse-transfers.md) — Stock transfer mechanisms between locations.
- [RFC-0028: Order Fulfillment Requests](0028-order-fulfillment-requests.md) — Fulfillment workflows and pick lists.
- [RFC-0062: Spatial Inventory Architecture](0062-spatial-inventory-architecture.md) — Core principles and system boundaries.
- [RFC-0063: Spatial Inventory Data Model](0063-spatial-inventory-data-model.md) — Persistence schema and entity relationships.
- [RFC-0064: Spatial Inventory Visualization](0064-spatial-inventory-visualization.md) — 2D and 3D visual rendering engine.
- [RFC-0065: Spatial Inventory UX](0065-spatial-inventory-ux.md) — User experience and search-to-locate workflows.
