import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { validate3DAssetUrl } from "./spatial-asset-security";
import type { Vector3D } from "./spatial-3d-layout";
import { SPATIAL_3D_PALETTE } from "./spatial-3d-scene";

export interface NormalizedAssetResult {
  group: THREE.Group;
  rawDimensionsMeters: Vector3D;
  targetDimensionsMeters: Vector3D;
  appliedScale: Vector3D;
  aspectRatioDiscrepancy: number; // ratio of max scale to min scale (1.0 = perfect proportion)
  isDistorted: boolean;
}

export interface CachedAssetTemplate {
  scene: THREE.Group;
  rawSize: THREE.Vector3;
  rawCenter: THREE.Vector3;
  rawMin: THREE.Vector3;
  url?: string;
  activeRefCount: number;
  isEvicted: boolean;
  isDisposed: boolean;
}

export interface AssetLoaderConfig {
  cacheCapacity: number;
  downloadTimeoutMs: number;
  maxAssetSizeBytes: number;
}

export interface LoadCustomAssetOptions {
  locationId?: string;
  locationCode?: string;
  isParent?: boolean;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  maxSizeBytes?: number;
}

export interface DownloadAssetOptions {
  timeoutMs?: number;
  maxSizeBytes?: number;
  abortSignal?: AbortSignal;
}

/** Default LRU cache capacity: 10 templates */
export const DEFAULT_ASSET_CACHE_CAPACITY = 10;
/** Default asset download timeout: 15 seconds */
export const DEFAULT_ASSET_DOWNLOAD_TIMEOUT_MS = 15_000;
/** Default maximum asset download size: 25 MiB */
export const DEFAULT_MAX_ASSET_SIZE_BYTES = 25 * 1024 * 1024;

let globalConfig: AssetLoaderConfig = {
  cacheCapacity: DEFAULT_ASSET_CACHE_CAPACITY,
  downloadTimeoutMs: DEFAULT_ASSET_DOWNLOAD_TIMEOUT_MS,
  maxAssetSizeBytes: DEFAULT_MAX_ASSET_SIZE_BYTES,
};

/**
 * Configure global loader parameters for cache capacity, timeout, and maximum file size.
 */
export function configureAssetLoader(config: Partial<AssetLoaderConfig>): void {
  if (typeof config.cacheCapacity === "number" && config.cacheCapacity >= 1) {
    globalConfig.cacheCapacity = Math.floor(config.cacheCapacity);
    assetTemplateCache.setCapacity(globalConfig.cacheCapacity);
  }
  if (typeof config.downloadTimeoutMs === "number" && config.downloadTimeoutMs >= 0) {
    globalConfig.downloadTimeoutMs = config.downloadTimeoutMs;
  }
  if (typeof config.maxAssetSizeBytes === "number" && config.maxAssetSizeBytes >= 0) {
    globalConfig.maxAssetSizeBytes = config.maxAssetSizeBytes;
  }
}

/**
 * Get current loader configuration.
 */
export function getAssetLoaderConfig(): Readonly<AssetLoaderConfig> {
  return { ...globalConfig };
}

/**
 * Reset loader configuration to production defaults.
 */
export function resetAssetLoaderConfig(): void {
  globalConfig = {
    cacheCapacity: DEFAULT_ASSET_CACHE_CAPACITY,
    downloadTimeoutMs: DEFAULT_ASSET_DOWNLOAD_TIMEOUT_MS,
    maxAssetSizeBytes: DEFAULT_MAX_ASSET_SIZE_BYTES,
  };
  assetTemplateCache.setCapacity(DEFAULT_ASSET_CACHE_CAPACITY);
}

/**
 * Bounded LRU Cache for parsed 3D asset templates.
 *
 * Resource Ownership Guarantees:
 * 1. The cache retains parsed master templates up to its configured capacity.
 * 2. Cache hits update the entry's recency to prevent premature eviction.
 * 3. When capacity is exceeded, the least-recently-used entry is evicted from the cache.
 * 4. Active Scene Protection: Evicting a template DOES NOT dispose its GPU geometries or
 *    materials if one or more active scenes are still referencing it (activeRefCount > 0).
 *    Instead, the template is marked evicted (isEvicted = true) and its GPU disposal is deferred
 *    until all active scene instances are torn down.
 * 5. If an evicted template has no active scenes (activeRefCount === 0), its GPU resources
 *    are immediately disposed to prevent memory leaks.
 */
