import { describe, expect, it } from "vitest";
import {
  collectPhysicalSubtreeIds,
  resolvePhysicalContainerId,
  type PhysicalRollupLocation,
} from "./physical-rollup";

/**
 * RFC-0069 Phase 4 — physical stock rollup over `containerId`.
 *
 * The physical rollup must follow PHYSICAL containment only. Organizational
 * `parentId` must never create a physical rollup for a physically-invalid edge,
 * and the staged fallback must keep currently-valid relationships working while
 * `containerId` is only partially populated.
 */

const loc = (
  id: string,
  kind: string,
  parentId: string | null = null,
  containerId: string | null = null,
): PhysicalRollupLocation => ({ id, kind, parentId, containerId });

const byId = (locations: PhysicalRollupLocation[]) =>
  new Map(locations.map((l) => [l.id, l]));

describe("resolvePhysicalContainerId", () => {
  it("prefers containerId when set", () => {
    const cab = loc("cab", "cabinet");
    const drw = loc("drw", "drawer", "org-other", "cab");
    expect(resolvePhysicalContainerId(drw, byId([cab, drw]))).toBe("cab");
  });

  it("returns null by default when containerId is null even if parentId is canonical (Phase 4A)", () => {
    const cab = loc("cab", "cabinet");
    const drw = loc("drw", "drawer", "cab", null); // canonical parent, but containerId is null
    expect(resolvePhysicalContainerId(drw, byId([cab, drw]))).toBeNull();
  });

  it("falls back to a physically-valid parentId ONLY when legacyParentFallback: true is explicitly passed", () => {
    const cab = loc("cab", "cabinet");
    const drw = loc("drw", "drawer", "cab", null); // canonical, containerId null
    expect(
      resolvePhysicalContainerId(drw, byId([cab, drw]), {
        legacyParentFallback: true,
      }),
    ).toBe("cab");
  });

  it("does NOT fall back along a violation edge (cabinet → bin) even when legacyParentFallback: true", () => {
    const cab = loc("cab", "cabinet");
    const bin = loc("bin", "bin", "cab", null); // cabinet → bin is a violation
    expect(
      resolvePhysicalContainerId(bin, byId([cab, bin]), {
        legacyParentFallback: true,
      }),
    ).toBeNull();
  });

  it("does NOT fall back for shelf → shelf even when legacyParentFallback: true", () => {
    const s1 = loc("s1", "shelf");
    const s2 = loc("s2", "shelf", "s1", null);
    expect(
      resolvePhysicalContainerId(s2, byId([s1, s2]), {
        legacyParentFallback: true,
      }),
    ).toBeNull();
  });

  it("returns null for an unparented location with no containerId", () => {
    const cab = loc("cab", "cabinet");
    expect(resolvePhysicalContainerId(cab, byId([cab]))).toBeNull();
  });

  it("returns null for a dangling parent even when legacyParentFallback: true", () => {
    const drw = loc("drw", "drawer", "missing", null);
    expect(
      resolvePhysicalContainerId(drw, byId([drw]), {
        legacyParentFallback: true,
      }),
    ).toBeNull();
  });

  it("accepts a context-root fallback when legacyParentFallback: true (warehouse owns a rack)", () => {
    const wh = loc("wh", "warehouse");
    const rack = loc("rack", "rack", "wh", null);
    expect(
      resolvePhysicalContainerId(rack, byId([wh, rack]), {
        legacyParentFallback: true,
      }),
    ).toBe("wh");
  });

  it("accepts a legacy-compatible fallback when legacyParentFallback: true (tray → bin)", () => {
    const tray = loc("tray", "tray");
    const bin = loc("bin", "bin", "tray", null);
    expect(
      resolvePhysicalContainerId(bin, byId([tray, bin]), {
        legacyParentFallback: true,
      }),
    ).toBe("tray");
  });
});

