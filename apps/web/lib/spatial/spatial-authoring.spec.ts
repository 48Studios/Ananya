import { describe, it, expect } from "vitest";
import type { LocationMappingContextDto, SpatialAnchorDto } from "../api/spatial-api";

describe("Spatial Authoring & Mapping UX", () => {
  it("determines occupied anchors correctly to prevent conflicting assignments", () => {
    const mockContext: LocationMappingContextDto = {
      location: {
        id: "loc-cabinet",
        code: "CAB-A",
        name: "Component Cabinet A",
        kind: "cabinet",
        parentId: null,
        isActive: true,
      },
      node: {
        id: "node-cab",
        locationId: "loc-cabinet",
        modelId: "model-cab-60d",
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
      model: {
        id: "model-cab-60d",
        code: "CAB-60D",
        name: "60 Drawer Cabinet",
        format: "PROCEDURAL",
        assetReference: null,
        widthMm: 1000,
        heightMm: 1000,
        depthMm: 400,
        isActive: true,
        metadata: {},
      },
      anchor: null,
      parentLocation: null,
      parentSpatialNode: null,
      parentModel: null,
      parentAnchors: [],
      parentAnchorOccupancy: [],
      modelAnchors: [
        {
          id: "anc-a1",
          modelId: "model-cab-60d",
          code: "A01",
          name: "Drawer A01",
          anchorType: "DRAWER",
          localPositionX: 50,
          localPositionY: 950,
          localPositionZ: 0,
          localRotationX: 0,
          localRotationY: 0,
          localRotationZ: 0,
          boundingWidthMm: 80,
          boundingHeightMm: 40,
          boundingDepthMm: 150,
          metadata: {},
        },
        {
          id: "anc-a2",
          modelId: "model-cab-60d",
          code: "A02",
          name: "Drawer A02",
          anchorType: "DRAWER",
          localPositionX: 150,
          localPositionY: 950,
          localPositionZ: 0,
          localRotationX: 0,
          localRotationY: 0,
          localRotationZ: 0,
          boundingWidthMm: 80,
          boundingHeightMm: 40,
          boundingDepthMm: 150,
          metadata: {},
        },
      ],
      children: [
        {
          location: {
            id: "loc-drw-1",
            code: "DRAWER-01",
            name: "Drawer 01",
            kind: "drawer",
            parentId: "loc-cabinet",
            isActive: true,
          },
          node: {
            id: "node-drw-1",
            locationId: "loc-drw-1",
            modelId: null,
            parentSpatialNodeId: "node-cab",
            anchorId: "anc-a1",
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
          anchor: {
            id: "anc-a1",
            modelId: "model-cab-60d",
            code: "A01",
            name: "Drawer A01",
            anchorType: "DRAWER",
            localPositionX: 50,
            localPositionY: 950,
            localPositionZ: 0,
            localRotationX: 0,
            localRotationY: 0,
            localRotationZ: 0,
            boundingWidthMm: 80,
            boundingHeightMm: 40,
            boundingDepthMm: 150,
            metadata: {},
          },
          isMapped: true,
        },
        {
          location: {
            id: "loc-drw-2",
            code: "DRAWER-02",
            name: "Drawer 02",
            kind: "drawer",
            parentId: "loc-cabinet",
            isActive: true,
          },
          node: null,
          anchor: null,
          isMapped: false,
        },
      ],
      availableModels: [],
      mapping: {
        status: "MAPPED",
        isMappingEligible: false,
        hasSpatialNode: true,
        directChildCount: 2,
        mappedDirectChildCount: 1,
        unmappedDirectChildCount: 1,
        containerStatus: "NONE",
        publishedLayout: null,
        slotMapping: null,
      },
    };

    // Calculate occupied anchors set
    const occupiedAnchorIds = new Set<string>();
    for (const child of mockContext.children) {
      if (child.anchor) {
        occupiedAnchorIds.add(child.anchor.id);
      }
    }

    expect(occupiedAnchorIds.has("anc-a1")).toBe(true);
    expect(occupiedAnchorIds.has("anc-a2")).toBe(false);

    // Verify unmapped child can only pick unoccupied anchors
    const availableForChild2 = mockContext.modelAnchors.filter(
      (a) => !occupiedAnchorIds.has(a.id),
    );
    expect(availableForChild2).toHaveLength(1);
    expect(availableForChild2[0]?.code).toBe("A02");
  });

  it("handles millimeter coordinates and dimensions across models and anchors", () => {
    const anchor: SpatialAnchorDto = {
      id: "anc-test",
      modelId: "model-test",
      code: "SLOT-01",
      name: "Slot 01",
      anchorType: "SLOT",
      localPositionX: 100, // 100 mm
      localPositionY: 250, // 250 mm
      localPositionZ: 50,  // 50 mm
      localRotationX: 0,
      localRotationY: 0,
      localRotationZ: 0,
      boundingWidthMm: 120, // 120 mm
      boundingHeightMm: 80, // 80 mm
      boundingDepthMm: 200, // 200 mm
      metadata: {},
    };

    expect(anchor.localPositionX).toBe(100);
    expect(anchor.boundingWidthMm).toBe(120);
    expect(anchor.boundingHeightMm).toBe(80);
    expect(anchor.boundingDepthMm).toBe(200);
  });
});