export class AssetTemplateLruCache {
  private capacity: number;
  private entries = new Map<string, CachedAssetTemplate>();

  constructor(capacity = DEFAULT_ASSET_CACHE_CAPACITY) {
    this.capacity = Math.max(1, capacity);
  }

  getCapacity(): number {
    return this.capacity;
  }

  setCapacity(newCapacity: number): void {
    this.capacity = Math.max(1, newCapacity);
    this.trimToCapacity();
  }

  size(): number {
    return this.entries.size;
  }

  has(url: string): boolean {
    return this.entries.has(url);
  }

  get(url: string): CachedAssetTemplate | undefined {
    const template = this.entries.get(url);
    if (!template) {
      return undefined;
    }
    // Update LRU recency: re-insert at end of Map iteration order
    this.entries.delete(url);
    this.entries.set(url, template);
    return template;
  }

  set(url: string, template: CachedAssetTemplate): void {
    if (this.entries.has(url)) {
      this.entries.delete(url);
    }
    template.isEvicted = false;
    template.url = url;
    this.entries.set(url, template);
    this.trimToCapacity();
  }

  delete(url: string): boolean {
    const template = this.entries.get(url);
    if (template) {
      this.entries.delete(url);
      template.isEvicted = true;
      if (template.activeRefCount === 0 && !template.isDisposed) {
        disposeCachedTemplate(template);
      }
      return true;
    }
    return false;
  }

  clear(): void {
    for (const template of this.entries.values()) {
      template.isEvicted = true;
      disposeCachedTemplate(template);
    }
    this.entries.clear();
  }

  keys(): string[] {
    return Array.from(this.entries.keys());
  }

  private trimToCapacity(): void {
    while (this.entries.size > this.capacity) {
      const oldestEntry = this.entries.entries().next().value;
      if (!oldestEntry) break;
      const [oldestKey, oldestTemplate] = oldestEntry;
      this.entries.delete(oldestKey);
      oldestTemplate.isEvicted = true;

      // Only dispose GPU resources if no active scenes are currently using them.
      // Active scenes will trigger disposal upon teardown via releaseAssetInstance.
      if (oldestTemplate.activeRefCount === 0 && !oldestTemplate.isDisposed) {
        disposeCachedTemplate(oldestTemplate);
      }
    }
  }
}

// Global LRU cache instance
const assetTemplateCache = new AssetTemplateLruCache(globalConfig.cacheCapacity);

export function getAssetCacheSize(): number {
  return assetTemplateCache.size();
}

export function getAssetCacheCapacity(): number {
  return assetTemplateCache.getCapacity();
}

export function setAssetCacheCapacity(capacity: number): void {
  configureAssetLoader({ cacheCapacity: capacity });
}

interface InFlightRecord {
  promise: Promise<CachedAssetTemplate>;
  subscribers: number;
  abortController: AbortController;
}

const inFlightRequests = new Map<string, InFlightRecord>();

/**
 * Disposes all GPU resources (geometries, materials, and textures) owned by a cached template.
 * Idempotent: safe against double disposal.
 */
export function disposeCachedTemplate(template: CachedAssetTemplate): void {
  if (template.isDisposed) {
    return;
  }
  template.isDisposed = true;

  template.scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          for (const m of mesh.material) {
            disposeMaterialResources(m);
          }
        } else {
          disposeMaterialResources(mesh.material);
        }
      }
    }
  });
}

function disposeMaterialResources(mat: THREE.Material): void {
  const textureKeys = [
    "map",
    "roughnessMap",
    "metalnessMap",
    "normalMap",
    "bumpMap",
    "alphaMap",
    "aoMap",
    "emissiveMap",
    "envMap",
  ] as const;

  for (const key of textureKeys) {
    if (key in mat) {
      const tex = (mat as unknown as Record<string, unknown>)[key];
      if (
        tex &&
        typeof tex === "object" &&
        "dispose" in tex &&
        typeof tex.dispose === "function"
      ) {
        tex.dispose();
      }
    }
  }

  mat.dispose();
}

/**
 * Resets the in-memory asset cache, aborts in-flight requests,
 * and disposes all GPU resources for cached templates.
 */
