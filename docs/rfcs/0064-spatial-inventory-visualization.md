# RFC-0064: Spatial Inventory Visualization

**Status:** Accepted

**Author:** Ananya Contributors

**Created:** 2026-09-30

---

# 1. Summary

This RFC defines the visualization architecture for **Spatial Inventory** in Ananya ERP, encompassing both 2D operational layouts and 3D spatial scenes.

Neither 2D nor 3D is authoritative. Both are visual projection layers rendering the same underlying domain state: `locations` (`packages/database/src/schema/locations.ts`), `inventory_projections` (`packages/database/src/schema/inventory-projections.ts`), and `spatial_nodes` ([RFC-0063](0063-spatial-inventory-data-model.md)).

The system provides:

- **2D Operational Matrix**: High-speed, responsive layout engine for dense drawer grids, shelf racks, and bin matrices.
- **3D Digital Twin View**: Interactive spatial context engine using Three.js and React Three Fiber for facility navigation, room layouts, and vertical rack exploration.
- **Deterministic Search-to-Visual Focus**: Smooth camera transitions and visual highlighting when locating components.
- **Strict Visual Hierarchy**: Clear visual distinction between items stored directly in a parent unit versus items contained within child sub-compartments.

---

# 2. Dual-Mode Visualization Strategy

```text
                        Authoritative State
             (Locations, Inventory Projections, Spatial Nodes)
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       2D Operational Renderer             3D Spatial Engine
    (DOM / SVG / HTML5 Canvas)         (Three.js / React Three Fiber)
  ┌───────────────────────────────┐  ┌───────────────────────────────┐
  │ - Dense drawer matrices       │  │ - Room & facility layout      │
  │ - Sub-second render time      │  │ - 60 FPS orbit/pan/zoom       │
  │ - Mobile & handheld optimized │  │ - True physical dimensions    │
  │ - Zero WebGL requirement      │  │ - Visual context & proximity  │
  └───────────────────────────────┘  └───────────────────────────────┘
```

## 2.1 The 2D Operational Matrix

The 2D view is the primary operational interface for dense storage units (such as 30- to 60-drawer SMD cabinets, tape reel organizers, and shelf bins).

### Characteristics:

- **Rendering Technology**: Composable React 19 components using SVG or CSS Grid/Flexbox conforming to Ananya's Shadcn design language (`DESIGN.md`).
- **Dense Grid Layouts**: Renders matrix configurations (e.g., Row A–F, Column 1–10) with crisp alphanumeric labels.
- **Instant Interaction**: Sub-10ms render latency with zero GPU or WebGL context initialization overhead.
- **Mobile First**: Fully responsive and touch-friendly for warehouse handheld terminals and smartphones.
- **Information Density**: Displays status badges, occupancy bars, stock count indicators, and selection rings without visual clutter.

### Parametric Front Elevation (Inventory Builder)

Inside the Inventory Builder, the 2D view is a dimensionally faithful orthographic **front elevation** of the same physical layout rendered in 3D:

