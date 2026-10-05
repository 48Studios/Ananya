import { describe, it, expect } from "vitest";
import type {
  SpatialAnchorDto,
  SpatialModelDto,
  LocationOperationalViewChildDto,
} from "@/lib/api/spatial-api";
import {
  fromSpatialAnchor,
  createDefaultDraftAnchor,
  validateAnchor,
  validateAnchorBounds,
  computeAnchorPreviewLayout,
  getAnchorDiff,
  buildBulkSavePayload,
  formatSaveAnchorError,
  type DraftAnchor,
} from "./spatial-anchor-authoring";
import type { SceneChildLayout } from "./spatial-3d-layout";

describe("Spatial Anchor Authoring Logic", () => {
  const mockAnchor: SpatialAnchorDto = {
    id: "anc-1",
    modelId: "model-1",
    code: "A01",
    name: "Drawer A01",
    anchorType: "DRAWER",
    localPositionX: 100,
    localPositionY: 675,
    localPositionZ: 0,
    localRotationX: 0,
    localRotationY: 0,
    localRotationZ: 0,
    boundingWidthMm: 180,
    boundingHeightMm: 400,
    boundingDepthMm: 380,
    metadata: { tag: "demo" },
  };

  const mockModel: SpatialModelDto = {
    id: "model-1",
    code: "CAB-6D",
    name: "6 Drawer Cabinet",
    format: "PROCEDURAL",
    assetReference: null,
    widthMm: 600,
    heightMm: 900,
    depthMm: 400,
    isActive: true,
    metadata: {},
  };

  it("converts SpatialAnchorDto to DraftAnchor correctly", () => {
    const draft = fromSpatialAnchor(mockAnchor);
    expect(draft.id).toBe("anc-1");
    expect(draft.code).toBe("A01");
    expect(draft.localPositionX).toBe(100);
    expect(draft.localPositionY).toBe(675);
    expect(draft.boundingWidthMm).toBe(180);
    expect(draft.isNew).toBe(false);
    expect(draft.isModified).toBe(false);
  });

  it("generates default new draft anchor with unique sequential code within bounds", () => {
    const existing = [fromSpatialAnchor(mockAnchor)];
    const draft = createDefaultDraftAnchor("model-1", existing, mockModel);

    expect(draft.isNew).toBe(true);
    expect(draft.code).toBe("A02");
    expect(draft.localPositionX).toBe(300); // 600 / 2
    expect(draft.localPositionY).toBe(450); // 900 / 2
    expect(draft.boundingWidthMm).toBeGreaterThan(0);
    expect(draft.boundingHeightMm).toBeGreaterThan(0);
  });

  it("validates draft anchor fields and detects duplicates", () => {
    const draft1 = fromSpatialAnchor(mockAnchor);
    const validRes = validateAnchor(draft1, [draft1]);
    expect(validRes.isValid).toBe(true);
    expect(validRes.errors).toHaveLength(0);

    // Empty code
    const invalidDraft1 = { ...draft1, code: "   " };
    expect(validateAnchor(invalidDraft1, [draft1]).isValid).toBe(false);

    // Duplicate code
    const draft2: DraftAnchor = {
      ...draft1,
      id: "anc-2",
      code: "a01", // case-insensitive clash
    };
    const dupRes = validateAnchor(draft2, [draft1, draft2]);
    expect(dupRes.isValid).toBe(false);
    expect(dupRes.errors[0]).toContain("already in use");

    // Negative bounding dimensions
    const invalidDims = { ...draft1, boundingWidthMm: -10 };
    expect(validateAnchor(invalidDims, [draft1]).isValid).toBe(false);
  });

  it("evaluates anchor envelope against parent model carcass", () => {
    const validDraft = fromSpatialAnchor(mockAnchor);
    const boundsRes = validateAnchorBounds(validDraft, mockModel);
    expect(boundsRes.withinBounds).toBe(true);

    // Exceeds model height (900mm)
    const outOfHeightDraft: DraftAnchor = {
      ...validDraft,
      localPositionY: 850,
      boundingHeightMm: 300, // 850 + 150 = 1000 > 900
    };
    const heightRes = validateAnchorBounds(outOfHeightDraft, mockModel);
    expect(heightRes.withinBounds).toBe(false);
    expect(heightRes.warning).toContain("outside model height");

    // Exceeds model width (600mm)
    const outOfWidthDraft: DraftAnchor = {
      ...validDraft,
      localPositionX: 650,
      boundingWidthMm: 200,
    };
    const widthRes = validateAnchorBounds(outOfWidthDraft, mockModel);
    expect(widthRes.withinBounds).toBe(false);
    expect(widthRes.warning).toContain("outside model width");
  });

  it("computes live preview child transforms when anchor moves", () => {
    const mockChild: LocationOperationalViewChildDto = {
      location: {
        id: "loc-drw-1",
        code: "DRAWER-01",
        name: "Drawer 01",
        kind: "drawer",
        parentId: "loc-parent",
        isActive: true,
      },
      node: {
        id: "node-drw-1",
        locationId: "loc-drw-1",
        modelId: null,
        parentSpatialNodeId: "node-parent",
        anchorId: "anc-1",
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
      anchor: mockAnchor,
    };

    const initialLayout: SceneChildLayout[] = [
      {
        locationId: mockChild.location.id,
        locationCode: mockChild.location.code,
        locationName: mockChild.location.name,
        kind: mockChild.location.kind,
        isMapped: true,
        hasStock: false,
        totalQuantity: 0,
        position: { x: 0.1, y: 0.675, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        dimensions: { x: 0.18, y: 0.4, z: 0.38 },
        anchorCode: "A01",
        rawChild: mockChild,
      },
    ];

    // Move anchor by +100mm Y in draft
    const movedDraft: DraftAnchor = {
      ...fromSpatialAnchor(mockAnchor),
      localPositionY: 775,
    };

    const preview = computeAnchorPreviewLayout(
      initialLayout,
      [movedDraft],
      { x: 0.6, y: 0.9, z: 0.4 },
    );

    expect(preview[0]?.position.y).toBeCloseTo(0.775, 4);
    expect(preview[0]?.rawChild.anchor?.localPositionY).toBe(775);
  });

  it("accurately detects additions, updates, and deletions in diff", () => {
    const initial = [mockAnchor];

    // No changes
    const diffNoChange = getAnchorDiff(initial, [fromSpatialAnchor(mockAnchor)]);
    expect(diffNoChange.hasChanges).toBe(false);
    expect(diffNoChange.added).toHaveLength(0);
    expect(diffNoChange.updated).toHaveLength(0);
    expect(diffNoChange.deletedIds).toHaveLength(0);

    // Modified position
    const modifiedDraft = {
      ...fromSpatialAnchor(mockAnchor),
      localPositionY: 700,
    };
    const diffMod = getAnchorDiff(initial, [modifiedDraft]);
    expect(diffMod.hasChanges).toBe(true);
    expect(diffMod.updated).toHaveLength(1);
    expect(diffMod.updated[0]?.localPositionY).toBe(700);

    // Added new anchor
    const newDraft: DraftAnchor = {
      id: "draft-new-1",
      modelId: "model-1",
      code: "A02",
      name: "Drawer A02",
      anchorType: "DRAWER",
      localPositionX: 300,
      localPositionY: 675,
      localPositionZ: 0,
      localRotationX: 0,
      localRotationY: 0,
      localRotationZ: 0,
      boundingWidthMm: 180,
      boundingHeightMm: 400,
      boundingDepthMm: 380,
      metadata: {},
      isNew: true,
      isModified: true,
    };
    const diffAdd = getAnchorDiff(initial, [
      fromSpatialAnchor(mockAnchor),
      newDraft,
    ]);
    expect(diffAdd.hasChanges).toBe(true);
    expect(diffAdd.added).toHaveLength(1);
    expect(diffAdd.added[0]?.code).toBe("A02");

    // Deleted anchor
    const diffDel = getAnchorDiff(initial, []);
    expect(diffDel.hasChanges).toBe(true);
    expect(diffDel.deletedIds).toEqual(["anc-1"]);
  });

  it("converts diff to atomic BulkSaveSpatialAnchorsPayload", () => {
    const initial = [mockAnchor];
    const modifiedDraft = {
      ...fromSpatialAnchor(mockAnchor),
      name: "Renamed Drawer",
    };
    const newDraft: DraftAnchor = {
      id: "draft-new",
      modelId: "model-1",
      code: "B01",
      name: "Bin 1",
      anchorType: "BIN",
      localPositionX: 10,
      localPositionY: 20,
      localPositionZ: 0,
      localRotationX: 0,
      localRotationY: 0,
      localRotationZ: 0,
      boundingWidthMm: 80,
      boundingHeightMm: 60,
      boundingDepthMm: 120,
      metadata: {},
      isNew: true,
    };

    const diff = getAnchorDiff(initial, [modifiedDraft, newDraft]);
    const payload = buildBulkSavePayload(diff, "2026-10-01T12:00:00Z");

    expect(payload.expectedModelUpdatedAt).toBe("2026-10-01T12:00:00Z");
    expect(payload.creates).toHaveLength(1);
    expect(payload.creates?.[0]?.code).toBe("B01");
    expect(payload.updates).toHaveLength(1);
    expect(payload.updates?.[0]?.name).toBe("Renamed Drawer");
    expect(payload.deleteIds).toHaveLength(0);
  });

  it("formats concurrency conflicts and network errors clearly", () => {
    const conflictError = new Error("Request failed with status code 409");
    const conflictMsg = formatSaveAnchorError(conflictError);
    expect(conflictMsg).toContain("Conflict");
    expect(conflictMsg).toContain("preserved");

    const genericError = new Error("Network timeout");
    const genericMsg = formatSaveAnchorError(genericError);
    expect(genericMsg).toBe("Network timeout");

    const unknownError = "string error";
    const fallbackMsg = formatSaveAnchorError(unknownError);
    expect(fallbackMsg).toContain("preserved");
  });
});
