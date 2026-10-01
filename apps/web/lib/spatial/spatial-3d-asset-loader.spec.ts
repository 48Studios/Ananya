import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  clearAssetCache,
  loadAndNormalizeCustomAsset,
} from "./spatial-3d-asset-loader";

// Mock GLTFLoader to return deterministic Three.js scenes without needing network/WebGL
const mockLoad = vi.fn();

vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => {
  return {
    GLTFLoader: class {
      load(
        url: string,
        onLoad: (gltf: { scene: THREE.Group }) => void,
        _onProgress?: unknown,
        onError?: (err: unknown) => void,
      ) {
        mockLoad(url, onLoad, onError);
      }
    },
  };
});

describe("spatial-3d-asset-loader", () => {
  beforeEach(() => {
    clearAssetCache();
    mockLoad.mockReset();
  });

  afterEach(() => {
    clearAssetCache();
  });

  describe("Security Pre-validation", () => {
    it("rejects malicious or invalid URLs without invoking GLTFLoader", async () => {
      await expect(
        loadAndNormalizeCustomAsset("file:///etc/passwd.glb", {
          x: 1,
          y: 1,
          z: 1,
        }),
      ).rejects.toThrow("Security rejection for asset URL");

      await expect(
        loadAndNormalizeCustomAsset("/models/../escape.glb", {
          x: 1,
          y: 1,
          z: 1,
        }),
      ).rejects.toThrow("Security rejection for asset URL");

      await expect(
        loadAndNormalizeCustomAsset("https://cdn.example.com/model.fbx", {
          x: 1,
          y: 1,
          z: 1,
        }),
      ).rejects.toThrow("Security rejection for asset URL");

      expect(mockLoad).not.toHaveBeenCalled();
    });
  });

  describe("Dimension Normalization & Grounding", () => {
    it("normalizes bounding box to match target millimeter dimensions and grounds bottom at y=0", async () => {
      // Mock asset: Box of size 2m x 1m x 4m centered at (0, 0.5, 0)
      // min = (-1, 0, -2), max = (1, 1, 2)
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        const geometry = new THREE.BoxGeometry(2, 1, 4);
        geometry.translate(0, 0.5, 0); // min.y = 0, max.y = 1
        const mesh = new THREE.Mesh(geometry);
        group.add(mesh);
        onLoad({ scene: group });
      });

      // Target: 1.0m width, 2.0m height, 2.0m depth
      const targetDim = { x: 1.0, y: 2.0, z: 2.0 };
      const result = await loadAndNormalizeCustomAsset(
        "https://cdn.internal.test/models/shelf.glb",
        targetDim,
        {
          locationId: "loc-cabinet-1",
          locationCode: "CAB-01",
          isParent: true,
        },
      );

      expect(result.rawDimensionsMeters).toEqual({ x: 2, y: 1, z: 4 });
      expect(result.targetDimensionsMeters).toEqual(targetDim);
      expect(result.appliedScale.x).toBeCloseTo(0.5);
      expect(result.appliedScale.y).toBeCloseTo(2.0);
      expect(result.appliedScale.z).toBeCloseTo(0.5);

      // Discrepancy = 2.0 / 0.5 = 4.0 (> 2.5 threshold)
      expect(result.isDistorted).toBe(true);
      expect(result.aspectRatioDiscrepancy).toBeCloseTo(4.0);

      // Verify world bounding box of the normalized container
      const containerBox = new THREE.Box3().setFromObject(result.group);
      const containerSize = new THREE.Vector3();
      containerBox.getSize(containerSize);

      expect(containerSize.x).toBeCloseTo(1.0);
      expect(containerSize.y).toBeCloseTo(2.0);
      expect(containerSize.z).toBeCloseTo(2.0);

      // Grounding standard: Bottom must sit at y = 0
      expect(containerBox.min.y).toBeCloseTo(0.0);
      expect(containerBox.max.y).toBeCloseTo(2.0);

      // Centering standard: X and Z must be centered around 0
      expect((containerBox.min.x + containerBox.max.x) / 2).toBeCloseTo(0.0);
      expect((containerBox.min.z + containerBox.max.z) / 2).toBeCloseTo(0.0);
    });

    it("detects undistorted proportional scaling correctly", async () => {
      // Mock asset: Cube 1m x 1m x 1m
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        group.add(mesh);
        onLoad({ scene: group });
      });

      // Target proportional scaling: 2m x 2m x 2m
      const result = await loadAndNormalizeCustomAsset(
        "/models/cube.glb",
        { x: 2.0, y: 2.0, z: 2.0 },
      );

      expect(result.isDistorted).toBe(false);
      expect(result.aspectRatioDiscrepancy).toBe(1.0);
    });

    it("rejects degenerate bounding boxes with zero dimensions", async () => {
      // Mock asset with 0 size on X
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BufferGeometry()); // empty
        group.add(mesh);
        onLoad({ scene: group });
      });

      await expect(
        loadAndNormalizeCustomAsset("/models/empty.glb", { x: 1, y: 1, z: 1 }),
      ).rejects.toThrow("Degenerate bounding box detected");
    });
  });

  describe("Caching & Template Isolation", () => {
    it("caches loaded master template and avoids redundant downloads", async () => {
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
        onLoad({ scene: group });
      });

      const url = "https://cdn.internal.test/models/reusable-bin.glb";
      const target = { x: 0.5, y: 0.5, z: 0.5 };

      // Load twice
      await loadAndNormalizeCustomAsset(url, target);
      await loadAndNormalizeCustomAsset(url, target);

      // Loader was only called once
      expect(mockLoad).toHaveBeenCalledTimes(1);
    });

    it("isolates cloned instances so transforms do not leak across callers", async () => {
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
        onLoad({ scene: group });
      });

      const url = "/models/cabinet.glb";
      const res1 = await loadAndNormalizeCustomAsset(url, { x: 1, y: 1, z: 1 });
      const res2 = await loadAndNormalizeCustomAsset(url, { x: 2, y: 4, z: 2 });

      // Ensure distinct instances
      expect(res1.group).not.toBe(res2.group);

      // Mutate instance 1
      res1.group.position.set(10, 20, 30);
      expect(res2.group.position.x).not.toBe(10);
      expect(res2.group.position.y).not.toBe(20);
      expect(res2.group.position.z).not.toBe(30);
    });
  });

  describe("Mesh Interaction Tagging & Fallback Material", () => {
    it("tags all descendant meshes with raycaster metadata and provides fallback material", async () => {
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        // Mesh without material
        const untexturedMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        group.add(untexturedMesh);
        onLoad({ scene: group });
      });

      const result = await loadAndNormalizeCustomAsset(
        "/models/untextured.glb",
        { x: 1, y: 1, z: 1 },
        {
          locationId: "loc-drawer-99",
          locationCode: "DRW-99",
          isParent: true,
        },
      );

      let taggedMesh: THREE.Mesh | null = null;
      result.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          taggedMesh = child as THREE.Mesh;
        }
      });

      expect(taggedMesh).not.toBeNull();
      expect(taggedMesh!.userData).toEqual({
        isParent: true,
        locationId: "loc-drawer-99",
        locationCode: "DRW-99",
        isCustomAsset: true,
      });

      // Material should have been assigned fallback MeshStandardMaterial
      expect(taggedMesh!.material).toBeDefined();
      expect(taggedMesh!.castShadow).toBe(true);
      expect(taggedMesh!.receiveShadow).toBe(true);
    });
  });

  describe("Resource Lifecycle & Disposal Safety", () => {
    it("rejects invalid or non-positive target dimensions", async () => {
      await expect(
        loadAndNormalizeCustomAsset("/models/box.glb", { x: 0, y: 1, z: 1 }),
      ).rejects.toThrow("Invalid target dimensions");

      await expect(
        loadAndNormalizeCustomAsset("/models/box.glb", { x: 1, y: -0.5, z: 1 }),
      ).rejects.toThrow("Invalid target dimensions");
    });

    it("respects abortSignal when loading is cancelled", async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        loadAndNormalizeCustomAsset(
          "/models/shelf.glb",
          { x: 1, y: 1, z: 1 },
          { abortSignal: abortController.signal },
        ),
      ).rejects.toThrow("Asset load aborted");
    });

    it("does not dispose shared template geometry or material when instance hierarchy is disposed", async () => {
      let sharedGeo: THREE.BufferGeometry | null = null;
      let sharedMat: THREE.Material | null = null;

      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        sharedGeo = new THREE.BoxGeometry(1, 1, 1);
        sharedMat = new THREE.MeshBasicMaterial();
        const mesh = new THREE.Mesh(sharedGeo, sharedMat);
        group.add(mesh);
        onLoad({ scene: group });
      });

      const url = "/models/shared-rack.glb";
      const instance1 = await loadAndNormalizeCustomAsset(url, { x: 1, y: 1, z: 1 });

      const geoDisposeSpy = vi.spyOn(sharedGeo!, "dispose");
      const matDisposeSpy = vi.spyOn(sharedMat!, "dispose");

      // Import disposeThreeHierarchy dynamically from spatial-3d-scene
      const { disposeThreeHierarchy } = await import("./spatial-3d-scene");

      // Simulate viewport unmounting / swapping carcass
      disposeThreeHierarchy(instance1.group);

      // Shared template geometry and material MUST NOT be disposed!
      expect(geoDisposeSpy).not.toHaveBeenCalled();
      expect(matDisposeSpy).not.toHaveBeenCalled();

      // Second instance should still share valid, undisposed geometries
      const instance2 = await loadAndNormalizeCustomAsset(url, { x: 2, y: 2, z: 2 });
      expect(instance2.group).toBeDefined();

      // Now clear cache explicitly: this SHOULD dispose template GPU resources
      clearAssetCache();
      expect(geoDisposeSpy).toHaveBeenCalledTimes(1);
      expect(matDisposeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
