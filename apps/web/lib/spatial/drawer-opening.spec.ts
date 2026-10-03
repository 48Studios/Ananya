import { describe, expect, it } from "vitest";
import {
  DRAWER_CLOSE_DURATION_SECONDS,
  DRAWER_EXTENSION_DEPTH_RATIO,
  DRAWER_OPEN_DURATION_SECONDS,
  MAX_DRAWER_EXTENSION_METERS,
  advanceDrawerMotion,
  computeDrawerExtension,
  computeOpenTrayGeometry,
  createDrawerMotion,
  drawerOffsetMeters,
  easeDrawerProgress,
  getDrawerMotionPhase,
  isDrawerMotionSettled,
  pruneDrawerMotions,
  resolveActiveDrawerId,
  resolveDrawerFrontAxis,
  type DrawerMotion,
} from "./drawer-opening";
import { mmToMeters } from "./spatial-3d-layout";

/** Default SMD drawer cabinet: 300mm deep carcass with a 15mm front wall. */
const DEFAULT_DRAWER_DEPTH_M = mmToMeters(285);

function advanceFor(motion: DrawerMotion, seconds: number, steps = 30) {
  let next = motion;
  for (let i = 0; i < steps; i += 1) {
    next = advanceDrawerMotion(next, seconds / steps);
  }
  return next;
}

describe("computeDrawerExtension", () => {
  it("scales with compartment depth", () => {
    expect(computeDrawerExtension(DEFAULT_DRAWER_DEPTH_M)).toBeCloseTo(
      DEFAULT_DRAWER_DEPTH_M * DRAWER_EXTENSION_DEPTH_RATIO,
      6,
    );
  });

  it("keeps deep compartments (pallet rack bays) within the travel cap", () => {
    expect(computeDrawerExtension(mmToMeters(1100))).toBe(
      MAX_DRAWER_EXTENSION_METERS,
    );
  });

  it("never returns a non-positive travel distance", () => {
    expect(computeDrawerExtension(0)).toBeGreaterThan(0);
    expect(computeDrawerExtension(-5)).toBeGreaterThan(0);
    expect(computeDrawerExtension(Number.NaN)).toBeGreaterThan(0);
  });
});

describe("resolveDrawerFrontAxis", () => {
  it("opens toward the viewer along +Z for the default (unrotated) orientation", () => {
    const axis = resolveDrawerFrontAxis({ x: 0, y: 0, z: 0 });
    expect(axis.x).toBeCloseTo(0, 12);
    expect(axis.y).toBeCloseTo(0, 12);
    expect(axis.z).toBeCloseTo(1, 12);
  });

  it("follows the compartment's rotated front instead of assuming a world axis", () => {
    // +90deg about Y turns the front face toward +X
    const yawed = resolveDrawerFrontAxis({ x: 0, y: Math.PI / 2, z: 0 });
    expect(yawed.x).toBeCloseTo(1, 12);
    expect(yawed.y).toBeCloseTo(0, 12);
    expect(yawed.z).toBeCloseTo(0, 12);

    // -90deg about Y turns the front face toward -X
    const yawedBack = resolveDrawerFrontAxis({ x: 0, y: -Math.PI / 2, z: 0 });
    expect(yawedBack.x).toBeCloseTo(-1, 12);
    expect(yawedBack.z).toBeCloseTo(0, 12);

    // +90deg about X tips the front face downward
    const pitched = resolveDrawerFrontAxis({ x: Math.PI / 2, y: 0, z: 0 });
    expect(pitched.y).toBeCloseTo(-1, 12);
    expect(pitched.z).toBeCloseTo(0, 12);
  });

  it("always returns a unit vector for arbitrary rotations", () => {
    const axis = resolveDrawerFrontAxis({ x: 0.4, y: -1.1, z: 0.7 });
    const length = Math.hypot(axis.x, axis.y, axis.z);
    expect(length).toBeCloseTo(1, 12);
  });
});