- **Single Geometry Source**: Compartments are projected directly from the parametric engine's `GeneratedCompartment` envelopes (`position` ± `dimensions / 2`) and the configured container dimensions. The frontend never regenerates rows, columns, dividers, or slot positions.
- **Front-Facing Axis**: The projection looks along the same axis as the 3D "Front" camera preset (-Z, X right / Y up), flipping world Y into screen Y. Depth is ignored; the outer container envelope forms the frame and the physical gaps between compartment envelopes are the dividers, rack posts, and beams.
- **Proportional Fidelity**: A single aspect-preserving px/mm scale fits the drawing into the viewport (never stretched), so unequal compartment widths, heights, and spacing remain proportional. Zoom and pan operate on that same transform.
- **Labels**: Each compartment renders its existing addressable code, centred and clipped by layout rules (scaled, truncated, or hidden) without altering geometry; labels reappear as the view is zoomed.
- **Selection Parity**: 2D selection is keyed by the engine's stable `slotId`, so 2D and 3D highlight the same slot through shared workspace state, and geometry edits cannot leave stale visual slot mappings.
- **Top-Level Container Selection**: The outer container is selectable independently of its compartments — by clicking the container frame (or empty structural space inside it) in 2D, by clicking the carcass in 3D, or through the explicit container control. Container selection and compartment selection are mutually exclusive and share the same state across both views.
- **Container Assignment**: The container's Ananya location is the layout's `parentLocationId` — the same relationship persisted with the layout. Assigning it never writes a `spatial_layout_mappings` row and never creates a spatial node for the container itself; compartment mappings remain separate and must be active descendants of the container.
- **Parent-First Gate**: Until the container location is assigned, both views show the same persistent "Step 1: Select the parent container" instruction, the outer container is emphasised as the primary target, and child compartments render in a locked, non-interactive state (2D: dimmed with `aria-disabled`, clicks fall through to the container frame; 3D: disabled palette with child meshes transparent to raycasts so the carcass receives the click). One shared condition derived from the draft's `parentLocationId` drives both views, so they cannot drift. Assigning the container flips both views to the completion state and unlocks child selection/mapping immediately; clearing the assignment re-locks children while keeping existing mappings flagged stale for review rather than discarding them.

## 2.2 The 3D Digital Twin Engine

The 3D view provides spatial orientation, depth, and vertical context across rooms, aisles, and tall storage racks.

### Characteristics:

- **Rendering Technology**: WebGL / WebGPU via **Three.js** and **React Three Fiber (R3F)** inside Next.js client components.
- **Asset Standard**: Web-standard **GLB / GLTF 2.0** assets loaded over HTTP/CDN with Draco geometry compression.
- **Camera Controls**: Orbit, pan, zoom, and programmatic animated focus with bounded collision and angle limits.
- **Instanced Rendering**: Repeated storage units (e.g., identical racks or bins) share geometry and materials via Three.js `InstancedMesh`.

### Interactive Drawer Opening (Inventory Builder)

The Inventory Builder's 3D preview is an editable surface, so compartments can be opened in place to inspect the physical interior:

- **Single Active Drawer**: At most one compartment is extended at a time. Clicking a compartment selects its `slotId` and slides it out; clicking it again, clicking another compartment, clicking empty space, or changing the shared selection closes it.
- **Opening Axis**: Compartments translate along their own front-facing axis (the rotated local +Z axis on which the front plate and label are modelled), so the motion follows the authored orientation rather than a hard-coded world direction.
- **Extension**: Full extension is a fraction of the compartment's own depth (85%, bounded to 30–450 mm), which clears the carcass opening without exceeding the slide rails. Travel never overlaps neighbouring compartments because the motion is confined to the opening axis.
- **Interior Geometry**: Openable drawers and parts-tray slots are modelled as a hollow open-top tray (floor, two sides, back wall) behind the existing labelled front plate and handle, inside the envelope of the closed body. Bins already render open-topped, and rack/shelf tiers slide out as their existing deck. No stored contents are invented.
- **State Cues**: The open compartment prints a transient "OPEN" indicator on its front-plate label, so the state is legible without relying on color alone, and remains selected for the mapping workflow while extended.
- **View-Only Guarantee**: Opening and closing mutate only Three.js transforms. Generated compartments, `slotId`s, mappings, revisions, published geometry, and persisted layout state are never touched, and no location is created or deleted.
- **Invalidation**: Template changes, layout reloads, container switches, and selection changes close the active compartment and discard its transient motion state, so no orphaned animation survives a scene rebuild.

---

# 3. Search-to-Visual Workflow

A core capability of Spatial Inventory is guiding the user seamlessly from a textual search result to the physical storage unit:

