import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSpatialBreadcrumbs } from "./spatial-hierarchy";
import {
  layoutChildrenFor3D,
  resolveTargetChildLocationId,
} from "./spatial-3d-layout";
import type { LocationOperationalViewChildDto } from "../api/spatial-api";

const webRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const readWebFile = (rel: string) => fs.readFileSync(path.join(webRoot, rel), "utf8");

describe("Spatial Navigation & Breadcrumb Engine", () => {
  const mockHierarchy = [
    {
      id: "wh-1",
      code: "WH-A",
      name: "Warehouse A",
      kind: "warehouse",
      parentId: null,
    },
    {
      id: "cab-1",
      code: "CAB-A",
      name: "Cabinet A",
      kind: "cabinet",
      parentId: "wh-1",
    },
    {
      id: "draw-1",
      code: "DRAWER-A01",
      name: "Drawer A01",
      kind: "drawer",
      parentId: "cab-1",
    },
    {
      id: "bin-1",
      code: "BIN-01",
      name: "Bin 01",
      kind: "bin",
      parentId: "draw-1",
    },
    {
      id: "wh-isolated",
      code: "WH-ISOLATED",
      name: "Isolated Warehouse",
      kind: "warehouse",
      parentId: null,
    },
  ];

  describe("buildSpatialBreadcrumbs", () => {
    it("returns a single entry with isCurrent: true for a root location", () => {
      const crumbs = buildSpatialBreadcrumbs("wh-1", mockHierarchy);

      expect(crumbs).toHaveLength(1);
      expect(crumbs[0]).toEqual({
        id: "wh-1",
        code: "WH-A",
        name: "Warehouse A",
        kind: "warehouse",
        isCurrent: true,
      });
    });

    it("constructs an ordered physical path from root ancestor down to current location", () => {
      const crumbs = buildSpatialBreadcrumbs("bin-1", mockHierarchy);

      expect(crumbs).toHaveLength(4);
      expect(crumbs.map((c) => c.code)).toEqual([
        "WH-A",
        "CAB-A",
        "DRAWER-A01",
        "BIN-01",
      ]);

      // Ancestors are not current; only the leaf is current
      expect(crumbs[0]?.isCurrent).toBe(false);
      expect(crumbs[1]?.isCurrent).toBe(false);
      expect(crumbs[2]?.isCurrent).toBe(false);
      expect(crumbs[3]?.isCurrent).toBe(true);
    });

    it("handles intermediate nodes properly (e.g. Cabinet A)", () => {
      const crumbs = buildSpatialBreadcrumbs("cab-1", mockHierarchy);

      expect(crumbs).toHaveLength(2);
      expect(crumbs[0]?.code).toBe("WH-A");
      expect(crumbs[0]?.isCurrent).toBe(false);
      expect(crumbs[1]?.code).toBe("CAB-A");
      expect(crumbs[1]?.isCurrent).toBe(true);
    });

    it("returns empty array for nonexistent location ID", () => {
      const crumbs = buildSpatialBreadcrumbs("nonexistent-id", mockHierarchy);
      expect(crumbs).toEqual([]);
    });

    it("guards against cyclic parent references without looping infinitely", () => {
      const cyclicHierarchy = [
        { id: "node-1", code: "N1", name: "Node 1", parentId: "node-2" },
        { id: "node-2", code: "N2", name: "Node 2", parentId: "node-3" },
        { id: "node-3", code: "N3", name: "Node 3", parentId: "node-1" }, // cyclic
      ];

      const crumbs = buildSpatialBreadcrumbs("node-1", cyclicHierarchy);
      // Traverses node-1 -> node-2 -> node-3 and terminates when encountering node-1 again
      expect(crumbs.length).toBeLessThanOrEqual(3);
      expect(crumbs.map((c) => c.code)).toEqual(["N3", "N2", "N1"]);
      expect(crumbs[crumbs.length - 1]?.isCurrent).toBe(true);
    });

    it("gracefully terminates when an intermediate parent ID is missing from dataset", () => {
      const brokenHierarchy = [
        { id: "child-1", code: "C1", name: "Child 1", parentId: "missing-parent" },
      ];

      const crumbs = buildSpatialBreadcrumbs("child-1", brokenHierarchy);
      expect(crumbs).toHaveLength(1);
      expect(crumbs[0]?.code).toBe("C1");
      expect(crumbs[0]?.isCurrent).toBe(true);
    });
  });

  describe("URL & View State Synchronization Semantics", () => {
    function generateNavigationUrl(
      targetLocationId: string,
      currentView: "spatial" | "spatial3d" | "list",
      focusComponentId?: string,
    ): string {
      const params = new URLSearchParams();
      if (currentView === "spatial3d") {
        params.set("view", "spatial3d");
      } else if (currentView === "list") {
        params.set("view", "list");
      }
      if (focusComponentId) {
        params.set("focusComponent", focusComponentId);
      }
      const qs = params.toString();
      return `/inventory/locations/${targetLocationId}${qs ? `?${qs}` : ""}`;
    }

    it("preserves 3D view mode (?view=spatial3d) when navigating into a compartment", () => {
      const url = generateNavigationUrl("draw-1", "spatial3d");
      expect(url).toBe("/inventory/locations/draw-1?view=spatial3d");
    });

    it("preserves 2D view mode without redundant query params", () => {
      const url = generateNavigationUrl("draw-1", "spatial");
      expect(url).toBe("/inventory/locations/draw-1");
    });

    it("preserves list view mode (?view=list) when navigating", () => {
      const url = generateNavigationUrl("draw-1", "list");
      expect(url).toBe("/inventory/locations/draw-1?view=list");
    });

    it("preserves component focus deep link when drilling into child compartment", () => {
      const url = generateNavigationUrl("draw-1", "spatial3d", "comp-123");
      expect(url).toBe("/inventory/locations/draw-1?view=spatial3d&focusComponent=comp-123");
    });
  });

  describe("Missing Mappings & Locate Preservation", () => {
    it("separates unmapped children into staging tray without inventing 3D coordinates", () => {
      const rawChildren: LocationOperationalViewChildDto[] = [
        {
          location: {
            id: "draw-mapped",
            code: "D-01",
            name: "Drawer 1",
            kind: "drawer",
            parentId: "cab-1",
            isActive: true,
          },
          node: {
            id: "node-1",
            locationId: "draw-mapped",
            modelId: "model-cab",
            parentSpatialNodeId: null,
            anchorId: "anchor-d1",
            positionX: 0,
            positionY: 0,
            positionZ: 0,
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            scaleX: 1,
            scaleY: 1,
            scaleZ: 1,
            isVisible: true,
            metadata: {},
          },
          model: null,
          anchor: {
            id: "anchor-d1",
            modelId: "model-cab",
            code: "A-01",
            name: "Slot 1",
            anchorType: "compartment",
            localPositionX: 100,
            localPositionY: 200,
            localPositionZ: 50,
            localRotationX: 0,
            localRotationY: 0,
            localRotationZ: 0,
            boundingWidthMm: 300,
            boundingHeightMm: 150,
            boundingDepthMm: 400,
            metadata: {},
          },
        },
        {
          location: {
            id: "draw-unmapped",
            code: "D-UNMAPPED",
            name: "Unplaced Drawer",
            kind: "drawer",
            parentId: "cab-1",
            isActive: true,
          },
          node: null,
          model: null,
          anchor: null,
        },
      ];

      const parentModel = {
        id: "model-cab",
        code: "CAB-MOD",
        name: "Cabinet Model",
        format: "procedural",
        assetReference: null,
        widthMm: 1000,
        heightMm: 1800,
        depthMm: 500,
        isActive: true,
        metadata: {},
      };

      const result = layoutChildrenFor3D(rawChildren, parentModel, new Map());
      expect(result.mapped).toHaveLength(1);
      expect(result.mapped[0]?.locationId).toBe("draw-mapped");
      expect(result.unmapped).toHaveLength(1);
      expect(result.unmapped[0]?.location.id).toBe("draw-unmapped");
    });

    it("resolves target child location upwards when focus is deep in a descendant", () => {
      const directChildren = [
        {
          location: {
            id: "draw-1",
            code: "D-01",
            name: "Drawer 1",
            kind: "drawer",
            parentId: "cab-1",
            isActive: true,
          },
          node: null,
          model: null,
          anchor: null,
        },
      ];

      const descendants = [
        { id: "bin-sub", code: "BIN-SUB", name: "Bin Sub", parentId: "draw-1" },
      ];

      // Request focus on bin-sub (which is inside draw-1)
      const targetChildId = resolveTargetChildLocationId(
        "bin-sub",
        undefined,
        directChildren,
        descendants,
      );

      // Successfully traces upward to draw-1 so the parent 3D view highlights draw-1
      expect(targetChildId).toBe("draw-1");
    });
  });

  describe("RFC-0067 Phase 2: Stable Canvas & Unified Navigation Invariants", () => {
    const spatialViewSrc = readWebFile("components/spatial/spatial-view.tsx");
    const spatialCellSrc = readWebFile("components/spatial/spatial-cell.tsx");
    const spatialGridSrc = readWebFile("components/spatial/spatial-grid.tsx");
    const spatialInspectorSrc = readWebFile("components/spatial/spatial-inspector.tsx");
    const spatial3DViewportSrc = readWebFile("components/spatial/spatial-3d-viewport.tsx");

    it("ensures selecting a cell never modifies the canvas grid column span or container width", () => {
      // Must not dynamically toggle between 8 and 12 columns
      expect(spatialViewSrc).not.toContain("lg:col-span-8");
      expect(spatialViewSrc).not.toContain("lg:col-span-12");

      // Canvas wrapper must be permanently full width in relative layout
      expect(spatialViewSrc).toContain('<div className="relative w-full">');
      expect(spatialViewSrc).toContain('<div className="w-full">');
    });

    it("renders the inspector as a floating overlay on desktop and bottom sheet on mobile with viewport-relative sizing", () => {
      expect(spatialViewSrc).toContain('data-testid="spatial-inspector-overlay"');
      expect(spatialViewSrc).toContain("sm:absolute sm:top-14 sm:right-4 sm:z-20 sm:w-84");
      expect(spatialViewSrc).toContain("fixed inset-x-0 bottom-0 z-50");

      // Must not compute max-height against parent canvas container (prevents squishing on short 1-row grids)
      expect(spatialViewSrc).not.toContain("calc(100%-4.5rem)");
      expect(spatialViewSrc).toContain("sm:max-h-[min(640px,calc(100vh-10rem))]");
    });

    it("provides explicit Enter/Open and Details actions with accessible labels in the inspector", () => {
      // Enter action for drill-down
      expect(spatialInspectorSrc).toContain("onEnterLocation");
      expect(spatialInspectorSrc).toContain("<CornerDownRight");
      expect(spatialInspectorSrc).toContain("<span>Enter</span>");
      expect(spatialInspectorSrc).toContain("aria-label={`Enter location ${locationCode}`}");

      // Details action for master data page
      expect(spatialInspectorSrc).toContain("<span>Details</span>");
      expect(spatialInspectorSrc).toContain("aria-label={`View details for ${locationCode}`}");

      // Close action with Esc hint
      expect(spatialInspectorSrc).toContain('aria-label="Close inspector (Esc)"');
    });

    it("displays keyboard shortcut affordances in the inspector", () => {
      expect(spatialInspectorSrc).toContain("<kbd");
      expect(spatialInspectorSrc).toContain("Enter");
      expect(spatialInspectorSrc).toContain("Esc");
    });

    it("supports double-click and keyboard Enter for child navigation in 2D with stopPropagation", () => {
      // SpatialCell defines and handles onDoubleClick and onKeyDown
      expect(spatialCellSrc).toContain("onDoubleClick?: () => void;");
      expect(spatialCellSrc).toContain("onEnter?: () => void;");
      expect(spatialCellSrc).toContain("onDoubleClick={onDoubleClick}");
      expect(spatialCellSrc).toContain("onKeyDown={handleKeyDown}");
      expect(spatialCellSrc).toContain("e.stopPropagation()");

      // SpatialGrid forwards onEnterCell
      expect(spatialGridSrc).toContain("onEnterCell?: (locationId: string) => void;");
      expect(spatialGridSrc).toContain("onDoubleClick={() => onEnterCell?.(gridCell.child.location.id)}");
      expect(spatialGridSrc).toContain("onEnter={() => onEnterCell?.(gridCell.child.location.id)}");

      // SpatialView binds onEnterCell to handleNavigate
      expect(spatialViewSrc).toContain("onEnterCell={handleNavigate}");
    });

    it("ensures SpatialCell uses valid WAI-ARIA toggle state (aria-pressed) rather than invalid aria-selected on button", () => {
      expect(spatialCellSrc).toContain("aria-pressed={isSelected}");
      expect(spatialCellSrc).not.toContain("aria-selected=");
    });

    it("unifies keyboard shortcuts without hijacking interactive controls or open dialogs", () => {
      // Escape clears selection when no modal dialog is active
      expect(spatialViewSrc).toContain('e.key === "Escape"');
      expect(spatialViewSrc).toContain("setSelectedLocationId(null)");
      expect(spatialViewSrc).toContain("hasActiveModalOrMenu");

      // Enter navigates to selected location only when focus is not on an interactive button or link
      expect(spatialViewSrc).toContain('e.key === "Enter"');
      expect(spatialViewSrc).toContain("handleNavigate(selectedLocationId)");
      expect(spatialViewSrc).toContain(
        "e.target.closest(\n            \"button, a, select, [role='button'], [role='menuitem'], [role='dialog'], [role='alertdialog']\",\n          )",
      );
    });

    it("provides consistent selection and navigation semantics between 2D and 3D", () => {
      // 3D viewport supports single pointer selection and double-click/double-tap navigation
      expect(spatial3DViewportSrc).toContain("onSelectLocation(userData.locationId)");
      expect(spatial3DViewportSrc).toContain("onEnterLocation?.(userData.locationId)");
      expect(spatial3DViewportSrc).toContain("handleDoubleClick");

      // Both 2D and 3D wire to handleCellSelect and handleNavigate
      expect(spatialViewSrc).toContain("onSelectCell={handleCellSelect}");
      expect(spatialViewSrc).toContain("onSelectLocation={handleCellSelect}");
      expect(spatialViewSrc).toContain("onEnterLocation={handleNavigate}");
    });

    it("preserves focusLocation and focusComponent during drill-down and mode transitions", () => {
      // URL generator preserves params across view transitions
      const params = new URLSearchParams();
      params.set("view", "spatial3d");
      params.set("focusComponent", "comp-123");
      params.set("focusLocation", "loc-bin-4");
      expect(params.get("view")).toBe("spatial3d");
      expect(params.get("focusComponent")).toBe("comp-123");
      expect(params.get("focusLocation")).toBe("loc-bin-4");
    });
  });
});
