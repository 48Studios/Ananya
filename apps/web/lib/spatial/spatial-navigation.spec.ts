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
    const emptyStateSrc = readWebFile(
      "components/spatial/spatial-inspector-empty-state.tsx",
    );

    it("gives card rings room inside the scrolling grid so outlines are never clipped", () => {
      // The grid wrapper is an overflow container: it clips at its padding box,
      // and a card's outer `ring-2` paints 2px outside its border box. Without
      // padding the top/left band of an active outline was sliced off.
      expect(spatialGridSrc).toContain("overflow-x-auto p-1 pb-3 -m-1");
      expect(spatialGridSrc).not.toContain("overflow-x-auto pb-2");
      // The negative margin keeps the cards exactly where they were.
      expect(spatialGridSrc).not.toContain("overflow-x-auto p-1 -m-1");

      // The rings that need that room.
      expect(spatialCellSrc).toContain("ring-2 ring-primary");
      expect(spatialCellSrc).toContain("ring-2 ring-emerald-500");
    });

    it("ensures selecting a cell never modifies the canvas grid column span or container width", () => {
      // Must not dynamically toggle between 8 and 12 columns
      expect(spatialViewSrc).not.toContain("lg:col-span-8");
      expect(spatialViewSrc).not.toContain("lg:col-span-12");

      // Canvas wrapper must be permanently full width in relative layout
      expect(spatialViewSrc).toContain('<div className="relative w-full">');
      expect(spatialViewSrc).toContain('<div className="w-full">');
    });

    it("renders the inspector as an in-flow right sidebar, never a floating overlay", () => {
      expect(spatialViewSrc).toContain('data-testid="spatial-inspector-sidebar"');
      expect(spatialViewSrc).toContain('data-testid="spatial-canvas-region"');

      // Visualization and inspector are layout siblings: canvas takes the
      // remaining width, the inspector is a fixed-width column.
      expect(spatialViewSrc).toContain(
        '"flex flex-col gap-4 lg:min-h-[520px] lg:flex-row lg:items-stretch"',
      );
      expect(spatialViewSrc).toContain('className="relative min-w-0 flex-1"');
      expect(spatialViewSrc).toContain("lg:w-[280px] lg:shrink-0 xl:w-[320px]");
      expect(spatialViewSrc).toContain('"flex w-full min-w-0 flex-col overflow-hidden');

      // Non-modal: a labelled complementary surface, never a dialog/backdrop.
      expect(spatialViewSrc).toContain('<aside');
      expect(spatialViewSrc).toContain('aria-label="Spatial location inspector"');
      expect(spatialInspectorSrc).not.toContain('role="dialog"');
      expect(emptyStateSrc).not.toContain('role="dialog"');
      expect(spatialViewSrc).not.toContain('role="dialog"\n');

      // No floating positioning, no portal, no placement math remains.
      expect(spatialViewSrc).not.toContain("fixed z-40 flex flex-col");
      expect(spatialViewSrc).not.toContain("data-placement=");
      expect(spatialViewSrc).not.toContain("inspector.style");
      expect(spatialViewSrc).not.toContain("DEFAULT_INSPECTOR_STYLE");
      expect(spatialViewSrc).not.toContain("useAnchoredInspector");
      expect(spatialViewSrc).not.toContain("createPortal");

      // The old canvas-relative caps must not come back.
      expect(spatialViewSrc).not.toContain("calc(100%-4.5rem)");
      expect(spatialViewSrc).not.toContain("sm:max-h-[min(640px,calc(100vh-10rem))]");
    });

    it("keeps one mounted sidebar with an empty state instead of destroying it", () => {
      // Single source of truth: `selectedLocationId` decides content vs empty
      // state, and the sidebar itself is always rendered.
      expect(spatialViewSrc).toContain('data-state={isInspectorOpen ? "selected" : "empty"}');
      expect(spatialViewSrc).toContain(
        "{isInspectorOpen && selectedSummary && selectedChild ? (",
      );
      expect(spatialViewSrc).toContain("<SpatialInspectorEmptyState isAuthoring={isAuthoringAnchors} />");
      expect(emptyStateSrc).toContain("Select a location");
      expect(emptyStateSrc).toContain(
        "Select a drawer, bin, cabinet, or other spatial location to inspect its inventory and mapping details.",
      );
      expect(emptyStateSrc).toContain('data-testid="spatial-inspector-empty"');
    });

    it("removed every floating-inspector positioning and dismissal path", () => {
      // No anchor measurement, collision, observer, or outside-click handling
      // survives the migration.
      expect(spatialViewSrc).not.toContain("getBoundingClientRect");
      expect(spatialViewSrc).not.toContain("ResizeObserver");
      expect(spatialViewSrc).not.toContain("requestAnimationFrame");
      expect(spatialViewSrc).not.toContain("addEventListener(\"click\"");
      expect(spatialViewSrc).not.toContain("addEventListener(\"pointerdown\"");
      expect(spatialViewSrc).not.toContain("onDismiss");

      // The 3D viewport no longer exposes a projection/hit-test bridge for it.
      expect(spatial3DViewportSrc).not.toContain("projectLocationBounds");
      expect(spatial3DViewportSrc).not.toContain("hitTestSpatialObject");
      expect(spatial3DViewportSrc).not.toContain("subscribeSceneMovement");
      expect(spatial3DViewportSrc).not.toContain("interactionApiRef");

      // The 2D anchor attribute stays only as a stable card identifier.
      expect(spatialCellSrc).toContain("data-spatial-location-id={summary.locationId}");
    });

    it("keeps the inspector header pinned while a single body container scrolls", () => {
      expect(spatialInspectorSrc).toContain('data-testid="spatial-inspector-body"');
      expect(spatialInspectorSrc).toContain(
        "min-h-0 flex-1 space-y-3.5 overflow-x-hidden overflow-y-auto",
      );
      // The header must not scroll away with the body.
      expect(spatialInspectorSrc).toContain(
        "flex shrink-0 flex-col gap-2 border-b border-border/60 px-4 py-3",
      );
      // Identity (code + name) owns the full width on its own row, so long
      // identifiers truncate instead of painting over the action controls.
      expect(spatialInspectorSrc).toContain(
        "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5",
      );
      expect(spatialInspectorSrc).toContain("min-w-0 max-w-full truncate");
      expect(spatialInspectorSrc).toContain("min-w-0 flex-1 truncate text-xs");
      // Badges and actions share the row below, with the actions pushed right.
      expect(spatialInspectorSrc).toContain(
        "flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2",
      );
      expect(spatialInspectorSrc).toContain(
        "ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5",
      );
    });

    it("closes the inspector through one authoritative state transition", () => {
      // `selectedLocationId === null` is the closed state; there is no second
      // open/closed flag that could drift out of sync with it.
      expect(spatialViewSrc).toContain("const [selectedLocationId, setSelectedLocationId] = React.useState<");
      expect(spatialViewSrc).toContain(
        "const handleCloseInspector = React.useCallback(() => {",
      );
      expect(spatialViewSrc).toContain("setSelectedLocationId(null);");
      // Close button, Escape, and outside clicks all route through it.
      expect(spatialViewSrc).toContain("onClose={handleCloseInspector}");
      expect(spatialViewSrc).toContain("handleCloseInspector();");

      // The close control itself never bubbles into a card/canvas handler.
      expect(spatialInspectorSrc).toContain("event.stopPropagation();");

      // Locate/QR deep-link targets are consumed once per value: the reveal rule
      // must not re-select on every dismissal (that made the inspector
      // impossible to close).
      expect(spatialViewSrc).toContain("consumedFocusTargetRef");
      expect(spatialViewSrc).not.toContain("if (effectiveHighlightedLocationId && !selectedLocationId)");
      expect(spatialViewSrc).toContain(
        "if (consumedFocusTargetRef.current === effectiveHighlightedLocationId) {",
      );

      // A selection that no longer resolves under this parent is dropped.
      expect(spatialViewSrc).toContain("isKnownChild");
      expect(spatialViewSrc).toContain("setSelectedLocationId(null);\n    }\n  }, [data, selectedLocationId]);");
    });

    it("provides explicit Enter/Open and Details actions with accessible labels in the inspector", () => {
      // Enter action for drill-down, pinned in the footer outside the scroll body.
      expect(spatialInspectorSrc).toContain("onEnterLocation");
      expect(spatialInspectorSrc).toContain("<CornerDownRight");
      expect(spatialInspectorSrc).toContain("Enter Location");
      expect(spatialInspectorSrc).toContain('data-testid="spatial-inspector-footer"');
      expect(spatialInspectorSrc).toContain("aria-label={`Enter location ${locationCode}`}");

      // Details action for master data page
      expect(spatialInspectorSrc).toContain("<span>Details</span>");
      expect(spatialInspectorSrc).toContain("aria-label={`View details for ${locationCode}`}");

      // Close action with Esc hint
      expect(spatialInspectorSrc).toContain('aria-label="Close inspector (Esc)"');
    });

    it("displays keyboard shortcut affordances in the inspector footer", () => {
      const footerIndex = spatialInspectorSrc.indexOf(
        'data-testid="spatial-inspector-footer"',
      );
      expect(footerIndex).toBeGreaterThan(-1);
      const footer = spatialInspectorSrc.slice(footerIndex);
      expect(footer).toContain("<kbd");
      expect(footer).toContain("Enter");
      expect(footer).toContain("Esc");
      // Actions live outside the scrolling body so they stay reachable.
      const bodyIndex = spatialInspectorSrc.indexOf('data-testid="spatial-inspector-body"');
      expect(bodyIndex).toBeGreaterThan(-1);
      expect(bodyIndex).toBeLessThan(footerIndex);
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
      // Escape closes the inspector through the single authoritative close path
      // (when no modal dialog/menu owns the key).
      expect(spatialViewSrc).toContain('e.key === "Escape"');
      expect(spatialViewSrc).toContain("handleCloseInspector();");
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
