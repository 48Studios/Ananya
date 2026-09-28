import { describe, expect, it } from "vitest";
import { getRelativeLocationPath } from "./location-provenance";

const locations = [
  { id: "A", name: "Location A", parentId: null },
  { id: "B", name: "Location B", parentId: "A" },
  { id: "C", name: "Location C", parentId: "B" },
];

describe("getRelativeLocationPath", () => {
  it("returns an empty path for a component directly at the viewed location", () => {
    expect(getRelativeLocationPath("A", "A", locations)).toEqual([]);
  });

  it("returns the immediate descendant location", () => {
    expect(getRelativeLocationPath("B", "A", locations)).toEqual([
      locations[1],
    ]);
  });

  it("returns every location between the viewed location and a deep descendant", () => {
    expect(getRelativeLocationPath("C", "A", locations)).toEqual([
      locations[1],
      locations[2],
    ]);
  });

  it("returns the correct direct and inherited paths when viewing intermediate locations", () => {
    expect(getRelativeLocationPath("B", "B", locations)).toEqual([]);
    expect(getRelativeLocationPath("C", "B", locations)).toEqual([
      locations[2],
    ]);
    expect(getRelativeLocationPath("C", "C", locations)).toEqual([]);
  });

  it("returns null when the source location is not a descendant", () => {
    expect(getRelativeLocationPath("A", "B", locations)).toBeNull();
  });
});