export function clearAssetCache(): void {
  for (const record of inFlightRequests.values()) {
    record.abortController.abort(new Error("Asset cache cleared"));
  }
  inFlightRequests.clear();
  assetTemplateCache.clear();
}

function resolveFetchUrl(url: string): string {
  if (url.startsWith("/") && typeof window === "undefined") {
    // Provide synthetic origin in Node/test environments when relative URLs are fetched
    return `http://localhost${url}`;
  }
  return url;
}

function getAssetBasePath(url: string): string {
  const lastSlash = url.lastIndexOf("/");
  if (lastSlash >= 0) {
    return url.slice(0, lastSlash + 1);
  }
  return "";
}

/**
 * Downloads a 3D asset binary with strict timeout, Content-Length pre-check,
 * and streaming byte-limit enforcement.
 *
 * ARCHITECTURAL GUARANTEES & LIMITATIONS:
 * 1. Self-contained GLB:
 *    Binary GLB assets encapsulate all vertex buffers, textures, and scenes.
 *    The 25 MiB download limit and 15s timeout strictly protect against oversized downloads
 *    and stalled connections for all GLB models.
 * 2. Multi-file glTF with external subresources (LIMITATION):
 *    For unpacked glTF JSON files referencing external .bin files or image textures,
 *    this downloader bounds the initial .gltf document. Subsequent subresource fetches initiated
 *    internally by Three.js GLTFLoader.parse are subject to security URL restrictions, but bypass
 *    this initial stream-counting wrapper. Production recommendations strongly advise packaging
 *    all models as self-contained .glb files.
 * 3. Decompression Expansion (LIMITATION):
 *    A 25 MiB compressed model may decompress into a larger GPU buffer footprint. Size limits
 *    enforce network transfer and raw binary bounds, not post-decompression vertex buffer size.
 */
export async function downloadAssetWithLimits(
  url: string,
  options?: DownloadAssetOptions,
): Promise<ArrayBuffer> {
  const timeoutMs = options?.timeoutMs ?? globalConfig.downloadTimeoutMs;
  const maxSizeBytes = options?.maxSizeBytes ?? globalConfig.maxAssetSizeBytes;

  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`Asset download timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const cleanupTimer = () => {
    clearTimeout(timeoutId);
  };

  if (options?.abortSignal) {
    if (options.abortSignal.aborted) {
      cleanupTimer();
      throw new Error("Asset load aborted");
    }
    options.abortSignal.addEventListener(
      "abort",
      () => {
        controller.abort(new Error("Asset load aborted"));
      },
      { once: true },
    );
  }

  const fetchUrl = resolveFetchUrl(url);

  let response: Response;
  try {
    response = await fetch(fetchUrl, { signal: controller.signal });
  } catch (err: unknown) {
    cleanupTimer();
    if (timedOut) {
      throw new Error(`Asset download timed out after ${timeoutMs}ms`);
    }
    if (
      options?.abortSignal?.aborted ||
      (err instanceof Error && err.name === "AbortError" && !timedOut)
    ) {
      throw new Error("Asset load aborted");
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to download asset from "${url}": ${msg}`);
  }

  if (!response.ok) {
    cleanupTimer();
    throw new Error(
      `Failed to download asset from "${url}": HTTP ${response.status} ${response.statusText}`,
    );
  }

  // 1. Content-Length header verification (enforce before downloading complete body)
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > maxSizeBytes) {
      cleanupTimer();
      controller.abort();
      throw new Error(
        `Asset size (${contentLength} bytes) exceeds maximum allowed limit of ${maxSizeBytes} bytes (25 MiB)`,
      );
    }
  }

  // 2. Stream-based byte counting to protect against missing, chunked, or deceptive Content-Length
  try {
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.byteLength;
            if (totalBytes > maxSizeBytes) {
              await reader.cancel();
              controller.abort();
              throw new Error(
                `Asset download exceeded maximum size limit of ${maxSizeBytes} bytes (25 MiB)`,
              );
            }
            chunks.push(value);
          }
        }
      } finally {
        reader.releaseLock?.();
      }

      cleanupTimer();

      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return combined.buffer;
    } else {
      // Fallback for environments lacking ReadableStream getReader
      const buffer = await response.arrayBuffer();
      cleanupTimer();
      if (buffer.byteLength > maxSizeBytes) {
        throw new Error(
          `Asset download exceeded maximum size limit of ${maxSizeBytes} bytes (25 MiB)`,
        );
      }
      return buffer;
    }
  } catch (err: unknown) {
    cleanupTimer();
    if (timedOut) {
      throw new Error(`Asset download timed out after ${timeoutMs}ms`);
    }
    if (options?.abortSignal?.aborted) {
      throw new Error("Asset load aborted");
    }
    throw err;
  }
}

