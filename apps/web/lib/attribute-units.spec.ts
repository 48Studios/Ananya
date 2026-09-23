import { describe, expect, it } from "vitest";
import { defaultQuantityUnit, quantityUnitOptions } from "./attribute-units";
import type { UnitDto } from "./api/units-api";

function unit(
  name: string,
  category: string,
  overrides: Partial<UnitDto> = {},
): UnitDto {
  return {
    id: `unit-${name}`,
    name,
    category,
    conversionFactor: 1,
    precision: 2,
    isBaseUnit: true,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * The editor's unit list is read from the authoritative catalog rather than a
 * per-dimension table in the component, so a unit the backend converts (an affine
 * `°F`, or one an administrator added) is offered the moment it exists — and a
 * unit the catalog does not know is never offered at all.
 */
const CATALOG: UnitDto[] = [
  unit("ohm", "Resistance"),
  unit("kohm", "Resistance", { isBaseUnit: false }),
  unit("Mohm", "Resistance", { isBaseUnit: false }),
  unit("V", "Voltage"),
  unit("mV", "Voltage", { isBaseUnit: false }),
  unit("°C", "Temperature"),
  unit("°F", "Temperature", { isBaseUnit: false }),
  unit("retired", "Resistance", { isBaseUnit: false, isActive: false }),
];

describe("quantity unit options", () => {
  it("offers every active unit of the declared dimension, the default first", () => {
    expect(
      quantityUnitOptions(
        { unitCategory: "Resistance", defaultUnit: "ohm" },
        CATALOG,
      ),
    ).toEqual(["ohm", "kohm", "Mohm"]);
  });

  it("never offers a unit the catalog marks inactive", () => {
    const options = quantityUnitOptions(
      { unitCategory: "Resistance", defaultUnit: "ohm" },
      CATALOG,
    );
    expect(options).not.toContain("retired");
  });

  it("offers an affine unit alongside the base unit of its dimension", () => {
    expect(
      quantityUnitOptions(
        { unitCategory: "Temperature", defaultUnit: "°F" },
        CATALOG,
      ),
    ).toEqual(["°F", "°C"]);
  });

  it("keeps the current unit even when the catalog does not list it", () => {
    // A value already recorded in `mm` (a dimension with no catalog rows) must
    // stay visible in the editor: hiding it would leave the row showing a unit
    // the reviewer cannot see.
    expect(
      quantityUnitOptions(
        { unitCategory: "Length", defaultUnit: "mm" },
        CATALOG,
        "cm",
      ),
    ).toEqual(["mm", "cm"]);
  });

  it("falls back to the definition's own unit when the catalog has none for the dimension", () => {
    expect(
      quantityUnitOptions(
        { unitCategory: "Length", defaultUnit: "mm" },
        CATALOG,
      ),
    ).toEqual(["mm"]);
  });

  it("falls back to the generic unit rather than offering nothing", () => {
    // Only reachable with no catalog and no unit of its own: the select must
    // still have something to render.
    expect(quantityUnitOptions({}, [])).toEqual(["pcs"]);
  });

  it("lists a dimension-less attribute's own unit before the whole catalog", () => {
    const options = quantityUnitOptions(
      { unitCategory: null, defaultUnit: "ohm" },
      CATALOG,
    );
    expect(options[0]).toBe("ohm");
    expect(options).toContain("°F");
    expect(options).not.toContain("retired");
  });
});

describe("default quantity unit", () => {
  it("prefers the definition's own unit", () => {
    expect(
      defaultQuantityUnit(
        { unitCategory: "Resistance", defaultUnit: "kohm" },
        CATALOG,
      ),
    ).toBe("kohm");
  });

  it("uses the first catalog unit of the dimension when the definition names none", () => {
    expect(defaultQuantityUnit({ unitCategory: "Voltage" }, CATALOG)).toBe("V");
  });

  it("is always a unit the editor can render", () => {
    const options = quantityUnitOptions({}, CATALOG);
    expect(options).toContain(defaultQuantityUnit({}, CATALOG));
  });
});