describe("drawer motion state machine", () => {
  it("starts closed and progresses monotonically to fully open", () => {
    const motion = createDrawerMotion({
      locationId: "drawer_slot_r0_c0",
      to: 1,
      duration: DRAWER_OPEN_DURATION_SECONDS,
      extensionMeters: computeDrawerExtension(DEFAULT_DRAWER_DEPTH_M),
    });

    expect(getDrawerMotionPhase(motion)).toBe("opening");
    expect(motion.progress).toBe(0);

    let previous = motion.progress;
    for (let i = 0; i < 20; i += 1) {
      const next = advanceDrawerMotion(
        motion,
        DRAWER_OPEN_DURATION_SECONDS / 20,
      );
      expect(next.progress).toBeGreaterThanOrEqual(previous);
      previous = next.progress;
    }

    const settled = advanceFor(motion, DRAWER_OPEN_DURATION_SECONDS);
    expect(settled.progress).toBe(1);
    expect(getDrawerMotionPhase(settled)).toBe("open");
    expect(isDrawerMotionSettled(settled)).toBe(true);
    expect(drawerOffsetMeters(settled)).toBe(settled.extensionMeters);
  });

  it("returns to exactly the original position when closed", () => {
    const opened = advanceFor(
      createDrawerMotion({
        locationId: "drawer_slot_r0_c0",
        to: 1,
        duration: DRAWER_OPEN_DURATION_SECONDS,
        extensionMeters: 0.242,
      }),
      DRAWER_OPEN_DURATION_SECONDS,
    );

    const closing = createDrawerMotion({
      locationId: "drawer_slot_r0_c0",
      from: opened.progress,
      to: 0,
      duration: DRAWER_CLOSE_DURATION_SECONDS,
      extensionMeters: opened.extensionMeters,
    });
    expect(getDrawerMotionPhase(closing)).toBe("closing");

    const closed = advanceFor(closing, DRAWER_CLOSE_DURATION_SECONDS);
    expect(closed.progress).toBe(0);
    expect(drawerOffsetMeters(closed)).toBe(0);
    expect(getDrawerMotionPhase(closed)).toBe("closed");
  });

  it("reverses from the current progress without jumping when another drawer is selected", () => {
    const opening = createDrawerMotion({
      locationId: "drawer_slot_r0_c0",
      to: 1,
      duration: DRAWER_OPEN_DURATION_SECONDS,
      extensionMeters: 0.242,
    });
    const halfway = advanceFor(opening, DRAWER_OPEN_DURATION_SECONDS / 2, 10);
    expect(halfway.progress).toBeGreaterThan(0.4);
    expect(halfway.progress).toBeLessThan(0.6);

    const closing = createDrawerMotion({
      locationId: "drawer_slot_r0_c0",
      from: halfway.progress,
      to: 0,
      duration: DRAWER_CLOSE_DURATION_SECONDS,
      extensionMeters: halfway.extensionMeters,
    });
    expect(closing.progress).toBe(halfway.progress);
    expect(closing.extensionMeters).toBe(halfway.extensionMeters);
    expect(getDrawerMotionPhase(closing)).toBe("closing");
  });

  it("snaps instantly when motion is reduced (zero duration)", () => {
    const motion = createDrawerMotion({
      locationId: "drawer_slot_r0_c0",
      to: 1,
      duration: 0,
      extensionMeters: 0.242,
    });
    expect(motion.progress).toBe(1);
    expect(getDrawerMotionPhase(motion)).toBe("open");
    expect(advanceDrawerMotion(motion, 1)).toBe(motion);

    const closed = createDrawerMotion({
      locationId: "drawer_slot_r0_c0",
      from: 1,
      to: 0,
      duration: 0,
      extensionMeters: 0.242,
    });
    expect(closed.progress).toBe(0);
    expect(getDrawerMotionPhase(closed)).toBe("closed");
  });

  it("treats settled motions as immutable so the render loop can skip them", () => {
    const settled = advanceFor(
      createDrawerMotion({
        locationId: "drawer_slot_r0_c0",
        to: 1,
        duration: DRAWER_OPEN_DURATION_SECONDS,
        extensionMeters: 0.2,
      }),
      DRAWER_OPEN_DURATION_SECONDS * 2,
    );
    expect(advanceDrawerMotion(settled, 0.5)).toBe(settled);
  });

  it("clamps long frame stalls so a rebuild cannot teleport a drawer open", () => {
    const stalled = createDrawerMotion({
      locationId: "drawer_slot_r0_c0",
      to: 1,
      duration: DRAWER_OPEN_DURATION_SECONDS,
      extensionMeters: 0.242,
    });
    // A 300ms main-thread stall (e.g. a synchronous scene rebuild) must not consume
    // the whole 300ms animation in a single frame.
    const afterStall = advanceDrawerMotion(stalled, 0.3);
    expect(afterStall.progress).toBeLessThan(0.5);
    expect(getDrawerMotionPhase(afterStall)).toBe("opening");

    // The motion still completes once enough frames have elapsed.
    const finished = advanceFor(stalled, DRAWER_OPEN_DURATION_SECONDS * 2);
    expect(finished.progress).toBe(1);
  });

  it("keeps easing monotonic and clamped between eased endpoints", () => {
    expect(easeDrawerProgress(-1)).toBe(0);
    expect(easeDrawerProgress(0)).toBe(0);
    expect(easeDrawerProgress(0.5)).toBeCloseTo(0.5, 12);
    expect(easeDrawerProgress(1)).toBe(1);
    expect(easeDrawerProgress(2)).toBe(1);
  });
});

