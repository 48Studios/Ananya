import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildLocationTree,
  filterLocationTree,
  getAncestorIds,
  calculateHierarchyStats,
} from "./spatial-hierarchy";
import type { LocationDto } from "../api/locations-api";
import type { SpatialNodeDto } from "../api/spatial-api";

const webRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
  "..",
);
const read = (relativePath: string) =>
  fs.readFileSync(path.join(webRoot, relativePath), "utf8");

describe("Phase 4.5: Centralized Spatial Inventory Workspace", () => {
  // --------------------------------------------------------------------------
  // 1. Navigation Configuration Tests
  // --------------------------------------------------------------------------
  describe("Navigation Configuration", () => {
    it("declares Spatial Inventory under Warehouses & Storage navigation group", () => {
      const navConfig = read("lib/navigation/navigation-config.tsx");
      expect(navConfig).toContain('id: "inv-spatial-inventory"');
      expect(navConfig).toContain('title: "Spatial Inventory"');
      expect(navConfig).toContain('href: "/inventory/locations/spatial"');
      expect(navConfig).toContain('id: "inv-spatial-models"');
      expect(navConfig).toContain('title: "Spatial Models & Anchors"');
      expect(navConfig).toContain('href: "/inventory/locations/spatial-models"');
      expect(navConfig).toContain('id: "inv-warehouses-group"');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Spatial Hierarchy & Status Logic
  // --------------------------------------------------------------------------
  describe("Spatial Hierarchy & Tree Traversal", () => {
    const mockLocations: LocationDto[] = [
      {
        id: "wh-main",
        code: "WH-MAIN",
        name: "Main Facility",
        kind: "warehouse",
        parentId: null,
        isActive: true,
        metadata: {},
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "cab-01",
        code: "CAB-01",
        name: "Cabinet 01",
        kind: "cabinet",
        parentId: "wh-main",
        isActive: true,
        metadata: {},
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "drw-01",
        code: "DRW-01",
        name: "Drawer 01",
        kind: "drawer",
        parentId: "cab-01",
        isActive: true,
        metadata: {},
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "drw-02",
        code: "DRW-02",
        name: "Drawer 02",
        kind: "drawer",
        parentId: "cab-01",
        isActive: true,
        metadata: {},
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "wh-secondary",
        code: "WH-SEC",
        name: "Secondary Facility",
        kind: "warehouse",
        parentId: null,
        isActive: true,
        metadata: {},
        createdAt: "",
        updatedAt: "",
      },
    ];

    it("evaluates Mapped, Partial, and Unmapped statuses accurately across hierarchy", () => {
      // CAB-01 is mapped. DRW-01 is mapped. DRW-02 is NOT mapped.
      const mockNodes: SpatialNodeDto[] = [
        {
          id: "node-cab-01",
          locationId: "cab-01",
          modelId: "model-cab",
          parentSpatialNodeId: null,
          anchorId: null,
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
        {
          id: "node-drw-01",
          locationId: "drw-01",
          modelId: "model-drw",
          parentSpatialNodeId: "node-cab-01",
          anchorId: "anc-01",
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
      ];

      const tree = buildLocationTree(mockLocations, mockNodes);

      // Top level: WH-MAIN has no SpatialNode -> UNMAPPED
      const whMain = tree.find((t) => t.id === "wh-main");
      expect(whMain?.status).toBe("UNMAPPED");
      expect(whMain?.hasSpatialNode).toBe(false);

      // CAB-01 has SpatialNode and 1 of 2 children mapped -> PARTIAL
      const cab01 = whMain?.children.find((c) => c.id === "cab-01");
      expect(cab01?.status).toBe("PARTIAL");
      expect(cab01?.hasSpatialNode).toBe(true);
      expect(cab01?.mappedChildrenCount).toBe(1);
      expect(cab01?.totalChildrenCount).toBe(2);

      // DRW-01 has SpatialNode and no sub-children -> MAPPED
      const drw01 = cab01?.children.find((c) => c.id === "drw-01");
      expect(drw01?.status).toBe("MAPPED");
      expect(drw01?.hasSpatialNode).toBe(true);

      // DRW-02 has NO SpatialNode -> UNMAPPED (even though parent CAB-01 is mapped)
      const drw02 = cab01?.children.find((c) => c.id === "drw-02");
      expect(drw02?.status).toBe("UNMAPPED");
      expect(drw02?.hasSpatialNode).toBe(false);

      // WH-SEC has no SpatialNode -> UNMAPPED
      const whSec = tree.find((t) => t.id === "wh-secondary");
      expect(whSec?.status).toBe("UNMAPPED");
    });

    it("preserves full ancestor expansion chain for selected sub-location", () => {
      const ancestors = getAncestorIds(mockLocations, "drw-02");
      expect(ancestors).toEqual(["cab-01", "wh-main"]);
    });

    it("filters hierarchy tree by location code or name while retaining parent hierarchy", () => {
      const tree = buildLocationTree(mockLocations, []);

      // Filtering for "DRW-02"
      const filtered = filterLocationTree(tree, "DRW-02");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.code).toBe("WH-MAIN");
      expect(filtered[0]?.children).toHaveLength(1);
      expect(filtered[0]?.children[0]?.code).toBe("CAB-01");
      expect(filtered[0]?.children[0]?.children).toHaveLength(1);
      expect(filtered[0]?.children[0]?.children[0]?.code).toBe("DRW-02");

      // Filtering for non-existent code returns empty
      const nonExistent = filterLocationTree(tree, "NON_EXISTENT_RACK");
      expect(nonExistent).toHaveLength(0);
    });

    it("correctly computes hierarchy statistics", () => {
      const mockNodes: SpatialNodeDto[] = [
        {
          id: "node-cab-01",
          locationId: "cab-01",
          modelId: "model-cab",
          parentSpatialNodeId: null,
          anchorId: null,
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
      ];

      const stats = calculateHierarchyStats(mockLocations, mockNodes);
      expect(stats.totalLocations).toBe(5);
      expect(stats.mappedCount).toBe(1);
      expect(stats.unmappedCount).toBe(4);
      expect(stats.partialCount).toBe(1); // cab-01 has 2 children, both unmapped
    });
  });

  // --------------------------------------------------------------------------
  // 3. Deep-Link & URL Generation Contract
  // --------------------------------------------------------------------------
  describe("Deep-Link & URL Contract", () => {
    it("constructs standard location detail URL", () => {
      const locationId = "loc-shelf-99";
      const targetUrl = `/inventory/locations/${locationId}`;
      expect(targetUrl).toBe("/inventory/locations/loc-shelf-99");
    });

    it("constructs spatial 2D view deep link with focusLocation parameter", () => {
      const rootId = "loc-cabinet-01";
      const focusId = "loc-drawer-a02";
      const deepLink = `/inventory/locations/${rootId}?view=spatial&focusLocation=${focusId}`;
      expect(deepLink).toBe(
        "/inventory/locations/loc-cabinet-01?view=spatial&focusLocation=loc-drawer-a02",
      );
    });

    it("constructs workspace query parameter for shareable URL", () => {
      const selectedId = "loc-cab-01";
      const workspaceUrl = `/inventory/locations/spatial?location=${selectedId}`;
      expect(workspaceUrl).toBe("/inventory/locations/spatial?location=loc-cab-01");
    });
  });
});
