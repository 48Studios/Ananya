import {
  VALUE_COMPARISON_RESULTS,
  VALUE_INCOMPARABLE_REASONS,
  areValuesEquivalent,
  canonicalUnitKey,
  compareAttributeValues,
  findUnit,
  fromBaseUnit,
  parseAmountAndUnit,
  readAbsoluteTolerance,
  readAllowedUnits,
  readRelativeTolerance,
  resolveQuantityForDefinition,
  toBaseUnit,
  type UnitRef,
} from './attribute-value-semantics';

/**
 * Pass 4 unit coverage for semantic attribute-value comparison.
 *
 * The unit rows are the ones the electronics Data Pack installs (name, category,
 * factor, precision), because the conversion must go through the authoritative
 * model rather than a table invented here. If a pack factor changes, these tests
 * are the place it surfaces.
 */
const OHM: UnitRef = {
  name: 'ohm',
  category: 'Resistance',
  isBaseUnit: true,
  conversionFactor: 1,
  precision: 2,
};
const KOHM: UnitRef = {
  name: 'kohm',
  category: 'Resistance',
  isBaseUnit: false,
  conversionFactor: 1000,
  precision: 3,
};
const MOHM: UnitRef = {
  name: 'Mohm',
  category: 'Resistance',
  isBaseUnit: false,
  conversionFactor: 1000000,
  precision: 4,
};
const VOLT: UnitRef = {
  name: 'V',
  category: 'Voltage',
  isBaseUnit: true,
  conversionFactor: 1,
  precision: 2,
};
const MILLIVOLT: UnitRef = {
  name: 'mV',
  category: 'Voltage',
  isBaseUnit: false,
  conversionFactor: 0.001,
  precision: 3,
};
const KILOVOLT: UnitRef = {
  name: 'kV',
  category: 'Voltage',
  isBaseUnit: false,
  conversionFactor: 1000,
  precision: 2,
};
const AMPERE: UnitRef = {
  name: 'A',
  category: 'Current',
  isBaseUnit: true,
  conversionFactor: 1,
  precision: 3,
};
const MILLIAMP: UnitRef = {
  name: 'mA',
  category: 'Current',
  isBaseUnit: false,
  conversionFactor: 0.001,
  precision: 3,
};
const MICROAMP: UnitRef = {
  name: 'uA',
  category: 'Current',
  isBaseUnit: false,
  conversionFactor: 0.000001,
  precision: 6,
};
const WATT: UnitRef = {
  name: 'W',
  category: 'Power',
  isBaseUnit: true,
  conversionFactor: 1,
  precision: 3,
};
const MILLIWATT: UnitRef = {
  name: 'mW',
  category: 'Power',
  isBaseUnit: false,
  conversionFactor: 0.001,
  precision: 4,
};
const PERCENT: UnitRef = {
  name: '%',
  category: 'Percentage',
  isBaseUnit: true,
  conversionFactor: 1,
  precision: 2,
};
const MILLIMETRE: UnitRef = {
  name: 'mm',
  category: 'Length',
  isBaseUnit: false,
  conversionFactor: 0.001,
  precision: 4,
};

const UNITS: UnitRef[] = [
  OHM,
  KOHM,
  MOHM,
  VOLT,
  MILLIVOLT,
  KILOVOLT,
  AMPERE,
  MILLIAMP,
  MICROAMP,
  WATT,
  MILLIWATT,
  PERCENT,
  MILLIMETRE,
];

function compare(input: {
  dataType: string;
  unitCategory?: string | null;
  first: Parameters<typeof compareAttributeValues>[0]['first'];
  second: Parameters<typeof compareAttributeValues>[0]['second'];
  relativeTolerance?: number | null;
  absoluteTolerance?: number | null;
}) {
  return compareAttributeValues({ units: UNITS, ...input });
}

// ---------------------------------------------------------------------------
// Unit model access
// ---------------------------------------------------------------------------

