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
}

// In-memory cache of parsed GLTF templates and in-flight download promises
const assetTemplateCache = new Map<string, CachedAssetTemplate>();
const inFlightRequests = new Map<string, Promise<CachedAssetTemplate>>();

/**
 * Disposes all GPU resources (geometries, materials, and textures) owned by a cached template.
 */
export function disposeCachedTemplate(template: CachedAssetTemplate): void {
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
 * Resets the in-memory asset cache and disposes all GPU resources for cached templates.
 */
export function clearAssetCache(): void {
  for (const template of assetTemplateCache.values()) {
    disposeCachedTemplate(template);
  }
  assetTemplateCache.clear();
  inFlightRequests.clear();
}

/**
 * Loads a GLB/GLTF model from a validated URL, parses its geometry,
 * caches the master template, and returns a safely cloned and dimension-normalized instance.
 */
export async function loadAndNormalizeCustomAsset(
  assetUrl: string,
  targetDimensions: Vector3D,
  options?: {
    locationId?: string;
    locationCode?: string;
    isParent?: boolean;
    abortSignal?: AbortSignal;
  },
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

  // 1. Fetch and parse template with in-flight deduplication
  let template = assetTemplateCache.get(normalizedUrl);
  if (!template) {
    let pending = inFlightRequests.get(normalizedUrl);
    if (!pending) {
      pending = fetchAndParseGLTF(normalizedUrl);
      inFlightRequests.set(normalizedUrl, pending);
    }

    try {
      if (options?.abortSignal) {
        const signal = options.abortSignal;
        template = await Promise.race([
          pending,
          new Promise<never>((_, reject) => {
            const onAbort = () => {
              signal.removeEventListener("abort", onAbort);
              reject(new Error("Asset load aborted"));
            };
            if (signal.aborted) {
              reject(new Error("Asset load aborted"));
            } else {
              signal.addEventListener("abort", onAbort, { once: true });
            }
          }),
        ]);
      } else {
        template = await pending;
      }
      assetTemplateCache.set(normalizedUrl, template);
    } finally {
      inFlightRequests.delete(normalizedUrl);
    }
  }

  if (options?.abortSignal?.aborted) {
    throw new Error("Asset load aborted");
  }

  // 2. Clone master template safely using SkeletonUtils to prevent transform sharing
  const clonedScene = SkeletonUtils.clone(template.scene) as THREE.Group;

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

  // Apply scales to cloned scene
  clonedScene.scale.set(scaleX, scaleY, scaleZ);

  // Offset cloned scene so its bottom sits at y = 0 and horizontal center sits at [0, 0]
  clonedScene.position.set(
    -rawCenter.x * scaleX,
    -rawMin.y * scaleY,
    -rawCenter.z * scaleZ,
  );

  // Apply interaction tags to all descendant meshes so parent carcass doesn't block child clicks
  // and disposeThreeHierarchy knows to protect shared template GPU resources
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

/**
 * Internal helper to download and parse glTF / GLB via Three.js GLTFLoader.
 */
async function fetchAndParseGLTF(url: string): Promise<CachedAssetTemplate> {
  const loader = new GLTFLoader();

  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    loader.load(
      url,
      (loaded) => resolve(loaded),
      undefined,
      (err) => reject(err),
    );
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
  };
}
