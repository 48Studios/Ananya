import {
  ATTRIBUTE_MATCH_SIGNAL_LABELS,
  ATTRIBUTE_MATCH_SIGNALS,
  resolveAttributeTerm,
  scoreAttributeDefinition,
  termTokens,
  termVariants,
  type AttributeResolutionContext,
  type ResolvableAttributeDefinition,
} from './attribute-resolution';
import type { UnitRef } from './attribute-value-semantics';

/**
 * Pass 4 unit coverage for scored attribute resolution.
 *
 * The definitions mirror the electronics Data Pack (`resistance`,
 * `voltage_rating`, `power_rating`, `package`, ...) and the canonical codes
 * mirror `ATTRIBUTE_CODE_ALIASES` in `ml.service.ts`, because production resolution
 * runs through that shared vocabulary. The point of these tests is the pair of
 * guarantees Pass 4 adds on top of Pass 3: an authoritative claim resolves, and
 * two authoritative claims never do.
 */
const UNITS: UnitRef[] = [
  {
    name: 'ohm',
    category: 'Resistance',
    isBaseUnit: true,
    conversionFactor: 1,
    precision: 2,
  },
  {
    name: 'kohm',
    category: 'Resistance',
    isBaseUnit: false,
    conversionFactor: 1000,
    precision: 3,
  },
  {
    name: 'V',
    category: 'Voltage',
    isBaseUnit: true,
    conversionFactor: 1,
    precision: 2,
  },
  {
    name: 'mV',
    category: 'Voltage',
    isBaseUnit: false,
    conversionFactor: 0.001,
    precision: 3,
  },
  {
    name: 'W',
    category: 'Power',
    isBaseUnit: true,
    conversionFactor: 1,
    precision: 3,
  },
  {
    name: 'A',
    category: 'Current',
    isBaseUnit: true,
    conversionFactor: 1,
    precision: 3,
  },
  {
    name: 'mA',
    category: 'Current',
    isBaseUnit: false,
    conversionFactor: 0.001,
    precision: 3,
  },
];

function definition(
  overrides: Partial<ResolvableAttributeDefinition> = {},
): ResolvableAttributeDefinition {
  return {
    id: 'def-resistance',
    code: 'resistance',
    name: 'Resistance',
    dataType: 'QUANTITY',
    unitCategory: 'Resistance',
    defaultUnit: 'ohm',
    aliases: [],
    isActive: true,
    ...overrides,
  };
}

const RESISTANCE = definition();
const VOLTAGE = definition({
  id: 'def-voltage',
  code: 'voltage_rating',
  name: 'Voltage Rating',
  unitCategory: 'Voltage',
  defaultUnit: 'V',
});
const POWER = definition({
  id: 'def-power',
  code: 'power_rating',
  name: 'Power Rating',
  unitCategory: 'Power',
  defaultUnit: 'W',
});
const CURRENT = definition({
  id: 'def-current',
  code: 'forward_current',
  name: 'Forward Current (If)',
  unitCategory: 'Current',
  defaultUnit: 'mA',
});
const PACKAGE = definition({
  id: 'def-package',
  code: 'package',
  name: 'Package / Case',
  dataType: 'SELECT',
  unitCategory: null,
  defaultUnit: null,
});
const TOLERANCE = definition({
  id: 'def-tolerance',
  code: 'tolerance',
  name: 'Tolerance',
  unitCategory: 'Percentage',
  defaultUnit: '%',
});

const CATALOG: ResolvableAttributeDefinition[] = [
  RESISTANCE,
  VOLTAGE,
  POWER,
  CURRENT,
  PACKAGE,
  TOLERANCE,
];

/** Mirrors `ATTRIBUTE_CODE_ALIASES` from the shared ML vocabulary. */
const CANONICAL: Record<string, string> = {
  power: 'power_rating',
  voltage: 'voltage_rating',
  current: 'forward_current',
};

function resolve(
  extractedCode: string,
  options: {
    definitions?: ResolvableAttributeDefinition[];
    context?: AttributeResolutionContext;
    canonical?: boolean;
  } = {},
) {
  return resolveAttributeTerm({
    extractedCode,
    definitions: options.definitions ?? CATALOG,
    context: options.context,
    canonicalCode:
      options.canonical === false ? null : (CANONICAL[extractedCode] ?? null),
  });
}

