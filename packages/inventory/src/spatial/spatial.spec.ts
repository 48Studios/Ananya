import { describe, it, expect } from "vitest";
import {
  SpatialModel,
  SpatialAnchor,
  SpatialNode,
  InvalidSpatialModelCodeError,
  InvalidSpatialModelNameError,
  InvalidSpatialDimensionsError,
  InvalidSpatialAnchorCodeError,
  InvalidSpatialAnchorNameError,
  SpatialNodeCannotParentToSelfError,
} from "./index";

describe("Spatial Inventory Domain Foundation", () => {
  describe("SpatialModel Aggregate", () => {
    it("creates a valid SpatialModel with normalized code and defaults", () => {
      const model = SpatialModel.create({
        code: "  smd-cabinet-60d  ",
        name: "  60-Drawer SMD Organizer Cabinet  ",
        description: "Standard ESD plastic component organizer",
        format: "glb",
        widthMm: 310,
        heightMm: 550,
        depthMm: 160,
      });

      expect(model.id).toBeDefined();
      expect(model.code).toBe("SMD-CABINET-60D");
      expect(model.name).toBe("60-Drawer SMD Organizer Cabinet");
      expect(model.format).toBe("GLB");
      expect(model.widthMm).toBe(310);
      expect(model.heightMm).toBe(550);
      expect(model.depthMm).toBe(160);
      expect(model.isActive).toBe(true);
      expect(model.createdAt).toBeInstanceOf(Date);
      expect(model.updatedAt).toBeInstanceOf(Date);
    });

    it("rejects empty code", () => {
      expect(() =>
        SpatialModel.create({
          code: "   ",
          name: "Test Model",
          widthMm: 100,
          heightMm: 100,
          depthMm: 100,
        }),
      ).toThrow(InvalidSpatialModelCodeError);
    });

    it("rejects empty name", () => {
      expect(() =>
        SpatialModel.create({
          code: "TEST-01",
          name: "   ",
          widthMm: 100,
          heightMm: 100,
          depthMm: 100,
        }),
      ).toThrow(InvalidSpatialModelNameError);
    });

    it("rejects non-positive dimensions", () => {
      expect(() =>
        SpatialModel.create({
          code: "TEST-01",
          name: "Test Model",
          widthMm: -10,
          heightMm: 100,
          depthMm: 100,
        }),
      ).toThrow(InvalidSpatialDimensionsError);

      expect(() =>
        SpatialModel.create({
          code: "TEST-01",
          name: "Test Model",
          widthMm: 100,
          heightMm: 0,
          depthMm: 100,
        }),
      ).toThrow(InvalidSpatialDimensionsError);

      expect(() =>
        SpatialModel.create({
          code: "TEST-01",
          name: "Test Model",
          widthMm: 100,
          heightMm: 100,
          depthMm: Number.NaN,
        }),
      ).toThrow(InvalidSpatialDimensionsError);
    });

    it("updates properties and re-validates invariants", () => {
      const model = SpatialModel.create({
        code: "RACK-01",
        name: "Standard Pallet Rack",
        widthMm: 2000,
        heightMm: 3000,
        depthMm: 1000,
      });

      const updated = model.update({
        name: "Updated Pallet Rack",
        widthMm: 2200,
        isActive: false,
      });

      expect(updated.name).toBe("Updated Pallet Rack");
      expect(updated.widthMm).toBe(2200);
      expect(updated.isActive).toBe(false);
      expect(updated.code).toBe("RACK-01");
      expect(updated.id).toBe(model.id);
    });
  });

  describe("SpatialAnchor Aggregate", () => {
    it("creates a valid SpatialAnchor belonging to a model", () => {
      const modelId = "model-uuid-123";
      const anchor = SpatialAnchor.create({
        modelId,
        code: "  drawer-a1 ",
        name: "Drawer Row A Column 1",
        anchorType: "drawer",
        localPositionX: 50,
        localPositionY: 120,
        localPositionZ: 0,
        boundingWidthMm: 50,
        boundingHeightMm: 35,
        boundingDepthMm: 140,
      });

      expect(anchor.id).toBeDefined();
      expect(anchor.modelId).toBe(modelId);
      expect(anchor.code).toBe("DRAWER-A1");
      expect(anchor.name).toBe("Drawer Row A Column 1");
      expect(anchor.anchorType).toBe("DRAWER");
      expect(anchor.localPositionX).toBe(50);
      expect(anchor.localPositionY).toBe(120);
      expect(anchor.localPositionZ).toBe(0);
      expect(anchor.boundingWidthMm).toBe(50);
    });

    it("rejects empty anchor code or name", () => {
      expect(() =>
        SpatialAnchor.create({
          modelId: "model-1",
          code: "  ",
          name: "Anchor 1",
        }),
      ).toThrow(InvalidSpatialAnchorCodeError);

      expect(() =>
        SpatialAnchor.create({
          modelId: "model-1",
          code: "A-01",
          name: "  ",
        }),
      ).toThrow(InvalidSpatialAnchorNameError);
    });
  });

  describe("SpatialNode Aggregate & Referential Integrity", () => {
    it("creates a SpatialNode mapped to a Location with defaults (in millimeters)", () => {
      const locationId = "loc-cabinet-uuid";
      const modelId = "model-cabinet-uuid";

      const node = SpatialNode.create({
        locationId,
        modelId,
        positionX: 5500,
        positionY: 0,
        positionZ: 2100,
      });

      expect(node.id).toBeDefined();
      expect(node.locationId).toBe(locationId);
      expect(node.modelId).toBe(modelId);
      expect(node.parentSpatialNodeId).toBeNull();
      expect(node.anchorId).toBeNull();
      expect(node.positionX).toBe(5500);
      expect(node.positionY).toBe(0);
      expect(node.positionZ).toBe(2100);
      expect(node.scaleX).toBe(1.0);
      expect(node.scaleY).toBe(1.0);
      expect(node.scaleZ).toBe(1.0);
      expect(node.isVisible).toBe(true);
    });

    it("supports hierarchical parent-child node relationships and anchor binding", () => {
      const rootNode = SpatialNode.create({
        locationId: "loc-cabinet",
        modelId: "model-cabinet",
        positionX: 10000,
      });

      const childNode = SpatialNode.create({
        locationId: "loc-drawer-a1",
        parentSpatialNodeId: rootNode.id,
        anchorId: "anchor-drawer-a1",
        positionX: 50,
        positionY: 200,
      });

      expect(childNode.parentSpatialNodeId).toBe(rootNode.id);
      expect(childNode.anchorId).toBe("anchor-drawer-a1");
      expect(childNode.locationId).toBe("loc-drawer-a1");
    });

    it("prevents self-parenting on node update", () => {
      const node = SpatialNode.create({
        locationId: "loc-bench-1",
      });

      expect(() => {
        node.update({
          parentSpatialNodeId: node.id,
        });
      }).toThrow(SpatialNodeCannotParentToSelfError);
    });

    it("requires a locationId", () => {
      expect(() => {
        SpatialNode.create({
          locationId: "",
        });
      }).toThrow();
    });
  });

  describe("Spatial Isolation & Invariants", () => {
    it("ensures SpatialNode contains zero stock quantity, balance, or reservation state", () => {
      const node = SpatialNode.create({
        locationId: "loc-shelf-3",
        positionX: 1.0,
      });

      // Assert that spatial node does not contain inventory properties
      const nodeAny = node as unknown as Record<string, unknown>;
      expect(nodeAny["quantity"]).toBeUndefined();
      expect(nodeAny["balance"]).toBeUndefined();
      expect(nodeAny["componentId"]).toBeUndefined();
      expect(nodeAny["reservedQuantity"]).toBeUndefined();
      expect(nodeAny["onHand"]).toBeUndefined();
    });

    it("ensures SpatialModel contains zero component or location binding", () => {
      const model = SpatialModel.create({
        code: "BOX-A",
        name: "Storage Box A",
        widthMm: 200,
        heightMm: 150,
        depthMm: 300,
      });

      const modelAny = model as unknown as Record<string, unknown>;
      expect(modelAny["locationId"]).toBeUndefined();
      expect(modelAny["componentId"]).toBeUndefined();
      expect(modelAny["stock"]).toBeUndefined();
    });
  });
});
