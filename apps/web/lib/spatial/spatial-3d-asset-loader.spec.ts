import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  clearAssetCache,
  configureAssetLoader,
  DEFAULT_ASSET_CACHE_CAPACITY,
  DEFAULT_ASSET_DOWNLOAD_TIMEOUT_MS,
  DEFAULT_MAX_ASSET_SIZE_BYTES,
  getAssetCacheCapacity,
  getAssetCacheSize,
  getAssetLoaderConfig,
  loadAndNormalizeCustomAsset,
  resetAssetLoaderConfig,
  setAssetCacheCapacity,
} from "./spatial-3d-asset-loader";

// Mock GLTFLoader to return deterministic Three.js scenes without needing network/WebGL
const mockLoad = vi.fn();
const mockParse = vi.fn();

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
      parse(
        data: ArrayBuffer | string,
        path: string,
        onLoad: (gltf: { scene: THREE.Group }) => void,
        onError?: (err: unknown) => void,
      ) {
        mockParse(data, path, onLoad, onError);
      }
    },
  };
});

describe("spatial-3d-asset-loader", () => {
  beforeEach(() => {
    resetAssetLoaderConfig();
    clearAssetCache();
    mockLoad.mockReset();
    mockParse.mockReset();

    // Default mockParse creates a standard 1x1x1 cube
    mockParse.mockImplementation((_data, _path, onLoad) => {
      if (mockLoad.getMockImplementation()) {
        mockLoad("", onLoad, () => {});
        return;
      }
      const group = new THREE.Group();
      group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
      onLoad({ scene: group });
    });

    // Default fetch mock returning a 100-byte valid response
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(new Uint8Array(100), {
          status: 200,
          headers: {
            "Content-Type": "model/gltf-binary",
            "Content-Length": "100",
          },
        });
      }),
    );
  });

  afterEach(() => {
    clearAssetCache();
    resetAssetLoaderConfig();
    vi.restoreAllMocks();
  });

  describe("Security Pre-validation", () => {
    it("rejects malicious or invalid URLs without invoking network or GLTFLoader", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

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

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(mockParse).not.toHaveBeenCalled();
      expect(mockLoad).not.toHaveBeenCalled();
    });
  });

  describe("Dimension Normalization & Grounding", () => {
    it("normalizes bounding box to match target millimeter dimensions and grounds bottom at y=0", async () => {
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        const geometry = new THREE.BoxGeometry(2, 1, 4);
        geometry.translate(0, 0.5, 0); // min.y = 0, max.y = 1
        const mesh = new THREE.Mesh(geometry);
        group.add(mesh);
        onLoad({ scene: group });
      });

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

      expect(result.isDistorted).toBe(true);
      expect(result.aspectRatioDiscrepancy).toBeCloseTo(4.0);

      const containerBox = new THREE.Box3().setFromObject(result.group);
      const containerSize = new THREE.Vector3();
      containerBox.getSize(containerSize);

      expect(containerSize.x).toBeCloseTo(1.0);
      expect(containerSize.y).toBeCloseTo(2.0);
      expect(containerSize.z).toBeCloseTo(2.0);

      expect(containerBox.min.y).toBeCloseTo(0.0);
      expect(containerBox.max.y).toBeCloseTo(2.0);

      expect((containerBox.min.x + containerBox.max.x) / 2).toBeCloseTo(0.0);
      expect((containerBox.min.z + containerBox.max.z) / 2).toBeCloseTo(0.0);
    });

    it("detects undistorted proportional scaling correctly", async () => {
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        group.add(mesh);
        onLoad({ scene: group });
      });

      const result = await loadAndNormalizeCustomAsset(
        "/models/cube.glb",
        { x: 2.0, y: 2.0, z: 2.0 },
      );

      expect(result.isDistorted).toBe(false);
      expect(result.aspectRatioDiscrepancy).toBe(1.0);
    });

    it("rejects degenerate bounding boxes with zero dimensions", async () => {
      mockLoad.mockImplementation((_url, onLoad) => {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BufferGeometry());
        group.add(mesh);
        onLoad({ scene: group });
      });

      await expect(
        loadAndNormalizeCustomAsset("/models/empty.glb", { x: 1, y: 1, z: 1 }),
      ).rejects.toThrow("Degenerate bounding box detected");
    });
  });

  describe("Bounded LRU Cache & Recency Management", () => {
    it("has a conservative default capacity of 10 templates", () => {
      expect(DEFAULT_ASSET_CACHE_CAPACITY).toBe(10);
      expect(getAssetCacheCapacity()).toBe(10);
      expect(getAssetCacheSize()).toBe(0);
    });

    it("updates LRU recency upon cache hit", async () => {
      setAssetCacheCapacity(2);

      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // 1. Load A: cache = [A]
      await loadAndNormalizeCustomAsset("/models/model-a.glb", { x: 1, y: 1, z: 1 });
      // 2. Load B: cache = [A, B] (B most recent, A is LRU)
      await loadAndNormalizeCustomAsset("/models/model-b.glb", { x: 1, y: 1, z: 1 });
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // 3. Re-access A: cache hit should promote A to most recent! Cache is now [B, A] (B is LRU)
      await loadAndNormalizeCustomAsset("/models/model-a.glb", { x: 1, y: 1, z: 1 });
      expect(fetchSpy).toHaveBeenCalledTimes(2); // no network fetch

      // 4. Load C: capacity is 2, so the LRU entry (Model B) must be evicted! Cache is now [A, C]
      await loadAndNormalizeCustomAsset("/models/model-c.glb", { x: 1, y: 1, z: 1 });
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // 5. Accessing A should still be a cache hit (not evicted)
      await loadAndNormalizeCustomAsset("/models/model-a.glb", { x: 1, y: 1, z: 1 });
      expect(fetchSpy).toHaveBeenCalledTimes(3);

      // 6. Accessing B should trigger a network fetch (was evicted)
      await loadAndNormalizeCustomAsset("/models/model-b.glb", { x: 1, y: 1, z: 1 });
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it("evicts least-recently-used entry at capacity", async () => {
      setAssetCacheCapacity(3);

      for (let i = 1; i <= 3; i++) {
        await loadAndNormalizeCustomAsset(`/models/model-${i}.glb`, { x: 1, y: 1, z: 1 });
      }
      expect(getAssetCacheSize()).toBe(3);

      // Load 4th model -> model-1 should be evicted
      await loadAndNormalizeCustomAsset("/models/model-4.glb", { x: 1, y: 1, z: 1 });
      expect(getAssetCacheSize()).toBe(3);

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockClear();
      // Accessing model-2 should hit cache
      await loadAndNormalizeCustomAsset("/models/model-2.glb", { x: 1, y: 1, z: 1 });
      expect(fetchSpy).not.toHaveBeenCalled();

      // Accessing model-1 should re-download
      await loadAndNormalizeCustomAsset("/models/model-1.glb", { x: 1, y: 1, z: 1 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("ensures active scene resources remain valid after cache eviction", async () => {
      const { disposeThreeHierarchy } = await import("./spatial-3d-scene");

      let sharedGeo: THREE.BufferGeometry | null = null;
      let sharedMat: THREE.Material | null = null;

      mockParse.mockImplementation((_data, _path, onLoad) => {
        const group = new THREE.Group();
        sharedGeo = new THREE.BoxGeometry(1, 1, 1);
        sharedMat = new THREE.MeshBasicMaterial();
        const mesh = new THREE.Mesh(sharedGeo, sharedMat);
        group.add(mesh);
        onLoad({ scene: group });
      });

      // Set capacity = 1
      setAssetCacheCapacity(1);

      // 1. Load active scene with Model A
      const activeInstanceA = await loadAndNormalizeCustomAsset(
        "/models/active-shelf.glb",
        { x: 1, y: 1, z: 1 },
      );

      const geoDisposeSpy = vi.spyOn(sharedGeo!, "dispose");
      const matDisposeSpy = vi.spyOn(sharedMat!, "dispose");

      // 2. Load Model B -> Model A is evicted from LRU cache!
      mockParse.mockImplementation((_data, _path, onLoad) => {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
        onLoad({ scene: group });
      });
      await loadAndNormalizeCustomAsset("/models/other-model.glb", { x: 1, y: 1, z: 1 });

      // CRITICAL ASSERTION:
      // Even though Model A was evicted from the LRU cache,
      // its shared geometry and material MUST NOT be disposed because activeInstanceA is still in an active scene!
      expect(geoDisposeSpy).not.toHaveBeenCalled();
      expect(matDisposeSpy).not.toHaveBeenCalled();

      let foundMesh: THREE.Mesh | null = null;
      activeInstanceA.group.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          foundMesh = child as THREE.Mesh;
        }
      });
      expect(foundMesh).not.toBeNull();
      expect(foundMesh!.geometry).toBe(sharedGeo);
      expect(foundMesh!.material).toBe(sharedMat);

      // 3. Now simulate active scene teardown (e.g. user navigates away or unmounts viewport)
      disposeThreeHierarchy(activeInstanceA.group);

      // Now that active scene is torn down AND the template was evicted, GPU resources are cleanly disposed!
      expect(geoDisposeSpy).toHaveBeenCalledTimes(1);
      expect(matDisposeSpy).toHaveBeenCalledTimes(1);

      // Teardown again should not cause double disposal
      disposeThreeHierarchy(activeInstanceA.group);
      expect(geoDisposeSpy).toHaveBeenCalledTimes(1);
      expect(matDisposeSpy).toHaveBeenCalledTimes(1);
    });

    it("does not dispose shared template geometry or material when instance hierarchy is disposed while template remains in cache", async () => {
      const { disposeThreeHierarchy } = await import("./spatial-3d-scene");

      let sharedGeo: THREE.BufferGeometry | null = null;
      let sharedMat: THREE.Material | null = null;

      mockParse.mockImplementation((_data, _path, onLoad) => {
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

      // Dispose instance 1 (template is still in cache)
      disposeThreeHierarchy(instance1.group);

      expect(geoDisposeSpy).not.toHaveBeenCalled();
      expect(matDisposeSpy).not.toHaveBeenCalled();

      // Second instance reuses intact template
      const instance2 = await loadAndNormalizeCustomAsset(url, { x: 2, y: 2, z: 2 });
      expect(instance2.group).toBeDefined();

      // Clear cache explicitly: this disposes template GPU resources
      clearAssetCache();
      expect(geoDisposeSpy).toHaveBeenCalledTimes(1);
      expect(matDisposeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("In-Flight Request Deduplication & Error Safety", () => {
    it("deduplicates concurrent loads without duplicate downloads", async () => {
      let fetchCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          fetchCount++;
          await new Promise((resolve) => setTimeout(resolve, 20));
          return new Response(new Uint8Array(100), { status: 200 });
        }),
      );

      const url = "https://cdn.internal.test/models/concurrent-bin.glb";
      const target = { x: 0.5, y: 0.5, z: 0.5 };

      // Trigger two concurrent loads
      const [res1, res2] = await Promise.all([
        loadAndNormalizeCustomAsset(url, target),
        loadAndNormalizeCustomAsset(url, target),
      ]);

      // Exactly ONE fetch was performed
      expect(fetchCount).toBe(1);

      // Cloned instances are distinct objects
      expect(res1.group).not.toBe(res2.group);
    });

    it("ensures failed loads do not poison the cache", async () => {
      let attempt = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          attempt++;
          if (attempt === 1) {
            return new Response("Not Found", { status: 404, statusText: "Not Found" });
          }
          return new Response(new Uint8Array(100), { status: 200 });
        }),
      );

      const url = "/models/transient-fail.glb";
      const target = { x: 1, y: 1, z: 1 };

      // Attempt 1 fails
      await expect(loadAndNormalizeCustomAsset(url, target)).rejects.toThrow("HTTP 404");
      expect(getAssetCacheSize()).toBe(0);

      // Attempt 2 succeeds (cache was not poisoned with the failure)
      const res = await loadAndNormalizeCustomAsset(url, target);
      expect(res.group).toBeDefined();
      expect(getAssetCacheSize()).toBe(1);
    });
  });

  describe("Download Timeout & Size Limit Hardening", () => {
    it("has 15 seconds default timeout and 25 MiB default size limit", () => {
      expect(DEFAULT_ASSET_DOWNLOAD_TIMEOUT_MS).toBe(15000);
      expect(DEFAULT_MAX_ASSET_SIZE_BYTES).toBe(25 * 1024 * 1024);

      const conf = getAssetLoaderConfig();
      expect(conf.downloadTimeoutMs).toBe(15000);
      expect(conf.maxAssetSizeBytes).toBe(25 * 1024 * 1024);
    });

    it("aborts underlying download when timeout expires", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted", "AbortError"));
            });
          });
        }),
      );

      // Configure a short 30ms timeout
      configureAssetLoader({ downloadTimeoutMs: 30 });

      await expect(
        loadAndNormalizeCustomAsset("/models/stalled.glb", { x: 1, y: 1, z: 1 }),
      ).rejects.toThrow("Asset download timed out after 30ms");

      expect(getAssetCacheSize()).toBe(0);
    });

    it("rejects oversized assets early when Content-Length exceeds 25 MiB", async () => {
      const fetchSpy = vi.fn(async () => {
        return new Response(new Uint8Array(10), {
          status: 200,
          headers: {
            "Content-Length": String(30 * 1024 * 1024), // 30 MiB
          },
        });
      });
      vi.stubGlobal("fetch", fetchSpy);

      await expect(
        loadAndNormalizeCustomAsset("/models/giant.glb", { x: 1, y: 1, z: 1 }),
      ).rejects.toThrow("exceeds maximum allowed limit");

      expect(getAssetCacheSize()).toBe(0);
    });

    it("enforces size limit during streaming when Content-Length is missing or misleading", async () => {
      // Simulate misleading Content-Length: says 100 bytes, but stream produces more than maxSizeBytes
      const chunk = new Uint8Array(500);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      });

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          return new Response(stream, {
            status: 200,
            headers: {
              "Content-Length": "100", // misleading
            },
          });
        }),
      );

      // Configure maxAssetSizeBytes = 600 bytes
      configureAssetLoader({ maxAssetSizeBytes: 600 });

      await expect(
        loadAndNormalizeCustomAsset("/models/stream-overflow.glb", { x: 1, y: 1, z: 1 }),
      ).rejects.toThrow("Asset download exceeded maximum size limit of 600 bytes");

      expect(getAssetCacheSize()).toBe(0);
    });

    it("handles missing Content-Length safely if within size limits", async () => {
      // Response with chunked transfer / no Content-Length
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(50));
          controller.close();
        },
      });

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          return new Response(stream, {
            status: 200,
            headers: {}, // no Content-Length
          });
        }),
      );

      const res = await loadAndNormalizeCustomAsset("/models/chunked.glb", {
        x: 1,
        y: 1,
        z: 1,
      });
      expect(res.group).toBeDefined();
      expect(getAssetCacheSize()).toBe(1);
    });

    it("aborts download promptly when caller abortSignal triggers", async () => {
      const abortController = new AbortController();

      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init?: RequestInit) => {
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted", "AbortError"));
            });
          });
        }),
      );

      const loadPromise = loadAndNormalizeCustomAsset(
        "/models/abort-me.glb",
        { x: 1, y: 1, z: 1 },
        { abortSignal: abortController.signal },
      );

      // Abort immediately
      abortController.abort();

      await expect(loadPromise).rejects.toThrow("Asset load aborted");
    });
  });

  describe("Mesh Interaction Tagging & Fallback Material", () => {
    it("tags all descendant meshes with raycaster metadata and provides fallback material", async () => {
      mockParse.mockImplementation((_data, _path, onLoad) => {
        const group = new THREE.Group();
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
      expect(taggedMesh!.userData.isParent).toBe(true);
      expect(taggedMesh!.userData.locationId).toBe("loc-drawer-99");
      expect(taggedMesh!.userData.locationCode).toBe("DRW-99");
      expect(taggedMesh!.userData.isCustomAsset).toBe(true);
      expect(typeof taggedMesh!.userData.releaseAssetInstance).toBe("function");

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

    it("respects pre-aborted abortSignal", async () => {
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
  });
});
