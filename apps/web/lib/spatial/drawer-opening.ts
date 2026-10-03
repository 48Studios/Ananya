import type { Vector3D } from "./spatial-3d-layout";

/**
 * Pure geometry & motion helpers for the Inventory Builder drawer-opening interaction.
 *
 * The interaction is intentionally view-only: it never mutates generated compartments,
 * slot identifiers, mappings, revisions, or persisted layout state. These helpers keep
 * the motion math deterministic and independent of Three.js so it can be unit tested.
 */

export type DrawerMotionPhase = "opening" | "open" | "closing" | "closed";

/**
 * Fraction of the compartment depth travelled at full extension. Slightly below 1.0 so
 * the tray clears the carcass opening without over-extending past the slide rails.
 */
export const DRAWER_EXTENSION_DEPTH_RATIO = 0.85;

/** Guards against sub-millimetre compartments producing invisible movement. */
export const MIN_DRAWER_EXTENSION_METERS = 0.03;

/** Keeps deep compartments (e.g. pallet rack bays) from travelling across the scene. */
export const MAX_DRAWER_EXTENSION_METERS = 0.45;

export const DRAWER_OPEN_DURATION_SECONDS = 0.3;
export const DRAWER_CLOSE_DURATION_SECONDS = 0.24;

/**
 * Upper bound for a single animation step. A long main-thread stall (for example the
 * synchronous scene rebuild that follows a selection change) must not consume an entire
 * open/close animation in one frame, which would look like an abrupt position change.
 */
export const MAX_DRAWER_FRAME_DELTA_SECONDS = 1 / 20;

/**
 * Resolves the travel distance for a compartment of the given depth (in meters).
 * @param depthMeters compartment depth along its opening axis
 */
export function computeDrawerExtension(depthMeters: number): number {
  const depth = Number.isFinite(depthMeters) ? Math.max(0, depthMeters) : 0;
  return Math.min(
    Math.max(depth * DRAWER_EXTENSION_DEPTH_RATIO, MIN_DRAWER_EXTENSION_METERS),
    MAX_DRAWER_EXTENSION_METERS,
  );
}

/**
 * Resolves the world-space direction of a compartment's local front (+Z) axis.
 * Compartments are authored with their front plate facing +Z, so translating along
 * this rotated axis is what slides a drawer straight out of its cabinet opening
 * regardless of how the compartment itself is oriented.
 */
export function resolveDrawerFrontAxis(rotation: Vector3D): Vector3D {
  const cosX = Math.cos(rotation.x);
  const sinX = Math.sin(rotation.x);
  const cosY = Math.cos(rotation.y);
  const sinY = Math.sin(rotation.y);
  // Third column of the Three.js XYZ Euler rotation matrix applied to (0, 0, 1).
  return { x: sinY, y: -sinX * cosY, z: cosX * cosY };
}

export interface DrawerMotion {
  locationId: string;
  /** Progress when this motion began (0 = closed, 1 = fully open). */
  from: number;
  /** Target progress (0 = closed, 1 = open). */
  to: number;
  /** Current eased progress. */
  progress: number;
  elapsed: number;
  /** Seconds; 0 snaps immediately (reduced-motion preference). */
  duration: number;
  extensionMeters: number;
}