describe('unit model access', () => {
  it('folds case and symbols so extracted spellings find the authoritative row', () => {
    // The extractor emits units uppercased (`KV`) and lowercased (`uf`), while
    // the catalog stores `kV` and `uF`.
    expect(canonicalUnitKey('Ω')).toBe('ohm');
    expect(canonicalUnitKey('OHM')).toBe('ohm');
    expect(canonicalUnitKey(' KV ')).toBe('kv');
    expect(canonicalUnitKey('µF')).toBe('uf');
    expect(canonicalUnitKey('°C')).toBe('degc');
  });

  it('finds a unit row through its canonical key', () => {
    expect(findUnit(UNITS, 'KV')?.name).toBe('kV');
    expect(findUnit(UNITS, 'kv')?.name).toBe('kV');
    expect(findUnit(UNITS, 'Mohm')?.name).toBe('Mohm');
    expect(findUnit(UNITS, 'MOHM')?.name).toBe('Mohm');
    expect(findUnit(UNITS, 'Ω')?.name).toBe('ohm');
    expect(findUnit(UNITS, '%')?.name).toBe('%');
  });

  it('resolves the spelled-out forms of the same unit', () => {
    // A reviewer or an extraction may write the unit in words; the fold is a
    // spelling normaliser, not a second unit table, so `milliohm` deliberately
    // does NOT become `mohm` (which this catalog reads as megaohm).
    expect(findUnit(ALL_UNITS, 'kΩ')?.name).toBe('kohm');
    expect(findUnit(ALL_UNITS, 'KΩ')?.name).toBe('kohm');
    expect(findUnit(ALL_UNITS, 'kOhm')?.name).toBe('kohm');
    expect(findUnit(ALL_UNITS, 'kiloohm')?.name).toBe('kohm');
    expect(findUnit(ALL_UNITS, 'megaohm')?.name).toBe('Mohm');
    expect(findUnit(ALL_UNITS, 'Celsius')?.name).toBe('°C');
    expect(findUnit(ALL_UNITS, 'degC')?.name).toBe('°C');
    expect(findUnit(ALL_UNITS, 'fahrenheit')?.name).toBe('°F');
    expect(findUnit(ALL_UNITS, 'milliohm')).toBeNull();
  });

  it('reports no row for a unit the model does not define', () => {
    expect(findUnit(UNITS, 'C/W')).toBeNull();
    expect(findUnit(UNITS, 'bananas')).toBeNull();
    expect(findUnit(UNITS, null)).toBeNull();
    expect(findUnit(UNITS, '')).toBeNull();
  });

  it('converts through the domain aggregate rather than multiplying here', () => {
    expect(toBaseUnit(KOHM, 1)).toEqual({ ok: true, value: 1000 });
    expect(toBaseUnit(MILLIVOLT, 1000)).toEqual({ ok: true, value: 1 });
    expect(toBaseUnit(OHM, 300)).toEqual({ ok: true, value: 300 });
    expect(toBaseUnit(MILLIWATT, 125)).toEqual({ ok: true, value: 0.125 });
  });

  it('refuses a non-finite amount instead of producing a number', () => {
    const result = toBaseUnit(OHM, Number.POSITIVE_INFINITY);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Affine units
// ---------------------------------------------------------------------------

/**
 * The temperature rows the electronics Data Pack installs.
 *
 * `°F` is affine: its zero sits 32 of its own degrees below `°C`'s, and the
 * conversion is `(value − 32) × 5/9`. The factor carries the precision the
 * schema gives it (18 decimals), which is what makes `50 °F` land on exactly
 * `10 °C` rather than on `10.000000000008`.
 */
const DEGREE_CELSIUS: UnitRef = {
  name: '°C',
  category: 'Temperature',
  isBaseUnit: true,
  conversionFactor: 1,
  precision: 1,
};
const DEGREE_FAHRENHEIT: UnitRef = {
  name: '°F',
  category: 'Temperature',
  isBaseUnit: false,
  conversionFactor: Number('0.555555555555555556'),
  conversionOffset: -32,
  precision: 1,
};
const TEMPERATURE_UNITS: UnitRef[] = [DEGREE_CELSIUS, DEGREE_FAHRENHEIT];
const ALL_UNITS: UnitRef[] = [...UNITS, ...TEMPERATURE_UNITS];

describe('affine unit conversion', () => {
  it('converts Fahrenheit to Celsius through the aggregate, offset included', () => {
    expect(toBaseUnit(DEGREE_FAHRENHEIT, 50)).toEqual({ ok: true, value: 10 });
    expect(toBaseUnit(DEGREE_FAHRENHEIT, 32)).toEqual({ ok: true, value: 0 });
    expect(toBaseUnit(DEGREE_FAHRENHEIT, 212)).toEqual({
      ok: true,
      value: 100,
    });
    expect(toBaseUnit(DEGREE_FAHRENHEIT, -40)).toEqual({
      ok: true,
      value: -40,
    });
  });

  it('converts Celsius to Fahrenheit exactly, the inverse of the same rule', () => {
    expect(fromBaseUnit(DEGREE_FAHRENHEIT, 10)).toEqual({
      ok: true,
      value: 50,
    });
    expect(fromBaseUnit(DEGREE_FAHRENHEIT, 0)).toEqual({ ok: true, value: 32 });
    expect(fromBaseUnit(DEGREE_FAHRENHEIT, 100)).toEqual({
      ok: true,
      value: 212,
    });
    expect(fromBaseUnit(DEGREE_CELSIUS, 10)).toEqual({ ok: true, value: 10 });
  });

  it('compares affine quantities semantically', () => {
    const equivalent = areValuesEquivalent({
      dataType: 'QUANTITY',
      unitCategory: 'Temperature',
      units: ALL_UNITS,
      first: { amount: 10, unit: '°C' },
      second: { amount: 50, unit: '°F' },
    });
    expect(equivalent.result).toBe('UNIT_NORMALIZED_EQUAL');
    expect(equivalent.equivalent).toBe(true);

    // The same number in the other unit is a different quantity, which is the
    // corruption this whole path exists to prevent.
    const different = areValuesEquivalent({
      dataType: 'QUANTITY',
      unitCategory: 'Temperature',
      units: ALL_UNITS,
      first: { amount: 10, unit: '°F' },
      second: { amount: 10, unit: '°C' },
    });
    expect(different.result).toBe('DIFFERENT');
    expect(different.equivalent).toBe(false);
  });

  it('keeps a multiplicative unit unaffected by the affine path', () => {
    const comparison = areValuesEquivalent({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      units: ALL_UNITS,
      first: { amount: 100, unit: 'kohm' },
      second: { amount: 100000, unit: 'ohm' },
    });
    expect(comparison.equivalent).toBe(true);

    const notEquivalent = areValuesEquivalent({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      units: ALL_UNITS,
      first: { amount: 100, unit: 'ohm' },
      second: { amount: 100, unit: 'kohm' },
    });
    expect(notEquivalent.result).toBe('DIFFERENT');
  });
});

// ---------------------------------------------------------------------------
// Quantity resolution
// ---------------------------------------------------------------------------

/** The shape every resolution case in this file passes. */
function resolve(input: {
  value: unknown;
  sourceUnit?: string | null;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  allowedUnits?: readonly string[] | null;
  units?: readonly UnitRef[];
}) {
  return resolveQuantityForDefinition({ units: ALL_UNITS, ...input });
}

describe('quantity resolution', () => {
  it('preserves the source unit when the attribute accepts the dimension', () => {
    // `100 kΩ` stays `100 kohm`: the quantity is recorded in the unit it was
    // stated in, spelled the way the catalog spells it.
    expect(
      resolve({
        value: 100,
        sourceUnit: 'kΩ',
        unitCategory: 'Resistance',
        defaultUnit: 'ohm',
      }),
    ).toMatchObject({
      ok: true,
      value: 100,
      unit: 'kohm',
      converted: false,
      sourceUnit: 'kΩ',
    });
  });

  it('converts into a unit the attribute fixes', () => {
    expect(
      resolve({
        value: 100,
        sourceUnit: 'kΩ',
        unitCategory: 'Resistance',
        defaultUnit: 'ohm',
        allowedUnits: ['ohm'],
      }),
    ).toMatchObject({ ok: true, value: 100000, unit: 'ohm', converted: true });

    expect(
      resolve({
        value: 100,
        sourceUnit: 'kΩ',
        unitCategory: 'Resistance',
        defaultUnit: 'kohm',
        allowedUnits: ['kohm'],
      }),
    ).toMatchObject({ ok: true, value: 100, unit: 'kohm', converted: false });
  });

  it('converts 10 °C into 50 °F for an attribute that requires °F', () => {
    expect(
      resolve({
        value: 10,
        sourceUnit: '°C',
        unitCategory: 'Temperature',
        defaultUnit: '°F',
        allowedUnits: ['°F'],
      }),
    ).toMatchObject({
      ok: true,
      value: 50,
      unit: '°F',
      converted: true,
      sourceValue: 10,
      sourceUnit: '°C',
    });
  });

  it('keeps 10 °C as 10 °C when the attribute accepts it', () => {
    expect(
      resolve({
        value: 10,
        sourceUnit: '°C',
        unitCategory: 'Temperature',
        defaultUnit: '°C',
      }),
    ).toMatchObject({ ok: true, value: 10, unit: '°C', converted: false });

    expect(
      resolve({
        value: 10,
        sourceUnit: '°C',
        unitCategory: 'Temperature',
        defaultUnit: '°C',
        allowedUnits: ['°C'],
      }),
    ).toMatchObject({ ok: true, value: 10, unit: '°C' });
  });

  it('converts 50 °F into 10 °C', () => {
    expect(
      resolve({
        value: 50,
        sourceUnit: '°F',
        unitCategory: 'Temperature',
        defaultUnit: '°C',
        allowedUnits: ['°C'],
      }),
    ).toMatchObject({ ok: true, value: 10, unit: '°C', converted: true });
  });

  it('refuses a unit of another dimension rather than copying the number', () => {
    const result = resolve({
      value: 10,
      sourceUnit: 'mV',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('INCOMPATIBLE_UNIT');
    expect(result.detail).toContain('mV');
    expect(result.detail).toMatch(/incompatible/i);
  });

  it('refuses a quantity stated with no unit instead of assuming one', () => {
    const result = resolve({
      value: 10,
      sourceUnit: null,
      unitCategory: 'Temperature',
      defaultUnit: '°F',
      allowedUnits: ['°F'],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('MISSING_UNIT');
    expect(result.detail).toMatch(/no unit/i);
  });

  it('refuses a unit the catalog does not define', () => {
    const result = resolve({
      value: 10,
      sourceUnit: 'bananas',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UNKNOWN_UNIT');
  });

  it('keeps an unknown unit when the attribute itself declares that unit', () => {
    // The live `mm` attributes: their dimension has no catalog rows at all, and
    // the definition's own unit is what the value is recorded in.
    const result = resolveQuantityForDefinition({
      value: 2.5,
      sourceUnit: 'mm',
      unitCategory: 'Length',
      defaultUnit: 'mm',
      units: UNITS.filter((unit) => unit.name !== 'mm'),
    });

    expect(result).toMatchObject({ ok: true, value: 2.5, unit: 'mm' });
  });

  it('takes the source quantity as stated when there is no catalog to check', () => {
    // Documented degradation: without the authoritative model nothing can be
    // validated or converted, so the quantity is not rejected for that reason.
    expect(
      resolve({
        value: 100,
        sourceUnit: 'kΩ',
        unitCategory: 'Resistance',
        defaultUnit: 'ohm',
        units: [],
      }),
    ).toMatchObject({ ok: true, value: 100, unit: 'kΩ' });
  });

  it('refuses an amount that is not a finite number', () => {
    const result = resolve({
      value: 'not a number',
      sourceUnit: 'ohm',
      unitCategory: 'Resistance',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('INVALID_AMOUNT');
  });

  it('accepts a numeric string, as a form field produces', () => {
    expect(
      resolve({
        value: '100',
        sourceUnit: 'kohm',
        unitCategory: 'Resistance',
        defaultUnit: 'ohm',
      }),
    ).toMatchObject({ ok: true, value: 100, unit: 'kohm' });
  });
});

describe('declared accepted units', () => {
  it('reads an explicit allowed-units rule', () => {
    expect(readAllowedUnits({ allowedUnits: ['°F'] })).toEqual(['°F']);
    expect(readAllowedUnits({ allowedUnits: ['ohm', ' kohm '] })).toEqual([
      'ohm',
      'kohm',
    ]);
  });

  it('treats an absent, empty or malformed rule as "the whole dimension"', () => {
    expect(readAllowedUnits(null)).toBeNull();
    expect(readAllowedUnits({})).toBeNull();
    expect(readAllowedUnits({ allowedUnits: [] })).toBeNull();
    expect(readAllowedUnits({ allowedUnits: 'ohm' })).toBeNull();
    expect(readAllowedUnits({ allowedUnits: [1, 2] })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §7 — semantic unit equivalence
// ---------------------------------------------------------------------------

describe('semantic unit equivalence', () => {
  it('treats 1000 Ω and 1 kΩ as the same resistance', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 1000, unit: 'ohm' },
      second: { amount: 1, unit: 'kohm' },
    });

    expect(comparison.result).toBe('UNIT_NORMALIZED_EQUAL');
    expect(comparison.equivalent).toBe(true);
    expect(comparison.firstBase).toBe(1000);
    expect(comparison.secondBase).toBe(1000);
  });

  it('treats 1000 mV and 1 V as the same voltage', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Voltage',
      first: { amount: 1000, unit: 'mV' },
      second: { amount: 1, unit: 'V' },
    });

    expect(comparison.result).toBe('UNIT_NORMALIZED_EQUAL');
    expect(comparison.equivalent).toBe(true);
  });

  it('treats 0.001 A and 1 mA as the same current', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Current',
      first: { amount: 0.001, unit: 'A' },
      second: { amount: 1, unit: 'mA' },
    });

    expect(comparison.result).toBe('UNIT_NORMALIZED_EQUAL');
    expect(comparison.equivalent).toBe(true);
  });

  it('treats 0.125 W and 125 mW as the same power', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Power',
      first: { amount: 0.125, unit: 'W' },
      second: { amount: 125, unit: 'mW' },
    });

    expect(comparison.result).toBe('UNIT_NORMALIZED_EQUAL');
    expect(comparison.equivalent).toBe(true);
  });

  it('equates a symbol unit with its catalog name', () => {
    // The document prints `Ω`; the catalog row is `ohm`.
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 300, unit: 'Ω' },
      second: { amount: 300, unit: 'ohm' },
    });

    expect(comparison.result).toBe('EXACT_EQUAL');
    expect(comparison.equivalent).toBe(true);
  });

  it('equates a kilohm written with an uppercase K', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 1, unit: 'KOHM' },
      second: { amount: 1000, unit: 'ohm' },
    });

    expect(comparison.equivalent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §7 — unsupported conversions are rejected, never guessed
// ---------------------------------------------------------------------------

describe('incompatible units', () => {
  it('refuses to convert across dimensions', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      first: { amount: 1000, unit: 'mV' },
      second: { amount: 1000, unit: 'ohm' },
    });

    expect(comparison.result).toBe('INCOMPARABLE');
    expect(comparison.reason).toBe('INCOMPATIBLE_UNIT');
    expect(comparison.equivalent).toBe(false);
    expect(comparison.detail).toContain('different dimensions');
  });

  it('refuses a unit the catalog does not define', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 25, unit: 'C/W' },
      second: { amount: 25, unit: 'ohm' },
    });

    expect(comparison.result).toBe('INCOMPARABLE');
    expect(comparison.reason).toBe('UNKNOWN_UNIT');
    expect(comparison.detail).toContain('C/W');
  });

  it('refuses a unit from the wrong dimension for the attribute', () => {
    // This is the case the domain currently accepts silently: a mV value on a
    // resistance attribute converts without complaint. Comparison refuses it.
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 5, unit: 'mV' },
      second: { amount: 5, unit: 'mV' },
    });

    // Same spelling short-circuits to an exact match; the mismatch is caught
    // when the two sides differ in unit.
    expect(comparison.equivalent).toBe(true);

    const crossUnit = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 5, unit: 'mV' },
      second: { amount: 5, unit: 'ohm' },
    });

    expect(crossUnit.result).toBe('INCOMPARABLE');
    expect(crossUnit.reason).toBe('UNIT_CATEGORY_MISMATCH');
    expect(crossUnit.detail).toContain('Resistance');
  });

  it('never treats an unsupported data type as equivalent', () => {
    const comparison = compare({
      dataType: 'JSON',
      first: { textValue: '{"a":1}' },
      second: { textValue: '{"a":1}' },
    });

    expect(comparison.result).toBe('INCOMPARABLE');
    expect(comparison.reason).toBe('UNSUPPORTED_DATA_TYPE');
    expect(comparison.equivalent).toBe(false);
  });

  it('compares text by trimmed case-insensitive equality', () => {
    // The domain stores text with `String(value).trim()`, so the comparison uses
    // the same normalisation rather than fuzzy matching.
    expect(
      compare({
        dataType: 'TEXT',
        first: { textValue: '  Yageo ' },
        second: { textValue: 'yageo' },
      }).result,
    ).toBe('EXACT_EQUAL');

    expect(
      compare({
        dataType: 'TEXT',
        first: { textValue: 'Yageo' },
        second: { textValue: 'Vishay' },
      }).result,
    ).toBe('DIFFERENT');
  });

  it('reports a missing side rather than assuming equality', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 300, unit: 'ohm' },
      second: { amount: null, unit: 'ohm' },
    });

    expect(comparison.result).toBe('INCOMPARABLE');
    expect(comparison.reason).toBe('MISSING_VALUE');
  });

  it('exposes the full result vocabulary', () => {
    expect([...VALUE_COMPARISON_RESULTS]).toEqual([
      'EXACT_EQUAL',
      'UNIT_NORMALIZED_EQUAL',
      'WITHIN_TOLERANCE',
      'DIFFERENT',
      'INCOMPARABLE',
    ]);
    expect([...VALUE_INCOMPARABLE_REASONS]).toContain('INCOMPATIBLE_UNIT');
  });
});