// ---------------------------------------------------------------------------
// Term normalisation
// ---------------------------------------------------------------------------

describe('term normalisation', () => {
  it('splits a term into words across every separator style', () => {
    expect(termTokens('resistance_value')).toEqual(['resistance', 'value']);
    expect(termTokens('Resistance Value')).toEqual(['resistance', 'value']);
    expect(termTokens('ResistanceValue')).toEqual(['resistance', 'value']);
    expect(termTokens('rated-voltage')).toEqual(['rated', 'voltage']);
  });

  it('reduces qualified datasheet wording to the bare term', () => {
    expect(termVariants('nominal_resistance')).toContain('resistance');
    expect(termVariants('rated_voltage')).toContain('voltage');
    expect(termVariants('working_voltage')).toContain('voltage');
    expect(termVariants('maximum_operating_voltage')).toContain('voltage');
    expect(termVariants('Resistance Value')).toContain('resistance');
    expect(termVariants('Nominal Resistance Value')).toContain('resistance');
  });

  it('strips qualifiers from both ends in a bounded number of passes', () => {
    const variants = termVariants('absolute maximum rated voltage');
    expect(variants).toContain('voltage');
    // Bounded: the original term leads, and the list cannot grow without limit.
    expect(variants[0]).toBe('absolute_maximum_rated_voltage');
    expect(variants.length).toBeLessThanOrEqual(10);
  });

  it('leaves a bare term untouched and does not invent variants', () => {
    expect(termVariants('resistance')).toEqual(['resistance']);
    expect(termVariants('')).toEqual([]);
  });

  it('does not treat a meaningful qualifier as noise', () => {
    // `thermal` distinguishes a different quantity and is not a qualifier, so it
    // is never stripped.
    expect(termVariants('thermal_resistance')).toEqual(['thermal_resistance']);
    expect(termVariants('forward_current')).toEqual(['forward_current']);
    expect(termVariants('reverse_voltage')).toEqual(['reverse_voltage']);
  });
});

// ---------------------------------------------------------------------------
// §4 / §5 — matching signals
// ---------------------------------------------------------------------------

