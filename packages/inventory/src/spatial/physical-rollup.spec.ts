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

  it("falls back to a physically-valid parentId while un-backfilled", () => {
    const cab = loc("cab", "cabinet");
    const drw = loc("drw", "drawer", "cab"); // canonical, containerId null
    expect(resolvePhysicalContainerId(drw, byId([cab, drw]))).toBe("cab");
  });

  it("does NOT fall back along a violation edge (organizational parent ≠ physical)", () => {
    const cab = loc("cab", "cabinet");
    const bin = loc("bin", "bin", "cab"); // cabinet → bin is a violation
    expect(resolvePhysicalContainerId(bin, byId([cab, bin]))).toBeNull();
  });

  it("does NOT fall back for shelf → shelf", () => {
    const s1 = loc("s1", "shelf");
    const s2 = loc("s2", "shelf", "s1");
    expect(resolvePhysicalContainerId(s2, byId([s1, s2]))).toBeNull();
  });

  it("returns null for an unparented location with no containerId", () => {
    const cab = loc("cab", "cabinet");
    expect(resolvePhysicalContainerId(cab, byId([cab]))).toBeNull();
  });

  it("returns null for a dangling parent", () => {
    const drw = loc("drw", "drawer", "missing");
    expect(resolvePhysicalContainerId(drw, byId([drw]))).toBeNull();
  });

  it("honours legacyParentFallback=false (Phase 5 behaviour)", () => {
    const cab = loc("cab", "cabinet");
    const drw = loc("drw", "drawer", "cab");
    expect(
      resolvePhysicalContainerId(drw, byId([cab, drw]), {
        legacyParentFallback: false,
      }),
    ).toBeNull();
  });

  it("accepts a context-root fallback (warehouse owns a rack)", () => {
    const wh = loc("wh", "warehouse");
    const rack = loc("rack", "rack", "wh");
    expect(resolvePhysicalContainerId(rack, byId([wh, rack]))).toBe("wh");
  });

  it("accepts a legacy-compatible fallback (tray → bin)", () => {
    const tray = loc("tray", "tray");
    const bin = loc("bin", "bin", "tray");
    expect(resolvePhysicalContainerId(bin, byId([tray, bin]))).toBe("tray");
  });
});

describe("collectPhysicalSubtreeIds", () => {
  it("includes the root itself so a leaf aggregates its own stock", () => {
    const bin = loc("bin", "bin");
    expect(collectPhysicalSubtreeIds("bin", [bin])).toEqual(["bin"]);
  });

  it("rolls up a valid container subtree", () => {
    const cab = loc("cab", "cabinet", null, null);
    const drw = loc("drw", "drawer", "org", "cab");
    const bin = loc("bin", "bin", null, "drw");
    const ids = collectPhysicalSubtreeIds("cab", [cab, drw, bin]);
    expect(new Set(ids)).toEqual(new Set(["cab", "drw", "bin"]));
  });

  it("does NOT roll up across an organizational-only invalid edge", () => {
    // A cabinet with an organizational child bin, no containerId anywhere.
    // cabinet → bin is a violation, so no physical rollup may occur.
    const cab = loc("cab", "cabinet");
    const bin = loc("bin", "bin", "cab");
    const ids = collectPhysicalSubtreeIds("cab", [cab, bin]);
    expect(ids).toEqual(["cab"]);
  });

  it("does roll up once the physical container is populated, even with a violation parentId", () => {
    // The backfill sets containerId; the organizational parentId stays a
    // violation. Physical rollup follows containerId.
    const cab = loc("cab", "cabinet");
    const bin = loc("bin", "bin", "cab", "cab");
    const ids = collectPhysicalSubtreeIds("cab", [cab, bin]);
    expect(new Set(ids)).toEqual(new Set(["cab", "bin"]));
  });

  it("handles mixed organizational and physical hierarchies", () => {
    // warehouse (context root) owns cabinet + rack physically.
    // A drawer is physically in the cabinet; a bin is physically in the drawer.
    // One cabinet is organizationally (but not physically) under the rack.
    const wh = loc("wh", "warehouse");
    const rack = loc("rack", "rack", "wh", "wh");
    const cab = loc("cab", "cabinet", "wh", "wh");
    const drw = loc("drw", "drawer", "cab", "cab");
    const bin = loc("bin", "bin", "drw", "drw");
    const strayCab = loc("stray", "cabinet", "rack", null); // org-only under rack

    const ids = collectPhysicalSubtreeIds("wh", [wh, rack, cab, drw, bin, strayCab]);
    // warehouse physically contains rack + cabinet, then drawer, then bin.
    // `strayCab` is only organizationally under the rack, and `rack → cabinet`
    // is NOT canonical (a rack's only canonical child is a shelf) and the rack
    // is not a context root, so it has no physical container and is EXCLUDED.
    expect(new Set(ids)).toEqual(
      new Set(["wh", "rack", "cab", "drw", "bin"]),
    );
  });

  it("excludes an organizational-only branch when the edge is a violation", () => {
    const wh = loc("wh", "warehouse");
    const rack = loc("rack", "rack", "wh", "wh");
    const shelf = loc("shelf", "shelf", "rack", "rack");
    const badBin = loc("bad", "bin", "rack", "rack"); // rack → bin violation, but containerId set by test
    // Without a containerId, the rack-organizational bin has no physical parent.
    const orgOnlyBin = loc("orgbin", "bin", "rack", null);

    const ids = collectPhysicalSubtreeIds("rack", [
      wh,
      rack,
      shelf,
      badBin,
      orgOnlyBin,
    ]);
    // badBin is physically in the rack (containerId), so included;
    // orgOnlyBin is only organizationally under the rack → excluded.
    expect(new Set(ids)).toEqual(new Set(["rack", "shelf", "bad"]));
  });

  it("terminates on a malformed container cycle", () => {
    const a = loc("a", "cabinet", null, "b");
    const b = loc("b", "shelf", null, "a");
    const ids = collectPhysicalSubtreeIds("a", [a, b]);
    expect(new Set(ids)).toEqual(new Set(["a", "b"]));
  });
});