describe("pruneDrawerMotions", () => {
  it("drops motion state for compartments that no longer exist", () => {
    const motions = new Map<string, DrawerMotion>([
      [
        "drawer_slot_r0_c0",
        createDrawerMotion({
          locationId: "drawer_slot_r0_c0",
          to: 1,
          duration: 0.3,
          extensionMeters: 0.2,
        }),
      ],
      [
        "drawer_slot_r0_c1",
        createDrawerMotion({
          locationId: "drawer_slot_r0_c1",
          to: 1,
          duration: 0.3,
          extensionMeters: 0.2,
        }),
      ],
    ]);

    const result = pruneDrawerMotions(motions, ["drawer_slot_r0_c0"]);
    expect([...result.motions.keys()]).toEqual(["drawer_slot_r0_c0"]);
    expect(result.removedLocationIds).toEqual(["drawer_slot_r0_c1"]);
    // The original map is never mutated in place.
    expect(motions.size).toBe(2);
  });
});

describe("resolveActiveDrawerId", () => {
  it("enforces a single active open drawer", () => {
    expect(resolveActiveDrawerId(null, "a", false)).toBe("a");
    expect(resolveActiveDrawerId("a", "b", false)).toBe("b");
    expect(resolveActiveDrawerId("a", "a", false)).toBe("a");
  });

  it("clears the active drawer when toggled closed", () => {
    expect(resolveActiveDrawerId("a", "a", true)).toBeNull();
  });
});

describe("computeOpenTrayGeometry", () => {
  const dim = {
    x: mmToMeters(55.2),
    y: mmToMeters(143.33),
    z: mmToMeters(285),
  };
  const faceThickness = Math.min(0.015, dim.z * 0.1);

  it("keeps the outer envelope of the closed slab body it replaces", () => {
    const tray = computeOpenTrayGeometry(dim, faceThickness);
    expect(tray.envelope.width).toBeCloseTo(dim.x * 0.92, 12);
    expect(tray.envelope.height).toBeCloseTo(dim.y * 0.88, 12);
    expect(tray.envelope.depth).toBeCloseTo(dim.z - faceThickness, 12);
    // The tray is centred behind the face plate, exactly where the slab body sat.
    expect(tray.envelope.centerZ).toBeCloseTo(-faceThickness / 2, 12);
  });

  it("models a floor, two sides, and a back wall only", () => {
    const tray = computeOpenTrayGeometry(dim, faceThickness);
    expect(tray.parts.map((part) => part.name).sort()).toEqual([
      "back-wall",
      "floor",
      "left-wall",
      "right-wall",
    ]);
  });

  it("leaves the front open so the interior is inspectable", () => {
    const tray = computeOpenTrayGeometry(dim, faceThickness);
    const frontZ = tray.envelope.centerZ + tray.envelope.depth / 2;
    for (const part of tray.parts) {
      // No wall crosses the front plane of the tray body.
      const partFront = part.position.z + part.size.z / 2;
      expect(partFront).toBeLessThanOrEqual(frontZ + 1e-12);
    }
    // Only the back wall sits at the rear; the front face plate stays separate.
    const backWall = tray.parts.find((part) => part.name === "back-wall")!;
    expect(backWall.position.z).toBeLessThan(tray.envelope.centerZ);
  });

  it("keeps the interior clear dims inside the tray envelope", () => {
    const tray = computeOpenTrayGeometry(dim, faceThickness);
    for (const part of tray.parts) {
      const maxX = Math.abs(part.position.x) + part.size.x / 2;
      const maxZ =
        Math.abs(part.position.z - tray.envelope.centerZ) + part.size.z / 2;
      expect(maxX).toBeLessThanOrEqual(tray.envelope.width / 2 + 1e-12);
      expect(maxZ).toBeLessThanOrEqual(tray.envelope.depth / 2 + 1e-12);
    }
  });

  it("never produces a non-positive wall thickness", () => {
    const tiny = computeOpenTrayGeometry(
      { x: mmToMeters(10), y: mmToMeters(6), z: mmToMeters(12) },
      0.001,
    );
    expect(tiny.wallThickness).toBeGreaterThan(0);
    for (const part of tiny.parts) {
      expect(part.size.x).toBeGreaterThan(0);
      expect(part.size.y).toBeGreaterThan(0);
      expect(part.size.z).toBeGreaterThan(0);
    }
  });
});
