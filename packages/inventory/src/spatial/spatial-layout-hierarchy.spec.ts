import { describe, it, expect } from "vitest";
import {
  getAncestorChainIds,
  getPhysicalAncestorChainIds,
} from "./spatial-layout.types";

function parentMap(
  entries: Array<[id: string, parentId: string | null]>,
): Map<string, string | null> {
  return new Map(entries);
}

describe("getAncestorChainIds", () => {
  it("returns every link between the mapped location and the parent", () => {
    const byParent = parentMap([
      ["P", null],
      ["A", "P"],
      ["B", "A"],
      ["M", "B"],
    ]);

    expect(getAncestorChainIds(byParent, "P", "M")).toEqual(["M", "B", "A"]);
  });

  it("returns an empty chain for a direct child of the parent", () => {
    const byParent = parentMap([
      ["P", null],
      ["M", "P"],
    ]);

    expect(getAncestorChainIds(byParent, "P", "M")).toEqual(["M"]);
  });

  it("returns an empty chain when the mapped location is the parent itself", () => {
    const byParent = parentMap([["P", null]]);

    expect(getAncestorChainIds(byParent, "P", "P")).toEqual([]);
  });

  it("stops at the parent even when the chain continues above it", () => {
    const byParent = parentMap([
      ["ROOT", null],
      ["P", "ROOT"],
      ["M", "P"],
    ]);

    expect(getAncestorChainIds(byParent, "P", "M")).toEqual(["M"]);
  });

  it("fails closed when a link is missing from the snapshot", () => {
    const byParent = parentMap([
      ["P", null],
      // "A" row absent: the chain cannot be proven past M.
      ["M", "A"],
    ]);

    expect(getAncestorChainIds(byParent, "P", "M")).toEqual(["M", "A"]);
  });

  it("terminates on a parentId cycle instead of looping", () => {
    const byParent = parentMap([
      ["P", null],
      ["A", "B"],
      ["B", "A"],
      ["M", "A"],
    ]);

    expect(getAncestorChainIds(byParent, "P", "M")).toEqual(["M", "A", "B"]);
  });

  it("unions cleanly across sibling mappings sharing one ancestor", () => {
    const byParent = parentMap([
      ["P", null],
      ["A", "P"],
      ["M1", "A"],
      ["M2", "A"],
    ]);

    const union = new Set([
      ...getAncestorChainIds(byParent, "P", "M1"),
      ...getAncestorChainIds(byParent, "P", "M2"),
    ]);

    expect([...union].sort()).toEqual(["A", "M1", "M2"]);
  });
});

describe("getPhysicalAncestorChainIds", () => {
  it("returns every link between the mapped location and the container", () => {
    const byContainer = parentMap([
      ["P", null],
      ["A", "P"],
      ["B", "A"],
      ["M", "B"],
    ]);

    expect(getPhysicalAncestorChainIds(byContainer, "P", "M")).toEqual(["M", "B", "A"]);
  });

  it("returns direct child link for a direct physical child", () => {
    const byContainer = parentMap([
      ["P", null],
      ["M", "P"],
    ]);

    expect(getPhysicalAncestorChainIds(byContainer, "P", "M")).toEqual(["M"]);
  });

  it("returns an empty chain when mapped location is the container itself", () => {
    const byContainer = parentMap([["P", null]]);

    expect(getPhysicalAncestorChainIds(byContainer, "P", "P")).toEqual([]);
  });

  it("stops at the container even when container has an outer container", () => {
    const byContainer = parentMap([
      ["WAREHOUSE", null],
      ["P", "WAREHOUSE"],
      ["M", "P"],
    ]);

    expect(getPhysicalAncestorChainIds(byContainer, "P", "M")).toEqual(["M"]);
  });

  it("terminates when containerId is null (physical root)", () => {
    const byContainer = parentMap([
      ["P", null],
      ["M", null],
    ]);

    expect(getPhysicalAncestorChainIds(byContainer, "P", "M")).toEqual(["M"]);
  });

  it("fails closed when an intermediate container link is missing from snapshot", () => {
    const byContainer = parentMap([
      ["P", null],
      ["M", "MISSING"],
    ]);

    expect(getPhysicalAncestorChainIds(byContainer, "P", "M")).toEqual(["M", "MISSING"]);
  });

  it("terminates on a containerId cycle instead of looping", () => {
    const byContainer = parentMap([
      ["P", null],
      ["A", "B"],
      ["B", "A"],
      ["M", "A"],
    ]);

    expect(getPhysicalAncestorChainIds(byContainer, "P", "M")).toEqual(["M", "A", "B"]);
  });

  it("unions cleanly across sibling mappings sharing one intermediate container", () => {
    const byContainer = parentMap([
      ["P", null],
      ["A", "P"],
      ["M1", "A"],
      ["M2", "A"],
    ]);

    const union = new Set([
      ...getPhysicalAncestorChainIds(byContainer, "P", "M1"),
      ...getPhysicalAncestorChainIds(byContainer, "P", "M2"),
    ]);

    expect([...union].sort()).toEqual(["A", "M1", "M2"]);
  });
});