```text
Step 1: User Searches Component
        Query: "GRM188R71H104KA93" (100nF 0603 Capacitor)
                           │
Step 2: Inventory Resolution (RFC-0004)
        Found in 2 Locations:
        • Cabinet A / Drawer C2: 2,500 pcs
        • Lab Bench 1 / Reel Bin 04: 150 pcs
                           │
Step 3: User Selects "Locate" on Cabinet A / Drawer C2
                           │
Step 4: Spatial Entity Lookup (RFC-0063)
        Resolve:
        • Parent SpatialNode: "Cabinet A" (model: "smd-cab-60d.glb")
        • Target SpatialAnchor: "DRAWER-C2" (local pos: [0.12, 0.45, 0.00])
                           │
Step 5: Scene Ingestion & Camera Lerp
        • Open/mount visual viewer (or switch tabs if already mounted)
        • Calculate camera target: world_pos(Cabinet A) + local_pos(DRAWER-C2)
        • Smoothly interpolate camera position and look-at vector
                           │
Step 6: Visual Highlight & Context Display
        • Apply "locate-target" highlight (pulsing outline / emissive accent)
        • Highlight parent path in 2D breadcrumbs
        • Display floating inspector sheet with component specs and quantity
```

---

# 4. Semantic Visual States

To ensure visual clarity, storage entities support a unified state machine across both 2D and 3D modes:

| Visual State       | Meaning                                  | 2D Representation                                       | 3D Representation                                |
| :----------------- | :--------------------------------------- | :------------------------------------------------------ | :----------------------------------------------- |
| **Normal**         | Idle storage location with active stock. | Standard card border, muted background.                 | Default PBR material, neutral shading.           |
| **Hover**          | Cursor or touch pointer over entity.     | Accent border glow, subtle background tint.             | Cursor pointer change, subtle edge highlight.    |
| **Selected**       | Currently inspected location.            | High-contrast 2px border (`ring-2 ring-primary`).       | Bounding box highlight, camera focus anchor.     |
| **Search-Match**   | Matches active search filter.            | Amber highlight badge or outline.                       | Tinted material overlay with search tag icon.    |
| **Locate-Target**  | Specific target of a "Locate" action.    | High-visibility emerald pulse, target icon.             | Animated outline glow, camera centered on node.  |
| **Low-Stock**      | Stock level below safety threshold.      | Warning badge (`bg-amber-500/10 text-amber-700`).       | Amber indicator emblem on compartment face.      |
| **Empty**          | Zero stock assigned or present.          | Muted text, dashed border (`border-dashed`).            | Translucent / ghosted mesh rendering.            |
| **Child-Selected** | A child sub-location is selected.        | Soft parent outline indicating active descendant.       | Parent model rendered in semi-transparent shell. |
| **Disabled**       | Storage location out of service.         | Slate hatch pattern, `<XCircle className="w-3 h-3" />`. | Darkened gray material, inactive icon billboard. |

### Accessibility Mandate:

Per `DESIGN.md`, state must **never** be conveyed through color alone. Every semantic state must be accompanied by text labels, distinct iconography (e.g., standard Lucide icons), or high-contrast border geometries.

---

# 5. Camera Behavior & Focus Dynamics

When navigating to a target in 3D:

1. **Target Framing**: The camera targets the bounding sphere of the target `SpatialNode` or `SpatialAnchor`. The bounding box is computed from model metadata and world transform.
2. **Smooth Damping (Lerp)**: Camera position and orientation transition using spherical linear interpolation (Slerp) or damped springs over 600–900ms.
3. **Orientation Preservation**: If the target is already within the camera frustum at a legible scale, the camera maintains its current viewing angle and performs only minor centering, avoiding sudden disorienting rotations.
4. **Elevation Pitch**: Focus transitions automatically adopt a standard 25°–35° downward isometric angle to maintain spatial depth and perspective relative to the room floor.
5. **Frustum Culling & Near Plane**: The camera near plane adjusts dynamically to prevent clipping through neighboring cabinet doors or shelf frames.

---