/**
 * Internal helper to download and parse glTF / GLB via Three.js GLTFLoader.
 */
async function fetchAndParseGLTF(
  url: string,
  options?: DownloadAssetOptions,
): Promise<CachedAssetTemplate> {
  const buffer = await downloadAssetWithLimits(url, options);

  const loader = new GLTFLoader();
  const basePath = getAssetBasePath(url);

  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    if (typeof loader.parse === "function") {
      loader.parse(
        buffer,
        basePath,
        (loaded) => resolve(loaded),
        (err) => reject(err),
      );
    } else {
      // Compatibility fallback if GLTFLoader mock only defines load()
      loader.load(
        url,
        (loaded) => resolve(loaded),
        undefined,
        (err) => reject(err),
      );
    }
  });

  // Attach fallback material on template if any meshes lack materials
  // and compute precise bounding box from geometry
  const bbox = new THREE.Box3();
  let hasGeometry = false;

  gltf.scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (!mesh.material) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(SPATIAL_3D_PALETTE.carcass.base),
          roughness: SPATIAL_3D_PALETTE.carcass.roughness,
          metalness: SPATIAL_3D_PALETTE.carcass.metalness,
        });
      }

      if (mesh.geometry) {
        if (mesh.geometry.boundingBox === null) {
          mesh.geometry.computeBoundingBox();
        }
        if (mesh.geometry.boundingBox) {
          bbox.expandByObject(mesh);
          hasGeometry = true;
        }
      }
    }
  });

  if (!hasGeometry) {
    bbox.setFromObject(gltf.scene);
  }

  const rawSize = new THREE.Vector3();
  bbox.getSize(rawSize);

  const rawCenter = new THREE.Vector3();
  bbox.getCenter(rawCenter);

  const rawMin = bbox.min.clone();

  return {
    scene: gltf.scene,
    rawSize,
    rawCenter,
    rawMin,
    url,
    activeRefCount: 0,
    isEvicted: false,
    isDisposed: false,
  };
}

/**
 * Loads a GLB/GLTF model from a validated URL, parses its geometry,
 * caches the master template in an LRU cache, and returns a safely cloned and dimension-normalized instance.
 */