describe("collectPhysicalSubtreeIds", () => {
  it("includes the root itself so a leaf aggregates its own stock", () => {
    const bin = loc("bin", "bin");
    expect(collectPhysicalSubtreeIds("bin", [bin])).toEqual(["bin"]);
  });

  it("Case A: Canonical physical hierarchy: cabinet → drawer → bin rolls up through containerId", () => {
    const cab = loc("cab", "cabinet", null, null);
    const drw = loc("drw", "drawer", "some-org", "cab");
    const bin = loc("bin", "bin", "some-org", "drw");
    const ids = collectPhysicalSubtreeIds("cab", [cab, drw, bin]);
    expect(new Set(ids)).toEqual(new Set(["cab", "drw", "bin"]));
  });

  it("Case B: Organizational-only parent: parentId without containerId does NOT participate in physical containment", () => {
    // drw has parentId = 'cab', but containerId is NULL.
    // Under Phase 4A, cab must NOT roll up drw.
    const cab = loc("cab", "cabinet");
    const drw = loc("drw", "drawer", "cab", null);
    const ids = collectPhysicalSubtreeIds("cab", [cab, drw]);
    expect(ids).toEqual(["cab"]);

    // drw still rolls up itself
    expect(collectPhysicalSubtreeIds("drw", [cab, drw])).toEqual(["drw"]);
  });

  it("Case C: Invalid legacy relationship: cabinet → bin with containerId NULL does NOT cause physical rollup", () => {
    const cab = loc("cab", "cabinet");
    const bin = loc("bin", "bin", "cab", null);
    const ids = collectPhysicalSubtreeIds("cab", [cab, bin]);
    expect(ids).toEqual(["cab"]);
  });

  it("Case D: Context root: warehouse → cabinet/rack rolls up correctly through containerId", () => {
    const wh = loc("wh", "warehouse", null, null);
    const cab = loc("cab", "cabinet", "wh", "wh");
    const rack = loc("rack", "rack", "wh", "wh");
    const shelf = loc("shelf", "shelf", "rack", "rack");
    const ids = collectPhysicalSubtreeIds("wh", [wh, cab, rack, shelf]);
    expect(new Set(ids)).toEqual(new Set(["wh", "cab", "rack", "shelf"]));
  });

  it("Case E: Parent/container divergence: physical rollup follows containerId, NOT parentId", () => {
    // Child is organizationally under orgRoot, but physically placed inside physContainer.
    const orgRoot = loc("org-root", "warehouse", null, null);
    const physContainer = loc("phys-cab", "cabinet", null, null);
    const item = loc("item-bin", "bin", "org-root", "phys-cab");

    // Rollup from orgRoot does NOT include item
    const orgIds = collectPhysicalSubtreeIds("org-root", [orgRoot, physContainer, item]);
    expect(orgIds).toEqual(["org-root"]);

    // Rollup from physContainer DOES include item
    const physIds = collectPhysicalSubtreeIds("phys-cab", [orgRoot, physContainer, item]);
    expect(new Set(physIds)).toEqual(new Set(["phys-cab", "item-bin"]));
  });

  it("Case F: Cycle protection: containerId cycles are guarded and terminate safely", () => {
    const a = loc("a", "cabinet", null, "b");
    const b = loc("b", "shelf", null, "a");
    const ids = collectPhysicalSubtreeIds("a", [a, b]);
    expect(new Set(ids)).toEqual(new Set(["a", "b"]));
  });

  it("Case G: Existing stock totals remain unchanged when valid physical relationships are represented via containerId", () => {
    const cab = loc("cab", "cabinet", null, null);
    const drw1 = loc("drw1", "drawer", "cab", "cab");
    const drw2 = loc("drw2", "drawer", "cab", "cab");
    const bin = loc("bin", "bin", "drw1", "drw1");

    const ids = collectPhysicalSubtreeIds("cab", [cab, drw1, drw2, bin]);
    expect(new Set(ids)).toEqual(new Set(["cab", "drw1", "drw2", "bin"]));
  });

  it("Architecture constraint: fails if physical rollup reverts to parentId", () => {
    // Location has canonical parentId 'cab', but containerId is explicitly null.
    // If code ever mistakenly reads parentId as physical containment,
    // collectPhysicalSubtreeIds('cab') would return ['cab', 'drw'].
    // Under RFC-0069 Phase 4A, it MUST return ['cab'].
    const cab = loc("cab", "cabinet", null, null);
    const drw = loc("drw", "drawer", "cab", null);

    const ids = collectPhysicalSubtreeIds("cab", [cab, drw]);
    expect(ids).toEqual(["cab"]);
  });
});