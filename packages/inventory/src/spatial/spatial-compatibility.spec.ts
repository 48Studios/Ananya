import { describe, expect, it } from "vitest";
import {
  INCOMPATIBLE_MAPPING_STALE_PREFIX,
  SLOT_CANDIDATE_KINDS,
  checkSpatialMappingCompatibility,
  checkRootTypeCompatibility,
  classifySpatialKind,
  describeSpatialCompatibility,
  isSpatialSpaceKind,
  isSpatiallyCompatible,
  isTemplateRootCompatible,
  normalizeSpatialKind,
  resolveSlotCandidateKinds,
} from "./spatial-compatibility";

describe("spatial kind classification", () => {
  it("normalizes case, whitespace and separators", () => {
    expect(normalizeSpatialKind(" Dry Cabinet ")).toBe("dry_cabinet");
    expect(normalizeSpatialKind("reel-rack")).toBe("reel_rack");
    expect(normalizeSpatialKind(null)).toBe("");
  });

  describe("root/container compatibility", () => {
    it.each([
      ["rack", "rack"],
      ["rack", "shelf"],
      ["cabinet", "cabinet"],
      ["cabinet", "dry_cabinet"],
    ])("allows %s roots to use compatible %s candidates", (root, candidate) => {
      expect(checkRootTypeCompatibility(root, candidate).compatible).toBe(true);
    });

    it.each([
      ["rack", "cabinet"],
      ["cabinet", "rack"],
    ])("rejects %s roots from %s candidates", (root, candidate) => {
      expect(checkRootTypeCompatibility(root, candidate).compatible).toBe(false);
    });

    it("keeps template root candidates separate from slot candidates", () => {
      expect(isTemplateRootCompatible("SMD_DRAWER_CABINET", "cabinet")).toBe(true);
      expect(isTemplateRootCompatible("SMD_DRAWER_CABINET", "drawer")).toBe(false);
      expect(isTemplateRootCompatible("PALLET_RACK", "rack")).toBe(true);
      expect(isTemplateRootCompatible("PALLET_RACK", "cabinet")).toBe(false);
    });
  });

  it("classifies space kinds", () => {
    for (const kind of ["warehouse", "room", "building", "facility", "zone", "aisle"]) {
      expect(classifySpatialKind(kind)).toBe("space");
      expect(isSpatialSpaceKind(kind)).toBe(true);
    }
    expect(isSpatialSpaceKind(" Aisle ")).toBe(true);
  });

  it("classifies container and compartment kinds", () => {
    for (const kind of ["rack", "shelf", "cabinet", "dry_cabinet", "reel_rack"]) {
      expect(classifySpatialKind(kind)).toBe("container");
    }
    for (const kind of ["drawer", "bin", "compartment", "slot", "reel_slot", "tray", "tube"]) {
      expect(classifySpatialKind(kind)).toBe("compartment");
    }
  });

  it("leaves kinds the domain does not define unclassified", () => {
    expect(classifySpatialKind("pallet")).toBe("unclassified");
    expect(classifySpatialKind("")).toBe("unclassified");
    expect(classifySpatialKind(undefined)).toBe("unclassified");
  });
});

describe("slot candidate kinds", () => {
  it("exposes the template-derived candidate table", () => {
    expect(resolveSlotCandidateKinds("drawer")).toEqual([
      "drawer",
      "bin",
      "compartment",
    ]);
    expect(resolveSlotCandidateKinds("bin")).toEqual(["bin", "compartment", "tray"]);
    expect(resolveSlotCandidateKinds("slot")).toEqual(
      expect.arrayContaining(["bin", "tray", "compartment"]),
    );
    expect(resolveSlotCandidateKinds("shelf")).toEqual(
      expect.arrayContaining(["shelf", "rack", "cabinet"]),
    );
    expect(resolveSlotCandidateKinds(null)).toEqual([]);
  });

  it("keeps every declared slot kind in the table", () => {
    expect(Object.keys(SLOT_CANDIDATE_KINDS).sort()).toEqual([
      "bin",
      "drawer",
      "shelf",
      "slot",
    ]);
  });
});

