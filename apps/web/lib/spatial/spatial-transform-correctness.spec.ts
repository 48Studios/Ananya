import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  mmToMeters,
  metersToMm,
  degToRad,
  radToDeg,
  resolveChildPosition,
  resolveChildRotation,
  type Vector3D,
} from "./spatial-3d-layout";
import {
  resolveAnchorScenePosition,
  scenePositionToAnchorLocal,
} from "./spatial-3d-scene";
import {
  computeAnchorPreviewLayout,
  type DraftAnchor,
} from "./spatial-anchor-authoring";
import type {
  LocationOperationalViewChildDto,
  SpatialAnchorDto,
} from "../api/spatial-api";

describe("Spatial Transform Correctness and Bijective Invariance", () => {
  const cabinetDimensions: Vector3D = {
    x: 0.6, // 600 mm
    y: 0.9, // 900 mm
    z: 0.4, // 400 mm
  };

  describe("1. Deterministic Unit & Angle Conversions", () => {
    it("converts between millimeters and meters reversibly", () => {
      const testValuesMm = [0, 1, 10, 100, 300, 600, 1250.5, -450];
      for (const mm of testValuesMm) {
        const meters = mmToMeters(mm);
        const backToMm = metersToMm(meters);
        expect(backToMm).toBeCloseTo(mm, 5);
      }
    });

    it("converts between degrees and radians reversibly", () => {
      const testAnglesDeg = [0, 15, 45, 90, 180, 270, 360, -90, -180];
      for (const deg of testAnglesDeg) {
        const rad = degToRad(deg);
        const backToDeg = radToDeg(rad);
        expect(backToDeg).toBeCloseTo(deg, 5);
      }
    });
  });

  describe("2. Bidirectional Anchor Position Invariance", () => {
    it("roundtrips corner-based coordinates between anchor mm and Three.js scene meters", () => {
      // Cabinet width: 600mm, height: 900mm, depth: 400mm
      const anchorDraft: DraftAnchor = {
        id: "anchor-1",
        modelId: "model-cab",
        code: "A01",
        name: "Anchor 1",
        anchorType: "DRAWER",
        localPositionX: 100, // Corner X: 100mm from left -> scene X: 100 - 300 = -200mm = -0.2m
        localPositionY: 675, // Corner Y: 675mm from bottom -> scene Y: 675mm = 0.675m
        localPositionZ: 200, // Corner Z: 200mm -> scene Z: 200 - 200 = 0mm = 0.0m
        localRotationX: 0,
        localRotationY: 0,
        localRotationZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 70,
        boundingDepthMm: 350,
        metadata: {},
      };

      const scenePos = resolveAnchorScenePosition(anchorDraft, cabinetDimensions);
      expect(scenePos.x).toBeCloseTo(-0.2, 5);
      expect(scenePos.y).toBeCloseTo(0.675, 5);
      expect(scenePos.z).toBeCloseTo(0.0, 5);

      const restoredMm = scenePositionToAnchorLocal(
        scenePos,
        cabinetDimensions,
        anchorDraft.metadata,
      );
      expect(restoredMm.x).toBe(100);
      expect(restoredMm.y).toBe(675);
      expect(restoredMm.z).toBe(200);
    });

    it("roundtrips centered coordinates (metadata origin: center)", () => {
      const anchorCentered: DraftAnchor = {
        id: "anchor-centered",
        modelId: "model-cab",
        code: "AC01",
        name: "Centered Anchor",
        anchorType: "SLOT",
        localPositionX: -50,
        localPositionY: 300,
        localPositionZ: 25,
        localRotationX: 0,
        localRotationY: 0,
        localRotationZ: 0,
        boundingWidthMm: 100,
        boundingHeightMm: 100,
        boundingDepthMm: 100,
        metadata: { origin: "center" },
      };

      const scenePos = resolveAnchorScenePosition(anchorCentered, cabinetDimensions);
      expect(scenePos.x).toBeCloseTo(-0.05, 5);
      expect(scenePos.y).toBeCloseTo(0.3, 5);
      expect(scenePos.z).toBeCloseTo(0.025, 5);

      const restoredMm = scenePositionToAnchorLocal(
        scenePos,
        cabinetDimensions,
        anchorCentered.metadata,
      );
      expect(restoredMm.x).toBe(-50);
      expect(restoredMm.y).toBe(300);
      expect(restoredMm.z).toBe(25);
    });
  });

  describe("3. Nested Carcass World Transform Composition", () => {
    it("composes parent cabinet transform with child drawer anchor transform deterministically", () => {
      // Parent cabinet positioned at world (1.0m, 0.0m, 2.0m) rotated 90 degrees around Y
      const parentGroup = new THREE.Group();
      parentGroup.position.set(1.0, 0.0, 2.0);
      parentGroup.rotation.set(0, Math.PI / 2, 0); // 90 deg around Y
      parentGroup.updateMatrixWorld(true);

      // Child anchor located locally at (-0.2m, 0.675m, 0.0m) relative to cabinet
      const childGroup = new THREE.Group();
      childGroup.position.set(-0.2, 0.675, 0.0);
      childGroup.rotation.set(0, 0, 0);

      parentGroup.add(childGroup);
      parentGroup.updateMatrixWorld(true);

      const worldPos = new THREE.Vector3();
      childGroup.getWorldPosition(worldPos);

      // Rotated 90 deg around Y:
      // Local X (-0.2) along parent X-axis turns into +Z direction: world Z = 2.0 - (-0.2) = 2.0?
      // Matrix: x' = x*cos(90) + z*sin(90) = 0 + 0 = 0. World X = 1.0 + 0 = 1.0.
      // z' = -x*sin(90) + z*cos(90) = -(-0.2)*1 = +0.2. World Z = 2.0 + 0.2 = 2.2.
      // y' = y. World Y = 0.675.
      expect(worldPos.x).toBeCloseTo(1.0, 4);
      expect(worldPos.y).toBeCloseTo(0.675, 4);
      expect(worldPos.z).toBeCloseTo(2.2, 4);
    });
  });

  describe("4. Preview vs Persisted Layout Invariance", () => {
    it("ensures preview transform matches persisted transform after save and reload", () => {
      const persistedAnchor: SpatialAnchorDto = {
        id: "anchor-p1",
        modelId: "model-cab",
        code: "DRAWER-A1",
        name: "Drawer Bay A1",
        anchorType: "DRAWER",
        localPositionX: 100,
        localPositionY: 675,
        localPositionZ: 200,
        localRotationX: 0,
        localRotationY: 0,
        localRotationZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 70,
        boundingDepthMm: 350,
        metadata: {},
      };

      const rawChild: LocationOperationalViewChildDto = {
        location: {
          id: "child-loc-1",
          code: "DRW-A1",
          name: "Drawer A1",
          kind: "drawer",
          parentId: "cabinet-1",
          isActive: true,
        },
        node: {
          id: "node-1",
          locationId: "child-loc-1",
          modelId: "model-drawer",
          parentSpatialNodeId: "cabinet-node-1",
          anchorId: "anchor-p1",
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
          createdAt: "2026-09-30T00:00:00Z",
          updatedAt: "2026-09-30T00:00:00Z",
        },
        model: {
          id: "model-drawer",
          code: "DRAWER-SMD",
          name: "SMD Drawer",
          format: "PROCEDURAL",
          widthMm: 180,
          heightMm: 70,
          depthMm: 350,
          isActive: true,
          metadata: {},
          createdAt: "2026-09-30T00:00:00Z",
          updatedAt: "2026-09-30T00:00:00Z",
        },
        anchor: persistedAnchor,
      };

      // 1. Resolve persisted position
      const persistedPos = resolveChildPosition(
        rawChild.node,
        rawChild.anchor,
        cabinetDimensions,
      );
      const persistedRot = resolveChildRotation(
        rawChild.node,
        rawChild.anchor,
      );

      // 2. Simulate authoring: user drafts new coordinates (moved X to 150mm)
      const draft: DraftAnchor = {
        id: "anchor-p1",
        modelId: "model-cab",
        code: "DRAWER-A1",
        name: "Drawer Bay A1",
        anchorType: "DRAWER",
        localPositionX: 150,
        localPositionY: 675,
        localPositionZ: 200,
        localRotationX: 0,
        localRotationY: 0,
        localRotationZ: 0,
        boundingWidthMm: 180,
        boundingHeightMm: 70,
        boundingDepthMm: 350,
        metadata: {},
        isModified: true,
      };

      // 3. Compute live authoring preview layout
      const previewLayouts = computeAnchorPreviewLayout(
        [
          {
            locationId: rawChild.location.id,
            locationCode: rawChild.location.code,
            locationName: rawChild.location.name,
            kind: rawChild.location.kind,
            isMapped: true,
            hasStock: false,
            totalQuantity: 0,
            position: persistedPos,
            rotation: persistedRot,
            dimensions: { x: 0.18, y: 0.07, z: 0.35 },
            anchorCode: persistedAnchor.code,
            modelCode: rawChild.model?.code,
            rawChild,
          },
        ],
        [draft],
        cabinetDimensions,
      );

      const previewPos = previewLayouts[0]!.position;

      // 4. Simulate saving to DB and reload
      const savedAnchorDto: SpatialAnchorDto = {
        ...persistedAnchor,
        localPositionX: 150,
      };
      const reloadedPos = resolveChildPosition(
        rawChild.node,
        savedAnchorDto,
        cabinetDimensions,
      );

      // Verify that live preview and reloaded persisted positions match EXACTLY
      expect(previewPos.x).toBeCloseTo(reloadedPos.x, 6);
      expect(previewPos.y).toBeCloseTo(reloadedPos.y, 6);
      expect(previewPos.z).toBeCloseTo(reloadedPos.z, 6);
    });
  });
});