// ---------------------------------------------------------------------------
// §8 — numeric tolerance
// ---------------------------------------------------------------------------

describe('numeric comparison and tolerance', () => {
  it('treats 1.000 V and 1 V as exactly equal', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Voltage',
      first: { amount: 1.0, unit: 'V' },
      second: { amount: 1, unit: 'V' },
    });

    expect(comparison.result).toBe('EXACT_EQUAL');
    expect(comparison.equivalent).toBe(true);
  });

  it('treats 4.7 kΩ and 4.8 kΩ as different without a declared tolerance', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 4.7, unit: 'kohm' },
      second: { amount: 4.8, unit: 'kohm' },
    });

    expect(comparison.result).toBe('DIFFERENT');
    expect(comparison.equivalent).toBe(false);
    expect(comparison.firstBase).toBe(4700);
    expect(comparison.secondBase).toBe(4800);
  });

  it('reports WITHIN_TOLERANCE only when the definition declares one', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 4.7, unit: 'kohm' },
      second: { amount: 4.8, unit: 'kohm' },
      relativeTolerance: 0.03,
    });

    expect(comparison.result).toBe('WITHIN_TOLERANCE');
    expect(comparison.equivalent).toBe(true);
    expect(comparison.detail).toContain('this attribute allows');
  });

  it('keeps a difference outside the declared tolerance different', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      first: { amount: 4.7, unit: 'kohm' },
      second: { amount: 5.2, unit: 'kohm' },
      relativeTolerance: 0.01,
    });

    expect(comparison.result).toBe('DIFFERENT');
    expect(comparison.equivalent).toBe(false);
  });

  it('honours an absolute tolerance when the definition declares one', () => {
    const comparison = compare({
      dataType: 'QUANTITY',
      unitCategory: 'Voltage',
      first: { amount: 5, unit: 'V' },
      second: { amount: 5.1, unit: 'V' },
      absoluteTolerance: 0.2,
    });

    expect(comparison.result).toBe('WITHIN_TOLERANCE');
  });

  it('reads a tolerance only from an explicit declaration', () => {
    expect(readRelativeTolerance(null)).toBeNull();
    expect(readRelativeTolerance({})).toBeNull();
    expect(readRelativeTolerance({ tolerance: 'not a number' })).toBeNull();
    expect(readRelativeTolerance({ tolerance: 0 })).toBeNull();
    expect(readRelativeTolerance({ tolerance: 0.01 })).toBe(0.01);
    expect(readRelativeTolerance({ tolerance: '1%' })).toBeCloseTo(0.01);
    // An absolute tolerance is not a relative one.
    expect(
      readRelativeTolerance({ tolerance: 0.5, toleranceKind: 'ABSOLUTE' }),
    ).toBeNull();
    expect(
      readAbsoluteTolerance({ tolerance: 0.5, toleranceKind: 'ABSOLUTE' }),
    ).toBe(0.5);
    expect(readAbsoluteTolerance({ tolerance: 0.5 })).toBeNull();
  });

  it('compares numbers and dates without inventing units', () => {
    expect(
      compare({
        dataType: 'NUMBER',
        first: { amount: 4 },
        second: { amount: 4.0 },
      }).result,
    ).toBe('EXACT_EQUAL');

    expect(
      compare({
        dataType: 'INTEGER',
        first: { amount: 8 },
        second: { amount: 9 },
      }).result,
    ).toBe('DIFFERENT');

    expect(
      compare({
        dataType: 'DATE',
        first: { dateValue: '2024-05-01T12:00:00.000Z' },
        second: { dateValue: '2024-05-01T18:00:00.000Z' },
      }).result,
    ).toBe('EXACT_EQUAL');

    expect(
      compare({
        dataType: 'DATE',
        first: { dateValue: '2024-05-01T00:00:00.000Z' },
        second: { dateValue: '2024-05-02T00:00:00.000Z' },
      }).result,
    ).toBe('DIFFERENT');
  });

  it('compares booleans', () => {
    expect(
      compare({
        dataType: 'BOOLEAN',
        first: { booleanValue: true },
        second: { booleanValue: true },
      }).result,
    ).toBe('EXACT_EQUAL');

    expect(
      compare({
        dataType: 'BOOLEAN',
        first: { booleanValue: true },
        second: { booleanValue: false },
      }).result,
    ).toBe('DIFFERENT');
  });
});