describe('attribute match signals', () => {
  it('matches an extracted code against the attribute code', () => {
    const score = scoreAttributeDefinition({
      extractedCode: 'resistance',
      definition: RESISTANCE,
    });

    expect(score?.primarySignal).toBe('EXACT_CODE');
    expect(score?.signals).toContain('EXACT_CODE');
    expect(score!.score).toBeGreaterThan(0.9);
  });

  it('matches a datasheet property onto the canonical attribute through aliases', () => {
    // `power` is a documented synonym of `power_rating` in the shared vocabulary.
    const score = scoreAttributeDefinition({
      extractedCode: 'power',
      definition: POWER,
      canonicalCode: 'power_rating',
    });

    expect(score?.primarySignal).toBe('CANONICAL_CODE');
    expect(score?.matchedTerm).toBe('power_rating');
  });

  it('matches a declared attribute alias', () => {
    const score = scoreAttributeDefinition({
      extractedCode: 'ohm_value',
      definition: definition({ aliases: ['Ohm Value'] }),
    });

    expect(score?.primarySignal).toBe('EXACT_ALIAS');
    expect(score?.signals).toContain('EXACT_ALIAS');
  });

  it('matches an attribute name', () => {
    const score = scoreAttributeDefinition({
      extractedCode: 'Voltage Rating',
      definition: definition({
        id: 'def-voltage-named',
        code: 'v_rating',
        name: 'Voltage Rating',
        unitCategory: 'Voltage',
        defaultUnit: 'V',
      }),
    });

    expect(score?.primarySignal).toBe('EXACT_NAME');
  });

  it('prefers the code match when a code normalises to the same term as the name', () => {
    // `voltage_rating` is the same term as `Voltage Rating` once punctuation is
    // ignored, and the code is the more precise of the two.
    const score = scoreAttributeDefinition({
      extractedCode: 'Voltage Rating',
      definition: VOLTAGE,
    });

    expect(score?.primarySignal).toBe('EXACT_CODE');
  });

  it('matches a qualified datasheet term against the bare attribute', () => {
    for (const term of [
      'nominal_resistance',
      'resistance_value',
      'rated_voltage',
      'working_voltage',
      'maximum_operating_voltage',
    ]) {
      const target = term.includes('voltage') ? VOLTAGE : RESISTANCE;
      const score = scoreAttributeDefinition({
        extractedCode: term,
        definition: target,
      });
      expect(score?.primarySignal).toBe('DATASHEET_VARIANT');
    }
  });

  it('matches a Data Pack attribute alias', () => {
    const score = scoreAttributeDefinition({
      extractedCode: 'cap',
      definition: definition({
        id: 'def-capacitance',
        code: 'capacitance',
        name: 'Capacitance',
        unitCategory: 'Capacitance',
        defaultUnit: 'uF',
      }),
      context: {
        packAttributeAliases: { capacitance: ['cap', 'capacity', 'val'] },
      },
    });

    expect(score?.primarySignal).toBe('PACK_ALIAS');
  });

  it('uses the Data Pack alias to match qualified wording too', () => {
    const score = scoreAttributeDefinition({
      extractedCode: 'capacity_value',
      definition: definition({
        id: 'def-capacitance',
        code: 'capacitance',
        name: 'Capacitance',
      }),
      context: { packAttributeAliases: { capacitance: ['capacity'] } },
    });

    expect(score?.signals).toContain('PACK_ALIAS');
  });

  it('records token overlap as a ranking signal only', () => {
    const score = scoreAttributeDefinition({
      extractedCode: 'resistance_value',
      definition: RESISTANCE,
    });

    expect(score?.signals).toContain('TOKEN_OVERLAP');
    // The variance still came from the authoritative variant match, not overlap.
    expect(score?.primarySignal).toBe('DATASHEET_VARIANT');
  });

  it('makes no candidate out of partial overlap alone', () => {
    // `thermal_resistance` shares the word `resistance` but is a different
    // quantity, and no definition authoritatively claims it.
    expect(
      scoreAttributeDefinition({
        extractedCode: 'thermal_resistance',
        definition: RESISTANCE,
      }),
    ).toBeNull();

    expect(resolve('thermal_resistance').state).toBe('UNRESOLVED');
  });

  it('makes no candidate out of an unrelated property', () => {
    expect(resolve('mounting_hole_diameter').state).toBe('UNRESOLVED');
    expect(resolve('mystery_property').state).toBe('UNRESOLVED');
  });

  it('names every signal it can emit', () => {
    for (const signal of ATTRIBUTE_MATCH_SIGNALS) {
      expect(ATTRIBUTE_MATCH_SIGNAL_LABELS[signal]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// §5 — corroborating and negative signals
// ---------------------------------------------------------------------------

describe('resolution evidence', () => {
  it('rewards a Data Pack expected attribute for the part type', () => {
    const without = resolve('resistance');
    const withExpected = resolve('resistance', {
      context: { expectedAttributeCodes: ['resistance', 'tolerance'] },
    });

    expect(withExpected.confidence).toBeGreaterThan(without.confidence);
    expect(withExpected.reasons).toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.EXPECTED_BY_CATEGORY,
    );
  });

  it('reaches full confidence only with corroboration', () => {
    // An authoritative claim alone is strong, not certain: independent
    // configuration has to agree before the number reaches the top.
    const alone = resolve('resistance');
    const corroborated = resolve('resistance', {
      context: {
        expectedAttributeCodes: ['resistance'],
        categoryAttributeCodes: ['resistance'],
        units: UNITS,
        extractedUnit: 'ohm',
        extractedValue: 300,
      },
    });

    expect(alone.confidence).toBeLessThan(1);
    expect(corroborated.confidence).toBeGreaterThan(alone.confidence);
    expect(corroborated.confidence).toBeLessThanOrEqual(1);
  });

  it('rewards an attribute bound to the component category', () => {
    const result = resolve('resistance', {
      context: { categoryAttributeCodes: ['resistance'] },
    });

    expect(result.reasons).toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.BOUND_TO_CATEGORY,
    );
  });

  it('rewards a unit that measures the declared dimension', () => {
    const result = resolve('resistance', {
      context: { units: UNITS, extractedUnit: 'ohm' },
    });

    expect(result.reasons).toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.UNIT_COMPATIBLE,
    );
  });

  it('penalises a unit from a different dimension and says so', () => {
    const result = resolve('resistance', {
      context: { units: UNITS, extractedUnit: 'mV' },
    });

    expect(result.state).toBe('RESOLVED');
    expect(result.reasons).toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.UNIT_CATEGORY_MISMATCH,
    );
    expect(result.confidence).toBeLessThan(resolve('resistance').confidence);
  });

  it('says nothing about units when the catalog was not supplied', () => {
    const result = resolve('resistance', {
      context: { extractedUnit: 'mV' },
    });

    expect(result.reasons).not.toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.UNIT_CATEGORY_MISMATCH,
    );
    expect(result.reasons).not.toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.UNIT_COMPATIBLE,
    );
  });

  it('penalises a value that does not fit the attribute data type', () => {
    const result = resolve('resistance', {
      context: { extractedValue: 'not a number' },
    });

    // `resistance` is QUANTITY, so a non-numeric extraction is a poorer fit. The
    // coercion still decides the value is invalid; this only ranks the match.
    expect(result.state).toBe('RESOLVED');
    expect(result.reasons).toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.TYPE_MISMATCH,
    );
  });

  it('penalises a deactivated definition', () => {
    const inactive = resolve('resistance', {
      definitions: [definition({ isActive: false })],
    });

    expect(inactive.reasons).toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.DEFINITION_INACTIVE,
    );
  });

  it('reports the type as compatible when it fits', () => {
    const result = resolve('resistance', {
      context: { extractedValue: 300 },
    });

    expect(result.reasons).toContain(
      ATTRIBUTE_MATCH_SIGNAL_LABELS.TYPE_COMPATIBLE,
    );
  });
});

