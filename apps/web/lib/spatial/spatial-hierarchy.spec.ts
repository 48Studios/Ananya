import { describe, expect, it } from "vitest";
import {
  buildLocationTree,
  filterLocationTree,
  findNodeInTree,
  getAncestorIds,
  calculateHierarchyStats,
} from "./spatial-hierarchy";
import type { LocationDto } from "../api/locations-api";
import type { SpatialNodeDto } from "../api/spatial-api";

describe("Spatial Hierarchy & Mapping Status Utilities", () => {
  const mockLocations: LocationDto[] = [
    {
      id: "wh-1",
      code: "WH-A",
      name: "Warehouse A",
      kind: "warehouse",
      parentId: null,
      isActive: true,
      metadata: {},
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "cab-1",
      code: "CAB-A",
      name: "Cabinet A",
      kind: "cabinet",
      parentId: "wh-1",
      isActive: true,
      metadata: {},
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "draw-1",
      code: "DRAWER-A01",
      name: "Drawer A01",
      kind: "drawer",
      parentId: "cab-1",
      isActive: true,
      metadata: {},
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "draw-2",
      code: "DRAWER-A02",
      name: "Drawer A02",
      kind: "drawer",
      parentId: "cab-1",
      isActive: true,
      metadata: {},
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "bin-1",
      code: "BIN-01",
      name: "Bin 01",
      kind: "bin",
      parentId: "draw-1",
      isActive: true,
      metadata: {},
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "wh-2",
      code: "WH-B",
      name: "Warehouse B",
      kind: "warehouse",
      parentId: null,
      isActive: true,
      metadata: {},
      createdAt: "",
      updatedAt: "",
    },
  ];

  it("builds a recursive hierarchy matching parentId relationships", () => {
    const nodes: SpatialNodeDto[] = [];
    const tree = buildLocationTree(mockLocations, nodes);

    expect(tree).toHaveLength(2); // WH-A and WH-B
    expect(tree[0]?.code).toBe("WH-A");
    expect(tree[0]?.children).toHaveLength(1); // CAB-A
    expect(tree[0]?.children[0]?.code).toBe("CAB-A");
    expect(tree[0]?.children[0]?.children).toHaveLength(2); // DRAWER-A01 and DRAWER-A02
    expect(tree[0]?.children[0]?.children[0]?.children).toHaveLength(1); // BIN-01
  });

  it("reports a top-level facility with no SpatialNode as ROOT, never UNMAPPED", () => {
    const nodes: SpatialNodeDto[] = [];
    const tree = buildLocationTree(mockLocations, nodes);

    const whA = tree[0];
    expect(whA?.hasSpatialNode).toBe(false);
    expect(whA?.isMappingEligible).toBe(false);
    expect(whA?.status).toBe("ROOT");
  });

  it("reports a location with a parent and no SpatialNode as UNMAPPED", () => {
    const nodes: SpatialNodeDto[] = [];
    const tree = buildLocationTree(mockLocations, nodes);

    const bin = tree[0]?.children[0]?.children[0]?.children[0];
    expect(bin?.code).toBe("BIN-01");
    expect(bin?.hasSpatialNode).toBe(false);
    expect(bin?.isMappingEligible).toBe(true);
    expect(bin?.status).toBe("UNMAPPED");
  });

  it("marks a node with a SpatialNode and all mapped children as MAPPED", () => {
    const nodes: SpatialNodeDto[] = [
      {
        id: "node-draw-1",
        locationId: "draw-1",
        modelId: "mod-drawer",
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
        id: "node-bin-1",
        locationId: "bin-1",
        modelId: "mod-bin",
        parentSpatialNodeId: "node-draw-1",
        anchorId: "anc-b1",
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

    const tree = buildLocationTree(mockLocations, nodes);
    const draw1 = tree[0]?.children[0]?.children[0];

    expect(draw1?.code).toBe("DRAWER-A01");
    expect(draw1?.hasSpatialNode).toBe(true);
    expect(draw1?.mappedChildrenCount).toBe(1);
    expect(draw1?.totalChildrenCount).toBe(1);
    expect(draw1?.status).toBe("MAPPED");
  });

  it("marks a parent with a SpatialNode but unmapped children as PARTIAL", () => {
    const nodes: SpatialNodeDto[] = [
      {
        id: "node-cab-1",
        locationId: "cab-1",
        modelId: "mod-cab",
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
        id: "node-draw-1",
        locationId: "draw-1",
        modelId: "mod-drawer",
        parentSpatialNodeId: "node-cab-1",
        anchorId: "anc-d1",
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
      // draw-2 is NOT mapped
    ];

    const tree = buildLocationTree(mockLocations, nodes);
    const cabA = tree[0]?.children[0];

    expect(cabA?.code).toBe("CAB-A");
    expect(cabA?.hasSpatialNode).toBe(true);
    expect(cabA?.mappedChildrenCount).toBe(1);
    expect(cabA?.totalChildrenCount).toBe(2);
    expect(cabA?.status).toBe("PARTIAL");
  });

  it("distinguishes mapped ancestor from unmapped descendant (descendant is UNMAPPED)", () => {
    const nodes: SpatialNodeDto[] = [
      {
        id: "node-cab-1",
        locationId: "cab-1",
        modelId: "mod-cab",
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
      // DRAWER-A02 has no SpatialNode
    ];

    const tree = buildLocationTree(mockLocations, nodes);
    const draw2 = tree[0]?.children[0]?.children[1];

    expect(draw2?.code).toBe("DRAWER-A02");
    expect(draw2?.hasSpatialNode).toBe(false);
    expect(draw2?.status).toBe("UNMAPPED");
  });

  it("filters location tree and preserves ancestor chain for matching child", () => {
    const nodes: SpatialNodeDto[] = [];
    const tree = buildLocationTree(mockLocations, nodes);

    const filtered = filterLocationTree(tree, "DRAWER-A02");
    expect(filtered).toHaveLength(1); // WH-A preserved
    expect(filtered[0]?.code).toBe("WH-A");
    expect(filtered[0]?.children).toHaveLength(1); // CAB-A preserved
    expect(filtered[0]?.children[0]?.children).toHaveLength(1); // only DRAWER-A02 preserved
    expect(filtered[0]?.children[0]?.children[0]?.code).toBe("DRAWER-A02");
  });

  it("calculates accurate hierarchy stats", () => {
    const nodes: SpatialNodeDto[] = [
      {
        id: "node-cab-1",
        locationId: "cab-1",
        modelId: "mod-cab",
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
        id: "node-draw-1",
        locationId: "draw-1",
        modelId: "mod-drawer",
        parentSpatialNodeId: "node-cab-1",
        anchorId: "anc-d1",
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

    const stats = calculateHierarchyStats(mockLocations, nodes);
    expect(stats.totalLocations).toBe(6);
    expect(stats.mappedCount).toBe(2); // cab-1 and draw-1
    // Only locations that can be placed in a parent frame count as unmapped.
    expect(stats.unmappedCount).toBe(2); // draw-2 and bin-1
    expect(stats.rootCount).toBe(2); // wh-1 and wh-2 (no parent frame)
    expect(stats.partialCount).toBe(2); // cab-1 (draw-2 unmapped) and draw-1 (bin-1 unmapped)
  });

  it("reports a container's published layout without collapsing it into unmapped", () => {
    const layouts = [
      {
        id: "layout-1",
        parentLocationId: "cab-1",
        status: "PUBLISHED" as const,
      },
    ] as unknown as Parameters<typeof buildLocationTree>[2];

    const tree = buildLocationTree(mockLocations, [], layouts);
    const whA = tree[0];
    const cabA = whA?.children[0];

    expect(whA?.containerStatus).toBe("NONE");
    // The cabinet itself is not placed in a parent frame, but it configures a
    // published layout for its compartments.
    expect(cabA?.status).toBe("UNMAPPED");
    expect(cabA?.containerStatus).toBe("PUBLISHED");
  });

  it("prefers a published layout over a coexisting draft", () => {
    const layouts = [
      { id: "layout-draft", parentLocationId: "cab-1", status: "DRAFT" as const },
      {
        id: "layout-published",
        parentLocationId: "cab-1",
        status: "PUBLISHED" as const,
      },
    ] as unknown as Parameters<typeof buildLocationTree>[2];

    const tree = buildLocationTree(mockLocations, [], layouts);
    expect(tree[0]?.children[0]?.containerStatus).toBe("PUBLISHED");
  });

  it("finds ancestor IDs correctly", () => {
    const ancestors = getAncestorIds(mockLocations, "bin-1");
    expect(ancestors).toEqual(["draw-1", "cab-1", "wh-1"]);
  });

  it("finds node in tree correctly", () => {
    const nodes: SpatialNodeDto[] = [];
    const tree = buildLocationTree(mockLocations, nodes);
    const found = findNodeInTree(tree, "draw-1");
    expect(found?.code).toBe("DRAWER-A01");
  });
});