// ---------------------------------------------------------------------------
// §9 — SELECT and MULTI_SELECT
// ---------------------------------------------------------------------------

describe('option comparison', () => {
  it('matches a SELECT option by its authoritative code', () => {
    expect(
      compare({
        dataType: 'SELECT',
        first: { optionCode: '0805' },
        second: { optionCode: '0805' },
      }).result,
    ).toBe('EXACT_EQUAL');
  });

  it('does not treat a different SELECT option as equal', () => {
    expect(
      compare({
        dataType: 'SELECT',
        first: { optionCode: '0805' },
        second: { optionCode: '0603' },
      }).result,
    ).toBe('DIFFERENT');
  });

  it('falls back to the label only when no code is known', () => {
    expect(
      compare({
        dataType: 'SELECT',
        first: { optionCode: '0805' },
        second: { optionLabels: ['0805 (2012 Metric)'] },
      }).equivalent,
    ).toBe(false);

    expect(
      compare({
        dataType: 'SELECT',
        first: { optionCode: 'X7R' },
        second: { optionLabels: ['x7r'] },
      }).equivalent,
    ).toBe(true);
  });

  it('compares MULTI_SELECT as a set, ignoring order', () => {
    expect(
      compare({
        dataType: 'MULTI_SELECT',
        first: { optionCodes: ['SMD', 'Through Hole'] },
        second: { optionCodes: ['Through Hole', 'SMD'] },
      }).result,
    ).toBe('EXACT_EQUAL');
  });

  it('reports a different MULTI_SELECT membership as different', () => {
    expect(
      compare({
        dataType: 'MULTI_SELECT',
        first: { optionCodes: ['SMD'] },
        second: { optionCodes: ['SMD', 'Through Hole'] },
      }).result,
    ).toBe('DIFFERENT');
  });

  it('does not invent an option that was not recorded', () => {
    const comparison = compare({
      dataType: 'MULTI_SELECT',
      first: { optionCodes: ['SMD'] },
      second: { optionCodes: [] },
    });

    expect(comparison.result).toBe('INCOMPARABLE');
    expect(comparison.reason).toBe('MISSING_VALUE');
  });
});