// ---------------------------------------------------------------------------
// §6 — ambiguity stays explicit
// ---------------------------------------------------------------------------

describe('ambiguity', () => {
  it('stays ambiguous when two definitions claim the same term', () => {
    const result = resolve('resistance', {
      definitions: [
        RESISTANCE,
        definition({ id: 'def-resistance-2', name: 'Resistance (legacy)' }),
      ],
    });

    expect(result.state).toBe('AMBIGUOUS');
    expect(result.definition).toBeNull();
    expect(result.ranked).toHaveLength(2);
    expect(result.ranked.map((entry) => entry.definitionId).sort()).toEqual([
      'def-resistance',
      'def-resistance-2',
    ]);
  });

  it('ranks the candidates and explains the distinction', () => {
    // Configured claims only: the Data Pack lists `power` as an alias of both
    // `peak_power` and `power_dissipation`, so three attributes genuinely claim
    // the term and a human has to choose.
    const result = resolve('power', {
      definitions: [
        POWER,
        definition({
          id: 'def-peak-power',
          code: 'peak_power',
          name: 'Peak Power',
          unitCategory: 'Power',
          defaultUnit: 'W',
        }),
        definition({
          id: 'def-power-dissipation',
          code: 'power_dissipation',
          name: 'Power Dissipation',
          unitCategory: 'Power',
          defaultUnit: 'W',
        }),
      ],
      context: {
        expectedAttributeCodes: ['power_rating'],
        units: UNITS,
        extractedUnit: 'W',
        packAttributeAliases: {
          peak_power: ['power'],
          power_dissipation: ['power'],
        },
      },
    });

    expect(result.state).toBe('AMBIGUOUS');
    expect(result.ranked).toHaveLength(3);
    // Deterministically ordered by score, so the best fit is listed first.
    const scores = result.ranked.map((entry) => entry.score);
    expect([...scores].sort((first, second) => second - first)).toEqual(scores);
    // The Data Pack's expected attribute ranks the canonical definition first.
    expect(result.ranked[0]!.code).toBe('power_rating');
    for (const entry of result.ranked) {
      expect(entry.reasons.length).toBeGreaterThan(0);
      expect(entry.confidence).toBeGreaterThan(0);
    }
    expect(result.reasons[0]).toContain('claim this term');
  });

  it('does not invent a claim from a shared word', () => {
    // `power_dissipation` shares the word `power` but nothing authoritative says
    // it is the same attribute, so it is not offered as a candidate. Expressing
    // that relationship is a job for an alias, not for a guess.
    const result = resolve('power', {
      definitions: [
        POWER,
        definition({
          id: 'def-power-dissipation',
          code: 'power_dissipation',
          name: 'Power Dissipation',
          unitCategory: 'Power',
          defaultUnit: 'W',
        }),
      ],
    });

    expect(result.state).toBe('RESOLVED');
    expect(result.definition?.code).toBe('power_rating');
    expect(result.ranked).toHaveLength(1);
  });

  it('does not pick a winner between two equally authoritative claims', () => {
    const result = resolve('voltage', {
      definitions: [
        VOLTAGE,
        definition({
          id: 'def-max-voltage',
          code: 'max_voltage',
          name: 'Maximum Voltage',
          unitCategory: 'Voltage',
          defaultUnit: 'V',
        }),
      ],
      context: { units: UNITS, extractedUnit: 'V' },
    });

    expect(result.state).toBe('AMBIGUOUS');
    expect(result.definition).toBeNull();
  });

  it('resolves when only one definition claims a term the others merely share', () => {
    const result = resolve('maximum_operating_voltage', {
      definitions: [
        VOLTAGE,
        definition({
          id: 'def-voltage-2',
          code: 'supply_voltage',
          name: 'Supply Voltage',
          unitCategory: 'Voltage',
          defaultUnit: 'V',
        }),
      ],
      context: { units: UNITS, extractedUnit: 'V' },
    });

    expect(result.state).toBe('RESOLVED');
    expect(result.definition?.code).toBe('voltage_rating');
  });

  it('orders ambiguity candidates deterministically across runs', () => {
    const build = () =>
      resolve('power', {
        definitions: [
          POWER,
          definition({
            id: 'def-peak-power',
            code: 'peak_power',
            name: 'Peak Power',
            unitCategory: 'Power',
            defaultUnit: 'W',
          }),
        ],
      });

    expect(build().ranked.map((entry) => entry.code)).toEqual(
      build().ranked.map((entry) => entry.code),
    );
  });

  it('reports every resolution state the caller must handle', () => {
    const ambiguous = resolve('resistance', {
      definitions: [RESISTANCE, definition({ id: 'def-2' })],
    });

    expect([
      resolve('resistance').state,
      ambiguous.state,
      resolve('mystery').state,
    ]).toEqual(['RESOLVED', 'AMBIGUOUS', 'UNRESOLVED']);
  });
});

// ---------------------------------------------------------------------------
// Resolution output shape
// ---------------------------------------------------------------------------

describe('resolution output', () => {
  it('carries the resolved definition and its confidence', () => {
    const result = resolve('resistance', {
      context: { units: UNITS, extractedUnit: 'ohm' },
    });

    expect(result.state).toBe('RESOLVED');
    expect(result.definition?.id).toBe('def-resistance');
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.reasons[0]).toBeTruthy();
  });

  it('returns an empty candidate list for a term nothing matches', () => {
    const result = resolve('mystery_property');

    expect(result.definition).toBeNull();
    expect(result.ranked).toEqual([]);
    expect(result.reasons[0]).toContain('no configured attribute matches');
  });

  it('never returns a definition for an ambiguous result', () => {
    const result = resolve('resistance', {
      definitions: [RESISTANCE, definition({ id: 'def-2' })],
    });

    expect(result.state).toBe('AMBIGUOUS');
    expect(result.definition).toBeNull();
  });

  it('resolves the tolerance attribute without any unit in the catalog', () => {
    const result = resolve('tolerance');
    expect(result.state).toBe('RESOLVED');
    expect(result.definition?.code).toBe('tolerance');
  });
});
