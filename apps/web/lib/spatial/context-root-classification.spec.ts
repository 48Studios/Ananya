import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { isContextRootCategory, canRootPhysicalEquipment } from "@ananya/inventory";

/**
 * The location list page derives its "Facilities" KPI from the canonical
 * context-root predicate. The web package has no DOM test harness, so the
 * rendered count cannot be exercised here; these tests pin (a) the predicate's
 * classification contract and (b) the page's wiring, mirroring the
 * source-scanning convention used by `inventory-builder-inactive-parent.spec.ts`.
 *
 * The predicate answers exactly one question — "may this space category own
 * physical equipment?" — and must never be a general containment check.
 */
const pagePath = path.join(
  __dirname,
  "..",
  "..",
  "app",
  "inventory",
  "locations",
  "page.tsx",
);

describe("context-root classification", () => {
  it("classifies the three space categories as context roots", () => {
    for (const kind of ["warehouse", "room_area", "aisle"]) {
      expect(isContextRootCategory(kind)).toBe(true);
      expect(canRootPhysicalEquipment(kind)).toBe(true);
    }
  });

  it("classifies legacy context aliases through canonical normalization", () => {
    expect(isContextRootCategory("room")).toBe(true);
    expect(isContextRootCategory("area")).toBe(true);
    expect(isContextRootCategory("ROOM_AREA")).toBe(true);
  });

  it("never classifies a physical category as a context root", () => {
    for (const kind of [
      "rack",
      "shelf",
      "cabinet",
      "dry_cabinet",
      "bin",
      "drawer",
      "compartment",
      "reel_rack",
      "reel_slot",
      "matrix_tray",
      "ic_tube_rail",
    ]) {
      expect(isContextRootCategory(kind)).toBe(false);
    }
  });

  it("treats unknown or empty kinds as non-context", () => {
    for (const kind of ["pallet", "zone", "building", "", null, undefined]) {
      expect(isContextRootCategory(kind)).toBe(false);
    }
  });

  it("derives the Facilities KPI from the canonical predicate, not an ad-hoc kind list", () => {
    const source = fs.readFileSync(pagePath, "utf8");
    expect(source).toContain("isContextRootCategory");
    // The previous hand-maintained context-kind list must be gone.
    expect(source).not.toContain('"room_area", "room", "aisle"');
    expect(source).not.toMatch(/["']warehouse["']\s*,\s*["']room_area["']/);
  });
});