// ---------------------------------------------------------------------------
// Definition-level helper + display parsing
// ---------------------------------------------------------------------------

describe('areValuesEquivalent', () => {
  it('accepts a definition carrying its own tolerance', () => {
    const comparison = areValuesEquivalent({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      units: UNITS,
      first: { amount: 1000, unit: 'ohm' },
      second: { amount: 1, unit: 'kohm' },
      validationRules: null,
    });

    expect(comparison.equivalent).toBe(true);
  });

  it('reads a percentage tolerance from the definition rules', () => {
    const comparison = areValuesEquivalent({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      units: UNITS,
      first: { amount: 4.7, unit: 'kohm' },
      second: { amount: 4.73, unit: 'kohm' },
      validationRules: { tolerance: '1%' },
    });

    expect(comparison.result).toBe('WITHIN_TOLERANCE');
  });

  it('does not widen a 1% tolerance beyond 1%', () => {
    const comparison = areValuesEquivalent({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      units: UNITS,
      first: { amount: 4.7, unit: 'kohm' },
      second: { amount: 4.8, unit: 'kohm' },
      validationRules: { tolerance: '1%' },
    });

    expect(comparison.result).toBe('DIFFERENT');
  });
});

describe('display parsing', () => {
  it('reads an amount and unit out of a display string', () => {
    expect(parseAmountAndUnit('330Ω')).toEqual({ amount: 330, unit: 'Ω' });
    expect(parseAmountAndUnit('1 kohm')).toEqual({ amount: 1, unit: 'kohm' });
    expect(parseAmountAndUnit('0.125 W')).toEqual({ amount: 0.125, unit: 'W' });
    expect(parseAmountAndUnit('0805')).toEqual({ amount: 805, unit: null });
    expect(parseAmountAndUnit('-40 °C')).toEqual({
      amount: -40,
      unit: '°C',
    });
  });

  it('yields no amount for text it cannot read, rather than zero', () => {
    expect(parseAmountAndUnit('Surface Mount')).toEqual({
      amount: null,
      unit: null,
    });
    expect(parseAmountAndUnit(null)).toEqual({ amount: null, unit: null });
    expect(parseAmountAndUnit('')).toEqual({ amount: null, unit: null });
  });

  it('compares two parsed display strings semantically', () => {
    const first = parseAmountAndUnit('1000 ohm');
    const second = parseAmountAndUnit('1 kohm');
    const comparison = areValuesEquivalent({
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      units: UNITS,
      first: { amount: first.amount, unit: first.unit },
      second: { amount: second.amount, unit: second.unit },
    });

    expect(comparison.result).toBe('UNIT_NORMALIZED_EQUAL');
  });
});