export async function loadAndNormalizeCustomAsset(
  assetUrl: string,
  targetDimensions: Vector3D,
  options?: LoadCustomAssetOptions,
): Promise<NormalizedAssetResult> {
  const validation = validate3DAssetUrl(assetUrl);
  if (!validation.ok) {
    throw new Error(
      `Security rejection for asset URL "${assetUrl}": ${validation.message}`,
    );
  }

  if (
    !targetDimensions ||
    targetDimensions.x <= 0.0001 ||
    targetDimensions.y <= 0.0001 ||
    targetDimensions.z <= 0.0001
  ) {
    throw new Error(
      `Invalid target dimensions for asset "${assetUrl}": (${targetDimensions?.x ?? 0}x${targetDimensions?.y ?? 0}x${targetDimensions?.z ?? 0})`,
    );
  }

  if (options?.abortSignal?.aborted) {
    throw new Error("Asset load aborted");
  }

  const normalizedUrl = validation.url;

  // 1. Fetch and parse template with in-flight deduplication and LRU caching
  let template = assetTemplateCache.get(normalizedUrl);
  if (!template) {
    let inFlight = inFlightRequests.get(normalizedUrl);
    if (inFlight && inFlight.abortController.signal.aborted) {
      inFlightRequests.delete(normalizedUrl);
      inFlight = undefined;
    }

    if (!inFlight) {
      const abortController = new AbortController();
      const promise = fetchAndParseGLTF(normalizedUrl, {
        abortSignal: abortController.signal,
        timeoutMs: options?.timeoutMs,
        maxSizeBytes: options?.maxSizeBytes,
      });

      inFlight = {
        promise,
        subscribers: 1,
        abortController,
      };
      inFlightRequests.set(normalizedUrl, inFlight);

      // Clean up in-flight mapping upon completion
      promise
        .then((loadedTemplate) => {
          assetTemplateCache.set(normalizedUrl, loadedTemplate);
        })
        .catch(() => {
          // Errors are handled by callers awaiting inFlight.promise
        })
        .finally(() => {
          inFlightRequests.delete(normalizedUrl);
        });
    } else {
      inFlight.subscribers += 1;
    }

    if (options?.abortSignal) {
      const callerSignal = options.abortSignal;
      const currentInFlight = inFlight;

      template = await Promise.race([
        inFlight.promise,
        new Promise<never>((_, reject) => {
          const onAbort = () => {
            callerSignal.removeEventListener("abort", onAbort);
            currentInFlight.subscribers = Math.max(0, currentInFlight.subscribers - 1);
            reject(new Error("Asset load aborted"));
          };

          if (callerSignal.aborted) {
            onAbort();
          } else {
            callerSignal.addEventListener("abort", onAbort, { once: true });
          }
        }),
      ]);
    } else {
      template = await inFlight.promise;
    }
  }

  if (options?.abortSignal?.aborted) {
    throw new Error("Asset load aborted");
  }

  // 2. Clone master template safely using SkeletonUtils to prevent transform sharing
  const clonedScene = SkeletonUtils.clone(template.scene) as THREE.Group;

  // Increment active reference count for the template
  template.activeRefCount += 1;

  // Create idempotent instance release hook for scene teardown
  let instanceReleased = false;
  const releaseAssetInstance = () => {
    if (instanceReleased) return;
    instanceReleased = true;

    template.activeRefCount = Math.max(0, template.activeRefCount - 1);

    // If template was already evicted from LRU cache and this was the last active scene using it,
    // finalize disposal of template GPU resources.
    if (template.isEvicted && template.activeRefCount === 0 && !template.isDisposed) {
      disposeCachedTemplate(template);
    }
  };

  // 3. Calculate dimension normalization factors
  const { rawSize, rawCenter, rawMin } = template;
  if (rawSize.x <= 0.0001 || rawSize.y <= 0.0001 || rawSize.z <= 0.0001) {
    throw new Error(
      `Degenerate bounding box detected in asset "${assetUrl}" (${rawSize.x}x${rawSize.y}x${rawSize.z})`,
    );
  }

  const scaleX = targetDimensions.x / rawSize.x;
  const scaleY = targetDimensions.y / rawSize.y;
  const scaleZ = targetDimensions.z / rawSize.z;

  const scales = [scaleX, scaleY, scaleZ];
  const minScale = Math.min(...scales);
  const maxScale = Math.max(...scales);
  const discrepancy = minScale > 0 ? maxScale / minScale : 1.0;
  const isDistorted = discrepancy > 2.5;

  // 4. Assemble container group with deterministic origin alignment
  // Ananya standard: Ground plane at y = 0, X centered, Z centered
  const container = new THREE.Group();
  container.name = `custom-asset-${options?.locationCode || "model"}`;
  container.userData = {
    ...container.userData,
    releaseAssetInstance,
  };

  // Apply scales to cloned scene
  clonedScene.scale.set(scaleX, scaleY, scaleZ);

  // Offset cloned scene so its bottom sits at y = 0 and horizontal center sits at [0, 0]
  clonedScene.position.set(
    -rawCenter.x * scaleX,
    -rawMin.y * scaleY,
    -rawCenter.z * scaleZ,
  );

  // Apply interaction tags and release hook to all descendant meshes so parent carcass doesn't block child clicks,
  // and disposeThreeHierarchy knows to protect shared template GPU resources while releasing active instance count.
  clonedScene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.userData = {
        isParent: options?.isParent !== false,
        locationId: options?.locationId || "",
        locationCode: options?.locationCode || "",
        isCustomAsset: true,
        releaseAssetInstance,
      };
    }
  });

  container.add(clonedScene);

  return {
    group: container,
    rawDimensionsMeters: { x: rawSize.x, y: rawSize.y, z: rawSize.z },
    targetDimensionsMeters: targetDimensions,
    appliedScale: { x: scaleX, y: scaleY, z: scaleZ },
    aspectRatioDiscrepancy: Number(discrepancy.toFixed(3)),
    isDistorted,
  };
}