describe("mapping compatibility", () => {
  it("accepts the same-kind pairs the parametric templates generate", () => {
    expect(
      isSpatiallyCompatible({
        rootKind: "cabinet",
        candidateKind: "drawer",
        slotKind: "drawer",
      }),
    ).toBe(true);
    expect(
      isSpatiallyCompatible({
        rootKind: "cabinet",
        candidateKind: "bin",
        slotKind: "bin",
      }),
    ).toBe(true);
    expect(
      isSpatiallyCompatible({ rootKind: "rack", candidateKind: "shelf", slotKind: "shelf" }),
    ).toBe(true);
    expect(
      isSpatiallyCompatible({ rootKind: "tray", candidateKind: "bin", slotKind: "slot" }),
    ).toBe(true);
  });

  it("accepts the demo warehouse bay plan (pallet bays holding storage units)", () => {
    for (const candidateKind of ["cabinet", "rack", "shelf"]) {
      expect(
        isSpatiallyCompatible({
          rootKind: "warehouse",
          candidateKind,
          slotKind: "shelf",
        }),
      ).toBe(true);
    }
  });

  it("rejects a rack location mapped into a cabinet drawer slot", () => {
    const verdict = checkSpatialMappingCompatibility({
      rootKind: "cabinet",
      candidateKind: "rack",
      slotKind: "drawer",
    });
    expect(verdict.compatible).toBe(false);
    expect(verdict.code).toBe("SLOT_KIND");
    expect(verdict.reason).toContain(INCOMPATIBLE_MAPPING_STALE_PREFIX);
    expect(verdict.reason).toContain('"drawer"');
    expect(verdict.reason).toContain('"rack"');
  });

  it("rejects a drawer location mapped into a pallet bay", () => {
    expect(
      isSpatiallyCompatible({
        rootKind: "rack",
        candidateKind: "drawer",
        slotKind: "shelf",
      }),
    ).toBe(false);
  });

  it("accepts a nested bin location in a cabinet drawer slot", () => {
    expect(
      isSpatiallyCompatible({
        rootKind: "cabinet",
        candidateKind: "bin",
        slotKind: "drawer",
      }),
    ).toBe(true);
  });

  it("rejects space kinds as compartment candidates regardless of slot kind", () => {
    for (const candidateKind of ["warehouse", "room", "aisle", "zone"]) {
      const verdict = checkSpatialMappingCompatibility({
        rootKind: "warehouse",
        candidateKind,
        slotKind: "shelf",
      });
      expect(verdict.compatible).toBe(false);
      expect(verdict.code).toBe("SPACE_CANDIDATE");
    }
  });

  it("reports the space violation even when no slot kind is supplied", () => {
    expect(
      checkSpatialMappingCompatibility({ candidateKind: "room" }).code,
    ).toBe("SPACE_CANDIDATE");
  });

  it("rejects unknown kinds when the slot kind is known, and allows them without a slot rule", () => {
    expect(
      isSpatiallyCompatible({
        rootKind: "rack",
        candidateKind: "pallet",
        slotKind: "shelf",
      }),
    ).toBe(false);
    expect(
      isSpatiallyCompatible({
        rootKind: "rack",
        candidateKind: "pallet",
        slotKind: null,
      }),
    ).toBe(true);
  });

  it("classifies both ends of the check", () => {
    const verdict = checkSpatialMappingCompatibility({
      rootKind: "Warehouse",
      candidateKind: "Cabinet",
      slotKind: "shelf",
    });
    expect(verdict.rootClass).toBe("space");
    expect(verdict.candidateClass).toBe("container");
    expect(verdict.compatible).toBe(true);
  });

  it("produces a stable reason string for stale-flag signatures", () => {
    const first = checkSpatialMappingCompatibility({
      candidateKind: "rack",
      slotKind: "drawer",
    }).reason;
    const second = checkSpatialMappingCompatibility({
      candidateKind: " RACK ",
      slotKind: "drawer",
    }).reason;
    expect(first).toBe(second);
  });

  it("describes allowed and rejected verdicts for the audit matrix", () => {
    expect(describeSpatialCompatibility("rack", "shelf", "shelf")).toMatch(/^allowed/);
    expect(describeSpatialCompatibility("cabinet", "rack", "drawer")).toMatch(
      /^rejected \(SLOT_KIND\)/,
    );
    expect(describeSpatialCompatibility("warehouse", "room", "shelf")).toMatch(
      /^rejected \(SPACE_CANDIDATE\)/,
    );
  });
});
