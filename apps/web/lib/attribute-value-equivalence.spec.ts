import { describe, it, expect } from "vitest";
import {
  canonicalUnitKey,
  convertToBaseUnit,
  findCatalogUnit,
  formValueDisplay,
  formValueMatchesSuggestion,
  hasFormAttributeValue,
} from "./attribute-value-equivalence";
import type { AttributeSuggestionDto } from "./api/ml-api";
import type { UnitDto } from "./api/units-api";

/**
 * Comparing the form's attribute value against an AI suggestion.
 *
 * This is the rule that decides whether a suggestion has already been applied,
 * and it has to be semantic rather than textual: the same quantity written in
 * another unit is the same value, and two different quantities that merely look
 * alike are not. The mirror of the API's `attribute-value-semantics.ts` is
 * deliberate — the browser must not invent a second opinion about equivalence.
 */

function unit(
  name: string,
  category: string,
  options: {
    isBaseUnit?: boolean;
    conversionFactor?: number | null;
    conversionOffset?: number | null;
  } = {},
): UnitDto {
  return {
    id: `unit-${name}`,
    name,
    category,
    isBaseUnit: options.isBaseUnit ?? false,
    conversionFactor:
      options.conversionFactor === undefined
        ? options.isBaseUnit
          ? null
          : 1
        : options.conversionFactor,
    conversionOffset: options.conversionOffset ?? null,
    precision: 2,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const OHM = unit("Ω", "Resistance", { isBaseUnit: true });
const KOHM = unit("kΩ", "Resistance", { conversionFactor: 1000 });
const MOHM = unit("MΩ", "Resistance", { conversionFactor: 1_000_000 });
const DEGC = unit("°C", "Temperature", { isBaseUnit: true });
const DEGK = unit("K", "Temperature", { conversionFactor: 1, conversionOffset: 273.15 });
// The catalog's own factor for °F: 5/9, stored as an 18-decimal value
// (`0.555555555555555556`) so it parses to exactly this double.
const DEGF = unit("°F", "Temperature", {
  conversionFactor: 5 / 9,
  conversionOffset: -32,
});
const MILLIMETRE = unit("mm", "Length", { isBaseUnit: true });

const CATALOG: UnitDto[] = [OHM, KOHM, MOHM, DEGC, DEGK, DEGF, MILLIMETRE];

function suggestion(
  overrides: Partial<AttributeSuggestionDto> = {},
): AttributeSuggestionDto {
  return {
    attributeDefinitionId: "def-1",
    code: "mounting_type",
    name: "Mounting Type",
    dataType: "SELECT",
    unitCategory: null,
    defaultUnit: null,
    isRequired: false,
    categoryIds: ["cat-1"],
    consideredCategoryIds: ["cat-1"],
    relevance: [],
    valueEvidence: [],
    suggestedValue: {
      value: "SMD",
      optionCode: "SMD",
      formatted: "SMD",
    },
    confidence: 0.9,
    confidenceLevel: "HIGH",
    existingDisplay: null,
    existingMatches: null,
    conflict: null,
    ...overrides,
  };
}

const quantitySuggestion = (
  value: number,
  unitName: string,
  overrides: Partial<AttributeSuggestionDto> = {},
) =>
  suggestion({
    dataType: "QUANTITY",
    code: "resistance",
    name: "Resistance",
    unitCategory: "Resistance",
    defaultUnit: "Ω",
    suggestedValue: {
      value,
      unit: unitName,
      formatted: `${value} ${unitName}`,
    },
    ...overrides,
  });

describe("unit spellings", () => {
  it("folds the spellings one unit is written in", () => {
    // `kΩ`, `kohm`, `KOHM` and `kiloohm` name one unit; an extraction and a
    // reviewer typing in the editor both produce that variation.
    for (const spelling of ["kΩ", "kohm", "KOHM", "kiloohm", " kΩ "]) {
      expect(canonicalUnitKey(spelling)).toBe("kohm");
    }
    for (const spelling of ["°C", "degC", "celsius", "centigrade"]) {
      expect(canonicalUnitKey(spelling)).toBe("degc");
    }
  });

  it("does not fold a prefix that means something else", () => {
    // This catalog reads `Mohm` as megaohm, so `milliohm` must not collide
    // with it — a wrong prefix is a wrong quantity.
    expect(canonicalUnitKey("milliohm")).not.toBe(canonicalUnitKey("Mohm"));
  });

  it("finds the catalog row a spelling denotes", () => {
    expect(findCatalogUnit(CATALOG, "kohm")?.name).toBe("kΩ");
    expect(findCatalogUnit(CATALOG, "KV")).toBeNull();
  });
});

describe("conversion", () => {
  it("converts through the catalog's own factor", () => {
    expect(convertToBaseUnit(KOHM, 100)).toBe(100_000);
    expect(convertToBaseUnit(OHM, 100)).toBe(100);
  });

  it("applies an affine unit's offset before the factor", () => {
    // `(50 − 32) × 5/9` is 10, the base value of 50 °F — and the factor is the
    // catalog's own, so this is the same arithmetic the backend performs.
    expect(convertToBaseUnit(DEGF, 50)).toBe(10);
    expect(convertToBaseUnit(DEGK, 10)).toBe(283.15);
  });
});

describe("does the form hold this value", () => {
  it("compares a quantity as a quantity", () => {
    expect(
      formValueMatchesSuggestion(
        { value: 100, unit: "kΩ" },
        quantitySuggestion(100, "kΩ"),
        CATALOG,
      ),
    ).toBe(true);
  });

  it("treats an equivalent value in another unit as the same value", () => {
    // `100 kΩ` and `100000 Ω` describe one resistance: applying the suggestion
    // in kΩ and comparing it against the same quantity recorded in Ω must not
    // read as a disagreement.
    expect(
      formValueMatchesSuggestion(
        { value: 100_000, unit: "Ω" },
        quantitySuggestion(100, "kΩ"),
        CATALOG,
      ),
    ).toBe(true);
  });

  it("converts between affine units", () => {
    expect(
      formValueMatchesSuggestion(
        { value: 10, unit: "°C" },
        quantitySuggestion(50, "°F"),
        CATALOG,
      ),
    ).toBe(true);
    // …and does not confuse the two scales.
    expect(
      formValueMatchesSuggestion(
        { value: 10, unit: "°F" },
        quantitySuggestion(10, "°C"),
        CATALOG,
      ),
    ).toBe(false);
  });

  it("compares the editor's own string amounts", () => {
    // The editor's inputs hold strings, so a value applied from a suggestion is
    // the same value after being shown and re-read in the field.
    expect(
      formValueMatchesSuggestion(
        { value: "100.0", unit: "kΩ" },
        quantitySuggestion(100, "kΩ"),
        CATALOG,
      ),
    ).toBe(true);
    expect(
      formValueMatchesSuggestion(
        { value: "", unit: "kΩ" },
        quantitySuggestion(100, "kΩ"),
        CATALOG,
      ),
    ).toBe(false);
  });

  it("refuses to convert across dimensions", () => {
    expect(
      formValueMatchesSuggestion(
        { value: 10, unit: "mm" },
        quantitySuggestion(10, "°C"),
        CATALOG,
      ),
    ).toBe(false);
  });

  it("refuses to guess for a unit the catalog does not know", () => {
    // Claiming equality here would hide a value the reviewer still has to look
    // at, which is the failure this whole rule exists to prevent.
    expect(
      formValueMatchesSuggestion(
        { value: 100, unit: "furlongs" },
        quantitySuggestion(100, "kΩ"),
        CATALOG,
      ),
    ).toBe(false);
  });

  it("compares option values by code, exactly", () => {
    expect(
      formValueMatchesSuggestion(
        { optionCode: "SMD" },
        suggestion(),
        CATALOG,
      ),
    ).toBe(true);
    // Option codes are identifiers: `X7R` and `x7r` are two different codes.
    expect(
      formValueMatchesSuggestion(
        { optionCode: "x7r" },
        suggestion({
          suggestedValue: { value: "X7R", optionCode: "X7R", formatted: "X7R" },
        }),
        CATALOG,
      ),
    ).toBe(false);
  });

  it("reads a select value that was loaded as a plain string", () => {
    expect(
      formValueMatchesSuggestion({ value: "SMD" }, suggestion(), CATALOG),
    ).toBe(true);
  });

  it("compares a multi-select as a set of codes", () => {
    const multi = suggestion({
      dataType: "MULTI_SELECT",
      suggestedValue: {
        value: ["RoHS", "REACH"],
        selectedOptionCodes: ["RoHS", "REACH"],
        formatted: "RoHS, REACH",
      },
    });
    expect(
      formValueMatchesSuggestion(
        { selectedOptionCodes: ["REACH", "RoHS"] },
        multi,
        CATALOG,
      ),
    ).toBe(true);
    expect(
      formValueMatchesSuggestion({ selectedOptionCodes: ["RoHS"] }, multi, CATALOG),
    ).toBe(false);
    expect(
      formValueMatchesSuggestion(
        { selectedOptionCodes: ["RoHS", "REACH", "PFAS"] },
        multi,
        CATALOG,
      ),
    ).toBe(false);
  });

  it("compares numbers, booleans and text the way the domain stores them", () => {
    expect(
      formValueMatchesSuggestion(
        { value: "64" },
        suggestion({
          dataType: "INTEGER",
          suggestedValue: { value: 64, formatted: "64" },
        }),
        CATALOG,
      ),
    ).toBe(true);
    expect(
      formValueMatchesSuggestion(
        { value: true },
        suggestion({
          dataType: "BOOLEAN",
          suggestedValue: { value: true, formatted: "Yes" },
        }),
        CATALOG,
      ),
    ).toBe(true);
    // `false` is a value, not an absence.
    expect(
      formValueMatchesSuggestion(
        { value: false },
        suggestion({
          dataType: "BOOLEAN",
          suggestedValue: { value: true, formatted: "Yes" },
        }),
        CATALOG,
      ),
    ).toBe(false);
    expect(
      formValueMatchesSuggestion(
        { value: "  smd " },
        suggestion({
          dataType: "TEXT",
          suggestedValue: { value: "SMD", formatted: "SMD" },
        }),
        CATALOG,
      ),
    ).toBe(true);
  });

  it("reports no value for an empty row", () => {
    // The category effect writes a QUANTITY row's starting unit before the
    // reviewer types anything: a unit alone is not a value, and must not be
    // mistaken for one that disagrees with the suggestion.
    expect(hasFormAttributeValue({ unit: "kΩ" }, "QUANTITY")).toBe(false);
    expect(hasFormAttributeValue({ value: "" }, "QUANTITY")).toBe(false);
    expect(
      formValueMatchesSuggestion(
        { unit: "kΩ" },
        quantitySuggestion(100, "kΩ"),
        CATALOG,
      ),
    ).toBe(false);
    expect(hasFormAttributeValue({ value: "SMD" }, "SELECT")).toBe(true);
    expect(hasFormAttributeValue(undefined, "SELECT")).toBe(false);
  });

  it("never matches a suggestion that has no value", () => {
    expect(
      formValueMatchesSuggestion(
        { optionCode: "SMD" },
        suggestion({ suggestedValue: null, confidence: null, confidenceLevel: null }),
        CATALOG,
      ),
    ).toBe(false);
  });
});

describe("showing the form's own value", () => {
  it("renders a quantity as amount and unit", () => {
    expect(
      formValueDisplay({ value: "100", unit: "kΩ" }, {
        dataType: "QUANTITY",
        defaultUnit: "Ω",
      }),
    ).toBe("100 kΩ");
  });

  it("renders option codes and multi-select codes", () => {
    expect(
      formValueDisplay({ optionCode: "SMD" }, { dataType: "SELECT" }),
    ).toBe("SMD");
    expect(
      formValueDisplay(
        { selectedOptionCodes: ["RoHS", "REACH"] },
        { dataType: "MULTI_SELECT" },
      ),
    ).toBe("RoHS, REACH");
  });

  it("renders nothing for an empty row", () => {
    expect(
      formValueDisplay({ unit: "kΩ" }, { dataType: "QUANTITY" }),
    ).toBeNull();
    expect(formValueDisplay(undefined, { dataType: "SELECT" })).toBeNull();
  });
});