# 6. Direct vs. Descendant Hierarchy Representation

A critical requirement of Ananya's storage model is preventing ambiguity between parent containers and child bins.

```text
Cabinet A (Parent Unit)
 ├── Total Contained Components: 4,820 pcs (across 12 drawers)
 ├── Direct Components at Cabinet Level: 0 pcs
 │
 ├── Drawer A1: 500 pcs
 ├── Drawer A2: 1,200 pcs
 └── Drawer C2 (Target): 3,120 pcs
```

### Visual Rules:

1. **Parent Inspection**: Inspecting "Cabinet A" displays an aggregated count ("4,820 items across 12 child locations") but clearly highlights: `Direct Stock: 0`.
2. **Child Compartment Inspection**: When "Drawer C2" is focused, only Drawer C2 receives the primary highlight. Cabinet A remains rendered as a contextual container (soft outline), preventing the user from believing the entire cabinet is filled with Drawer C2's components.
3. **Persistent Breadcrumb**: Both 2D and 3D viewers display the full hierarchical breadcrumb path:
   `Warehouse > Hardware Lab > Cabinet A > Drawer C2` with clickable segments allowing instant zoom-out navigation.

---

# 7. Performance & Optimization Architecture

Rendering large warehouses with hundreds of storage units and thousands of bins requires strict performance discipline:

1. **Progressive & Lazy Asset Loading**:
   - The 2D view renders immediately with zero network delay for 3D assets.
   - 3D GLB models load asynchronously on-demand using HTTP range requests and browser cache (`Cache-Control: public, max-age=31536000, immutable`).
2. **Geometry Instancing**:
   - Racks, bins, and drawers with identical dimensions share a single vertex buffer via `InstancedMesh`.
   - Per-instance transforms and colors are uploaded via instance matrices and uniform buffers, reducing draw calls from thousands to single digits per scene.
3. **Frustum & Occlusion Culling**:
   - Mesh nodes outside the active camera frustum are culled automatically.
   - For enclosed rooms or large facilities, room-level occlusion boundaries prevent rendering storage units located behind solid walls.
4. **Device Degradation & Fallback**:
   - The application detects low-power devices, mobile mobile Safari memory limits, or missing WebGL2 contexts.
   - When 3D cannot achieve stable 30+ FPS, the interface seamlessly defaults to the 2D Operational Matrix without throwing errors or blocking inventory workflows.

---

# 8. Security & Access Control

Spatial visualization is governed by Ananya's unified role-based access control (RBAC) matrix:

- **Authorization Inheritance**: Access to a `SpatialNode` or its 3D asset inherits the permission rules of the associated domain `Location`.
- **Restricted Facilities**: A user who lacks read permissions for a high-security warehouse zone (e.g., `ZONE-ITAR` or `ZONE-VALUABLE`) cannot query spatial nodes, fetch 3D floor plans, or view inventory distributions within that zone.
- **Signed Asset Delivery**: Storage models hosted on S3/MinIO/CDN are accessed via short-lived signed URLs generated by the NestJS API layer after verifying user session tokens.

---

# 9. Related RFCs

- [RFC-0004: Inventory Projection](0004-inventory-projection.md) — Real-time component stock per location.
- [RFC-0021: Warehouse Structure & Bin Locations](0021-warehouse-structure-and-bin-locations.md) — Physical warehouse hierarchy.
- [RFC-0062: Spatial Inventory Architecture](0062-spatial-inventory-architecture.md) — Fundamental principles and bounded context boundaries.
- [RFC-0063: Spatial Inventory Data Model](0063-spatial-inventory-data-model.md) — Schemas for models, anchors, nodes, and templates.
- [RFC-0065: Spatial Inventory UX](0065-spatial-inventory-ux.md) — User interaction design, locate workflows, and QR scanning.
- [RFC-0066: Spatial Inventory Implementation](0066-spatial-inventory-implementation.md) — Phased implementation plan.