export function easeDrawerProgress(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

export function createDrawerMotion(params: {
  locationId: string;
  from?: number;
  to: 0 | 1;
  duration: number;
  extensionMeters: number;
}): DrawerMotion {
  const from = params.from ?? 0;
  const duration = Math.max(0, params.duration);
  return {
    locationId: params.locationId,
    from,
    to: params.to,
    progress: duration === 0 ? params.to : from,
    elapsed: 0,
    duration,
    extensionMeters: params.extensionMeters,
  };
}

/**
 * Advances a motion by the frame delta. Settled motions are returned unchanged so the
 * render loop can skip redundant work once a compartment has reached a stable state.
 */
export function advanceDrawerMotion(
  motion: DrawerMotion,
  deltaSeconds: number,
): DrawerMotion {
  if (motion.elapsed >= motion.duration) return motion;
  const delta = Number.isFinite(deltaSeconds)
    ? Math.min(Math.max(0, deltaSeconds), MAX_DRAWER_FRAME_DELTA_SECONDS)
    : 0;
  const elapsed = Math.min(motion.duration, motion.elapsed + delta);
  const eased = easeDrawerProgress(elapsed / motion.duration);
  return {
    ...motion,
    elapsed,
    progress: motion.from + (motion.to - motion.from) * eased,
  };
}

export function isDrawerMotionSettled(motion: DrawerMotion): boolean {
  return motion.elapsed >= motion.duration;
}

export function getDrawerMotionPhase(motion: DrawerMotion): DrawerMotionPhase {
  const settled = isDrawerMotionSettled(motion);
  if (motion.to === 1) return settled ? "open" : "opening";
  return settled ? "closed" : "closing";
}

/** Signed travel distance along the opening axis, in meters. */
export function drawerOffsetMeters(motion: DrawerMotion): number {
  return motion.progress * motion.extensionMeters;
}

/**
 * Drops motion entries whose compartments no longer exist in the current scene
 * (template switch, layout reload, or selection invalidation), so no orphaned
 * animation state survives a rebuild.
 */
export function pruneDrawerMotions(
  motions: Map<string, DrawerMotion>,
  availableLocationIds: Iterable<string>,
): { motions: Map<string, DrawerMotion>; removedLocationIds: string[] } {
  const available = new Set(availableLocationIds);
  const removedLocationIds: string[] = [];
  const next = new Map<string, DrawerMotion>();
  for (const [locationId, motion] of motions) {
    if (available.has(locationId)) {
      next.set(locationId, motion);
    } else {
      removedLocationIds.push(locationId);
    }
  }
  return { motions: next, removedLocationIds };
}

/**
 * Single active-open-drawer invariant: at most one compartment may be extended.
 * Returns the identifier that should remain open (or null) given the requested target.
 */
export function resolveActiveDrawerId(
  currentActiveId: string | null,
  requestedId: string,
  isToggleOff: boolean,
): string | null {
  if (isToggleOff) return null;
  if (currentActiveId === requestedId) return currentActiveId;
  return requestedId;
}

export type OpenTrayPartName =
  "floor" | "left-wall" | "right-wall" | "back-wall";

export interface OpenTrayPart {
  name: OpenTrayPartName;
  /** Box size in meters. */
  size: Vector3D;
  /** Box centre in compartment-local meters. */
  position: Vector3D;
}

export interface OpenTrayGeometry {
  /**
   * Outer envelope of the tray body. Matches the closed slab body it replaces so
   * compartment dimensions, rail alignment, and front-plate placement are preserved.
   */
  envelope: {
    width: number;
    height: number;
    depth: number;
    centerZ: number;
  };
  wallThickness: number;
  /** Floor, both sides, and the back wall. The front stays open behind the face plate. */
  parts: OpenTrayPart[];
}

/**
 * Derives the hollow, open-top tray body used by openable compartments.
 * Pure geometry so the "drawer front + visible interior" contract can be unit tested.
 */
export function computeOpenTrayGeometry(
  dimensions: Vector3D,
  faceThickness: number,
): OpenTrayGeometry {
  const width = dimensions.x * 0.92;
  const height = dimensions.y * 0.88;
  const depth = Math.max(0.02, dimensions.z - faceThickness);
  const centerZ = -faceThickness / 2;
  const wallThickness = Math.min(
    0.006,
    width * 0.05,
    height * 0.08,
    depth * 0.08,
  );
  const wall = wallThickness;
  const backZ = centerZ - depth / 2 + wall / 2;

  return {
    envelope: { width, height, depth, centerZ },
    wallThickness: wall,
    parts: [
      {
        name: "floor",
        size: { x: width, y: wall, z: depth },
        position: { x: 0, y: -height / 2 + wall / 2, z: centerZ },
      },
      {
        name: "left-wall",
        size: { x: wall, y: height - wall, z: depth },
        position: { x: -width / 2 + wall / 2, y: wall / 2, z: centerZ },
      },
      {
        name: "right-wall",
        size: { x: wall, y: height - wall, z: depth },
        position: { x: width / 2 - wall / 2, y: wall / 2, z: centerZ },
      },
      {
        name: "back-wall",
        size: { x: width - 2 * wall, y: height - wall, z: wall },
        position: { x: 0, y: wall / 2, z: backZ },
      },
    ],
  };
}
