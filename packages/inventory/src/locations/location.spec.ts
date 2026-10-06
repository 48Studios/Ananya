import { describe, expect, it } from "vitest";
import { Location } from "./location";
import { InvalidLocationKindError } from "./location.errors";

/**
 * Write-boundary behaviour for location kinds.
 *
 * The canonical taxonomy is authoritative: a canonical category persists
 * unchanged, a supported legacy alias is accepted and canonicalized, and an
 * unknown value is rejected. Only canonical categories are ever persisted.
 */
describe("Location kind write boundary", () => {
  const create = (kind: string) =>
    Location.create({ code: "LOC-01", name: "Location 01", kind });

  it("persists a canonical category unchanged", () => {
    for (const kind of [
      "warehouse",
      "room_area",
      "aisle",
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
      expect(create(kind).kind).toBe(kind);
    }
  });

  it("accepts a legacy alias and persists the canonical category", () => {
    const aliases: Array<[string, string]> = [
      ["room", "room_area"],
      ["area", "room_area"],
      ["tray", "matrix_tray"],
      ["tube", "ic_tube_rail"],
      ["rail", "ic_tube_rail"],
      ["ic_tube", "ic_tube_rail"],
    ];
    for (const [input, expected] of aliases) {
      expect(create(input).kind).toBe(expected);
    }
  });

  it("normalizes case and separators before resolving the category", () => {
    expect(create("  MATRIX TRAY  ").kind).toBe("matrix_tray");
    expect(create("IC Tube / Rail").kind).toBe("ic_tube_rail");
    expect(create("Dry-Cabinet").kind).toBe("dry_cabinet");
  });

  it("rejects a kind that is not a canonical category or a supported alias", () => {
    for (const invalid of ["pallet", "banana", "unknown_future_kind"]) {
      expect(() => create(invalid)).toThrow(InvalidLocationKindError);
    }
  });

  it("rejects an empty or whitespace-only kind", () => {
    expect(() => create("")).toThrow(InvalidLocationKindError);
    expect(() => create("   ")).toThrow(InvalidLocationKindError);
  });

  it("normalizes and rejects on update as well", () => {
    const location = create("bin");
    expect(location.update({ kind: "tray" }).kind).toBe("matrix_tray");
    expect(location.update({ kind: "rack" }).kind).toBe("rack");
    expect(() => location.update({ kind: "pallet" })).toThrow(
      InvalidLocationKindError,
    );
    // An update that omits the kind keeps the canonical persisted value.
    expect(location.update({ name: "Renamed" }).kind).toBe("bin");
  });
});
