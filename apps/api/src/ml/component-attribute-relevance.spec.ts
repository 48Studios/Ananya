import {
  buildAttributeSuggestions,
  classifyPackageMounting,
  confidenceLevelFor,
  optionCodeForMountingClass,
  type AttributeSuggestion,
  type BuildAttributeRelevanceInput,
  type MlAttributeSuggestion,
  type RelevanceBinding,
  type RelevanceCategory,
  type RelevanceDefinition,
  type RelevanceExtractedAttribute,
} from './component-attribute-relevance';
import type { UnitRef } from './attribute-value-semantics';

function definition(
  overrides: Partial<RelevanceDefinition> & {
    id: string;
    code: string;
    name: string;
  },
): RelevanceDefinition {
  return {
    dataType: 'TEXT',
    unitCategory: null,
    defaultUnit: null,
    aliases: [],
    validationRules: null,
    isActive: true,
    options: [],
    ...overrides,
  };
}

function binding(
  attributeDefinitionId: string,
  overrides: Partial<RelevanceBinding> = {},
): RelevanceBinding {
  return {
    attributeDefinitionId,
    isRequired: false,
    sortOrder: 0,
    inheritedFromCategoryId: null,
    ...overrides,
  };
}

function category(
  overrides: Partial<RelevanceCategory> & {
    categoryId: string;
    categoryName: string;
  },
): RelevanceCategory {
  return {
    confidence: 0.9,
    confidenceLevel: 'HIGH',
    isPrimary: true,
    bindings: [],
    ...overrides,
  };
}

/** The live library's vocabulary for the two attributes this file exercises. */
const PACKAGE = definition({
  id: 'def-package',
  code: 'package',
  name: 'Package / Case',
  dataType: 'SELECT',
  options: [
    { code: '0805', label: '0805 (2012 Metric)' },
    { code: 'DIP-8', label: 'DIP-8 (Through Hole)' },
    { code: 'TO-220', label: 'TO-220 (Through Hole)' },
  ],
});
const MOUNTING = definition({
  id: 'def-mounting',
  code: 'mounting_type',
  name: 'Mounting Type',
  dataType: 'SELECT',
  options: [
    { code: 'SMD', label: 'Surface Mount (SMD/SMT)' },
    { code: 'Through Hole', label: 'Through Hole (THT)' },
    { code: 'Panel Mount', label: 'Panel Mount' },
  ],
});
const RESISTANCE = definition({
  id: 'def-resistance',
  code: 'resistance',
  name: 'Resistance',
  dataType: 'QUANTITY',
  unitCategory: 'Resistance',
  defaultUnit: 'ohm',
});

const OHM_UNITS: UnitRef[] = [
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
];

function build(
  overrides: Partial<BuildAttributeRelevanceInput> = {},
): AttributeSuggestion[] {
  return buildAttributeSuggestions({
    definitions: [PACKAGE, MOUNTING, RESISTANCE],
    categories: [],
    ...overrides,
  });
}

function byId(
  suggestions: AttributeSuggestion[],
  attributeDefinitionId: string,
): AttributeSuggestion {
  const found = suggestions.find(
    (suggestion) => suggestion.attributeDefinitionId === attributeDefinitionId,
  );
  if (!found) {
    throw new Error(
      `expected a suggestion for ${attributeDefinitionId}, got ${suggestions
        .map((suggestion) => suggestion.code)
        .join(', ')}`,
    );
  }
  return found;
}

describe('package → mounting classification', () => {
  it('classifies chip footprints, packaged semiconductors and through-hole families', () => {
    expect(classifyPackageMounting('0805')?.classification).toBe('SMD');
    expect(classifyPackageMounting('0402')?.classification).toBe('SMD');
    expect(classifyPackageMounting('SOT-23')?.classification).toBe('SMD');
    expect(classifyPackageMounting('SOIC-8')?.classification).toBe('SMD');
    expect(classifyPackageMounting('QFN-32')?.classification).toBe('SMD');
    expect(classifyPackageMounting('BGA')?.classification).toBe('SMD');
    expect(classifyPackageMounting('DIP-8')?.classification).toBe(
      'THROUGH_HOLE',
    );
    expect(classifyPackageMounting('TO-220')?.classification).toBe(
      'THROUGH_HOLE',
    );
    expect(classifyPackageMounting('Axial')?.classification).toBe(
      'THROUGH_HOLE',
    );
    expect(
      classifyPackageMounting('Radial Can (Through Hole)')?.classification,
    ).toBe('THROUGH_HOLE');
  });

  it('returns null for a footprint the rules do not recognise', () => {
    expect(classifyPackageMounting('XYZ-123')).toBeNull();
    expect(classifyPackageMounting('')).toBeNull();
  });

  it('resolves a classification to the definition\u2019s own option', () => {
    expect(optionCodeForMountingClass(MOUNTING, 'SMD')?.code).toBe('SMD');
    expect(optionCodeForMountingClass(MOUNTING, 'THROUGH_HOLE')?.code).toBe(
      'Through Hole',
    );
    expect(optionCodeForMountingClass(MOUNTING, 'PANEL_MOUNT')?.code).toBe(
      'Panel Mount',
    );
  });

  it('resolves through a label when the code does not name the classification', () => {
    const labelOnly = definition({
      id: 'def-m2',
      code: 'mounting_type',
      name: 'Mounting Type',
      dataType: 'SELECT',
      options: [{ code: 'TH', label: 'Through Hole (THT)' }],
    });
    expect(optionCodeForMountingClass(labelOnly, 'THROUGH_HOLE')?.code).toBe(
      'TH',
    );
  });

  it('produces nothing when the definition has no matching option', () => {
    const noOptions = definition({
      id: 'def-m3',
      code: 'mounting_type',
      name: 'Mounting Type',
      dataType: 'SELECT',
      options: [],
    });
    expect(optionCodeForMountingClass(noOptions, 'SMD')).toBeNull();
  });
});

describe('confidence bands', () => {
  it('reuses the repo bands', () => {
    expect(confidenceLevelFor(0.9)).toBe('HIGH');
    expect(confidenceLevelFor(0.85)).toBe('HIGH');
    expect(confidenceLevelFor(0.7)).toBe('MEDIUM');
    expect(confidenceLevelFor(0.6)).toBe('MEDIUM');
    expect(confidenceLevelFor(0.59)).toBe('LOW');
  });
});

describe('relevance from category bindings', () => {
  it('surfaces every bound attribute, in the category\u2019s own order', () => {
    const suggestions = build({
      categories: [
        category({
          categoryId: 'cat-conn',
          categoryName: 'Connectors',
          bindings: [
            binding(MOUNTING.id, { sortOrder: 2 }),
            binding(PACKAGE.id, { sortOrder: 1, isRequired: true }),
          ],
        }),
      ],
    });

    expect(suggestions.map((suggestion) => suggestion.code)).toEqual([
      'package',
      'mounting_type',
    ]);
    const packageSuggestion = byId(suggestions, PACKAGE.id);
    expect(packageSuggestion.isRequired).toBe(true);
    expect(packageSuggestion.relevance[0]).toMatchObject({
      type: 'category_binding',
      categoryId: 'cat-conn',
      categoryName: 'Connectors',
    });
    expect(packageSuggestion.categoryIds).toEqual(['cat-conn']);
  });

  it('reports a bound attribute with no evidence as relevant, value not determined', () => {
    const suggestions = build({
      categories: [
        category({
          categoryId: 'cat-conn',
          categoryName: 'Connectors',
          bindings: [binding(MOUNTING.id)],
        }),
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    expect(mounting.suggestedValue).toBeNull();
    expect(mounting.confidence).toBeNull();
    expect(mounting.confidenceLevel).toBeNull();
    expect(mounting.existingDisplay).toBeNull();
    expect(mounting.conflict).toBeNull();
  });

  it('marks an inherited binding as inherited, and keeps it weaker', () => {
    const suggestions = build({
      categories: [
        category({
          categoryId: 'cat-conn',
          categoryName: 'Connectors',
          bindings: [
            binding(PACKAGE.id, { inheritedFromCategoryId: 'cat-elec' }),
          ],
        }),
      ],
    });

    const evidence = byId(suggestions, PACKAGE.id).relevance[0]!;
    expect(evidence.type).toBe('category_binding_inherited');
    expect(evidence.description).toContain('inherited');
    expect(evidence.weight).toBeLessThan(0.9);
  });

  it('ignores a definition that is not active', () => {
    const suggestions = build({
      definitions: [PACKAGE, MOUNTING, RESISTANCE],
      categories: [
        category({
          categoryId: 'cat-conn',
          categoryName: 'Connectors',
          bindings: [binding(PACKAGE.id), { ...binding(MOUNTING.id) }],
        }),
      ],
    });
    expect(suggestions).toHaveLength(2);

    const inactive = build({
      definitions: [{ ...MOUNTING, isActive: false }, PACKAGE],
      categories: [
        category({
          categoryId: 'cat-conn',
          categoryName: 'Connectors',
          bindings: [binding(MOUNTING.id)],
        }),
      ],
    });
    expect(inactive).toEqual([]);
  });

  it('returns nothing when no definition matches a binding', () => {
    expect(
      build({
        categories: [
          category({
            categoryId: 'cat-conn',
            categoryName: 'Connectors',
            bindings: [binding('def-unknown')],
          }),
        ],
      }),
    ).toEqual([]);
  });
});

describe('relevance beyond the bindings', () => {
  it('surfaces a Data Pack expectation with its own reason', () => {
    const suggestions = build({
      packExpectations: [
        {
          definitionId: RESISTANCE.id,
          categoryId: 'cat-res',
          categoryName: 'Resistors',
          aliases: ['res', 'ohm'],
          reason: 'Data Pack expects Resistance for Resistors',
        },
      ],
    });

    const resistance = byId(suggestions, RESISTANCE.id);
    expect(resistance.relevance[0]).toMatchObject({
      type: 'data_pack_expectation',
      source: 'datapack:expected_attributes',
      categoryId: 'cat-res',
    });
    expect(resistance.suggestedValue).toBeNull();
  });

  it('surfaces an attribute the supplied text names', () => {
    const suggestions = build({
      text: ['Gold contact plating finish'],
      definitions: [
        definition({
          id: 'def-plating',
          code: 'contact_plating',
          name: 'Contact Plating',
          dataType: 'SELECT',
          aliases: ['Plating', 'Contact Finish'],
          options: [
            { code: 'Gold', label: 'Gold' },
            { code: 'Tin', label: 'Tin' },
          ],
        }),
      ],
    });

    const plating = byId(suggestions, 'def-plating');
    expect(plating.relevance[0]).toMatchObject({ type: 'attribute_mention' });
    expect(plating.relevance[0]!.description).toContain('Contact Plating');
    expect(plating.suggestedValue?.optionCode).toBe('Gold');
    expect(plating.confidenceLevel).toBe('MEDIUM');
  });

  it('does not treat a short alias as a mention', () => {
    const suggestions = build({
      text: ['10k cap resistor 0805'],
      definitions: [
        definition({
          id: 'def-dielectric',
          code: 'dielectric',
          name: 'Dielectric Material',
          dataType: 'SELECT',
          aliases: ['cap'],
          options: [{ code: 'X7R', label: 'X7R (Stable)' }],
        }),
      ],
    });
    expect(suggestions).toEqual([]);
  });

  it('matches a multi-word name across the text', () => {
    const suggestions = build({
      text: ['Operating temperature range -40 to 105 C'],
      definitions: [
        definition({
          id: 'def-temp',
          code: 'operating_temperature',
          name: 'Operating Temperature',
          dataType: 'QUANTITY',
        }),
      ],
    });
    expect(suggestions[0]!.relevance[0]).toMatchObject({
      type: 'attribute_mention',
    });
  });

  it('surfaces an attribute the component already records', () => {
    const suggestions = build({
      existingValues: new Map([[PACKAGE.id, '0805']]),
    });

    const pkg = byId(suggestions, PACKAGE.id);
    expect(pkg.relevance[0]).toMatchObject({ type: 'existing_value' });
    expect(pkg.existingDisplay).toBe('0805');
  });

  it('surfaces an attribute the extractor produced a value for', () => {
    const suggestions = build({
      extracted: [
        {
          definitionId: RESISTANCE.id,
          value: 10000,
          unit: 'ohm',
          formatted: '10 kohm',
          confidence: 0.92,
          confidenceLevel: 'HIGH',
          evidence: [
            {
              type: 'datasheet_param',
              description: 'Resistance: 10 kΩ',
              weight: 0.9,
              source: 'extractor:ee_regex',
            },
          ],
        },
      ],
    });

    const resistance = byId(suggestions, RESISTANCE.id);
    expect(resistance.relevance[0]).toMatchObject({
      type: 'extracted_attribute',
    });
    expect(resistance.suggestedValue).toMatchObject({
      value: 10000,
      unit: 'ohm',
      formatted: '10 kohm',
    });
    expect(resistance.confidence).toBe(0.92);
    expect(resistance.confidenceLevel).toBe('HIGH');
    expect(resistance.valueEvidence[0]!.description).toBe('Resistance: 10 kΩ');
  });
});

describe('quantities are resolved, not copied', () => {
  /** A resistance extraction stated as `100 kΩ` in the document. */
  function resistanceExtraction(
    overrides: Record<string, unknown> = {},
  ): RelevanceExtractedAttribute {
    return {
      definitionId: RESISTANCE.id,
      value: 100000,
      unit: 'ohm',
      sourceValue: 100,
      sourceUnit: 'kΩ',
      formatted: '100kΩ',
      confidence: 0.95,
      confidenceLevel: 'HIGH' as const,
      ...overrides,
    };
  }

  it('keeps the source unit when the attribute accepts the dimension', () => {
    const resistance = byId(
      build({
        units: OHM_UNITS,
        extracted: [resistanceExtraction()],
      }),
      RESISTANCE.id,
    );

    // `100 kΩ` stays `100 kΩ` (spelled as the catalog spells it), while the
    // display still quotes the document.
    expect(resistance.suggestedValue).toMatchObject({
      value: 100,
      unit: 'kohm',
      formatted: '100kΩ',
    });
    expect(resistance.valueWithheldReason).toBeNull();
  });

  it('converts into the unit an attribute fixes', () => {
    const ohmsOnly = definition({
      id: 'def-resistance-ohms',
      code: 'resistance_ohms',
      name: 'Resistance (ohms)',
      dataType: 'QUANTITY',
      unitCategory: 'Resistance',
      defaultUnit: 'ohm',
      validationRules: { allowedUnits: ['ohm'] },
    });

    const suggestions = buildAttributeSuggestions({
      definitions: [ohmsOnly],
      categories: [],
      units: OHM_UNITS,
      extracted: [
        { ...resistanceExtraction(), definitionId: 'def-resistance-ohms' },
      ],
    });

    expect(
      byId(suggestions, 'def-resistance-ohms').suggestedValue,
    ).toMatchObject({ value: 100000, unit: 'ohm' });
  });

  it('withholds a value whose unit measures another dimension, and says why', () => {
    // `mV` has to be a real catalog row for the refusal to be about the
    // dimension rather than about an unknown unit.
    const catalog = [
      ...OHM_UNITS,
      {
        name: 'mV',
        category: 'Voltage',
        isBaseUnit: false,
        conversionFactor: 0.001,
        precision: 3,
      },
    ];

    const resistance = byId(
      build({
        units: catalog,
        extracted: [
          resistanceExtraction({
            value: 10,
            unit: 'mV',
            sourceValue: 10,
            sourceUnit: 'mV',
            formatted: '10mV',
          }),
        ],
      }),
      RESISTANCE.id,
    );

    // The attribute stays relevant — the evidence established a value — but
    // nothing is offered to apply, and the reason names the units.
    expect(resistance.suggestedValue).toBeNull();
    expect(resistance.valueWithheldReason).toContain('mV');
    expect(resistance.valueWithheldReason).toMatch(/incompatible/i);
  });

  it('withholds a number that arrived with no unit', () => {
    const resistance = byId(
      build({
        units: OHM_UNITS,
        extracted: [
          resistanceExtraction({
            value: 100,
            unit: null,
            sourceValue: null,
            sourceUnit: null,
            formatted: '100',
          }),
        ],
      }),
      RESISTANCE.id,
    );

    expect(resistance.suggestedValue).toBeNull();
    expect(resistance.valueWithheldReason).toMatch(/no unit/i);
  });

  it('reports no withheld reason when a value was resolved', () => {
    const resistance = byId(
      build({ units: OHM_UNITS, extracted: [resistanceExtraction()] }),
      RESISTANCE.id,
    );

    expect(resistance.valueWithheldReason).toBeNull();
  });
});

describe('canonical values', () => {
  it('maps an extracted choice onto the definition\u2019s option code', () => {
    const dielectric = definition({
      id: 'def-dielectric',
      code: 'dielectric',
      name: 'Dielectric Material',
      dataType: 'SELECT',
      options: [
        { code: 'X7R', label: 'X7R (Stable)' },
        { code: 'C0G/NP0', label: 'C0G / NP0 (Ultra-Stable)' },
      ],
    });
    const suggestions = buildAttributeSuggestions({
      definitions: [dielectric],
      categories: [],
      extracted: [
        {
          definitionId: 'def-dielectric',
          value: 'x7r',
          unit: null,
          formatted: 'x7r',
          confidence: 0.8,
          confidenceLevel: 'MEDIUM',
        },
      ],
    });

    expect(suggestions[0]!.suggestedValue).toMatchObject({
      value: 'X7R',
      optionCode: 'X7R',
      optionLabel: 'X7R (Stable)',
      formatted: 'X7R',
    });
  });

  it('reports relevance without a value when an extracted choice is not an option', () => {
    const dielectric = definition({
      id: 'def-dielectric',
      code: 'dielectric',
      name: 'Dielectric Material',
      dataType: 'SELECT',
      options: [{ code: 'X7R', label: 'X7R (Stable)' }],
    });
    const suggestions = buildAttributeSuggestions({
      definitions: [dielectric],
      categories: [],
      extracted: [
        {
          definitionId: 'def-dielectric',
          value: 'ceramic',
          unit: null,
          formatted: 'ceramic',
          confidence: 0.8,
          confidenceLevel: 'MEDIUM',
        },
      ],
    });

    expect(suggestions[0]!.relevance).toHaveLength(1);
    expect(suggestions[0]!.suggestedValue).toBeNull();
    expect(suggestions[0]!.confidence).toBeNull();
  });

  it('prefers the stronger extracted value when two arrive for one attribute', () => {
    const suggestions = build({
      extracted: [
        {
          definitionId: RESISTANCE.id,
          value: 10000,
          unit: 'ohm',
          formatted: '10 kohm',
          confidence: 0.6,
          confidenceLevel: 'MEDIUM',
        },
        {
          definitionId: RESISTANCE.id,
          value: 10000,
          unit: 'ohm',
          formatted: '10000 ohm',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(byId(suggestions, RESISTANCE.id).suggestedValue?.formatted).toBe(
      '10000 ohm',
    );
  });

  it('builds a multi-select value as an array of codes', () => {
    const multi = definition({
      id: 'def-multi',
      code: 'certifications',
      name: 'Certifications',
      dataType: 'MULTI_SELECT',
      options: [{ code: 'RoHS', label: 'RoHS Compliant' }],
    });
    const suggestions = buildAttributeSuggestions({
      definitions: [multi],
      categories: [],
      extracted: [
        {
          definitionId: 'def-multi',
          value: 'RoHS',
          unit: null,
          formatted: 'RoHS',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(suggestions[0]!.suggestedValue).toMatchObject({
      value: ['RoHS'],
      selectedOptionCodes: ['RoHS'],
    });
  });
});

describe('package → mounting inference', () => {
  it('suggests SMD for a chip footprint', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    expect(mounting.suggestedValue?.optionCode).toBe('SMD');
    expect(mounting.confidence).toBe(0.9);
    expect(mounting.confidenceLevel).toBe('HIGH');
    expect(mounting.valueEvidence[0]).toMatchObject({
      type: 'package_pattern',
      source: 'package:mounting_classification',
    });
    expect(mounting.relevance[0]!.description).toContain('surface-mount');
  });

  it('suggests Through Hole for a through-hole footprint', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: 'DIP-8',
          unit: null,
          formatted: 'DIP-8',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(byId(suggestions, MOUNTING.id).suggestedValue?.optionCode).toBe(
      'Through Hole',
    );
  });

  it('infers from a recorded package when the extractor produced none', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      existingValues: new Map([[PACKAGE.id, 'TO-220']]),
    });

    const mounting = byId(suggestions, MOUNTING.id);
    expect(mounting.suggestedValue?.optionCode).toBe('Through Hole');
  });

  it('does not invent a mounting type for an unrecognised footprint', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: 'CUSTOM-1',
          unit: null,
          formatted: 'CUSTOM-1',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(
      suggestions.find(
        (suggestion) => suggestion.attributeDefinitionId === MOUNTING.id,
      ),
    ).toBeUndefined();
  });

  it('keeps relevance without a value when the definition cannot express it', () => {
    const optionless = definition({
      id: 'def-mounting',
      code: 'mounting_type',
      name: 'Mounting Type',
      dataType: 'SELECT',
      options: [],
    });
    const suggestions = buildAttributeSuggestions({
      definitions: [PACKAGE, optionless],
      categories: [],
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: 'def-mounting',
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    const mounting = byId(suggestions, 'def-mounting');
    expect(mounting.relevance[0]!.type).toBe('package_pattern');
    expect(mounting.suggestedValue).toBeNull();
  });

  it('does not infer when either definition is absent', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(
      suggestions.find((suggestion) => suggestion.name === 'Mounting Type'),
    ).toBeUndefined();
  });
});

describe('conflicts with recorded values', () => {
  it('reports a conflict when the choices genuinely differ', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      existingValues: new Map([[MOUNTING.id, 'Through Hole']]),
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    expect(mounting.conflict).toEqual({
      existingDisplay: 'Through Hole',
      suggestedDisplay: 'SMD',
    });
    // A conflict is also a definitive statement that the two do NOT agree.
    expect(mounting.existingMatches).toBe(false);
  });

  it('positively reports an equivalent recorded value as a match', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      existingValues: new Map([[MOUNTING.id, 'SMD']]),
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    expect(mounting.existingMatches).toBe(true);
    expect(mounting.conflict).toBeNull();
  });

  it('reports no verdict when nothing is recorded', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(byId(suggestions, MOUNTING.id).existingMatches).toBeNull();
  });

  it('stays inconclusive rather than claiming a conflict it cannot establish', () => {
    // A recorded quantity in a unit the catalogue does not know, against a
    // stated one: the comparison is INCOMPARABLE, so it is neither a match nor
    // a conflict — the reviewer decides with both values in front of them.
    const suggestions = build({
      existingValues: new Map([[RESISTANCE.id, '470 furlongs']]),
      extracted: [
        {
          definitionId: RESISTANCE.id,
          value: 470,
          unit: 'ohm',
          formatted: '470Ω',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    const resistance = byId(suggestions, RESISTANCE.id);
    expect(resistance.conflict).toBeNull();
    expect(resistance.existingMatches).toBe(false);
    expect(resistance.existingDisplay).toBe('470 furlongs');
  });

  it('does not report a conflict when the recorded value is the same choice', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      existingValues: new Map([[MOUNTING.id, 'SMD']]),
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(byId(suggestions, MOUNTING.id).conflict).toBeNull();
  });

  it('does not report a conflict for an equivalent value written in another unit', () => {
    const suggestions = build({
      units: OHM_UNITS,
      existingValues: new Map([[RESISTANCE.id, '1 kohm']]),
      extracted: [
        {
          definitionId: RESISTANCE.id,
          value: 1000,
          unit: 'ohm',
          formatted: '1000 ohm',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(byId(suggestions, RESISTANCE.id).conflict).toBeNull();
  });

  it('never claims a conflict it cannot establish', () => {
    // A TEXT attribute the extractor read as a number: the comparison layer
    // reports INCOMPARABLE, and an inconclusive comparison is not a conflict.
    const textDefinition = definition({
      id: 'def-note',
      code: 'note',
      name: 'Note',
      dataType: 'TEXT',
    });
    const suggestions = buildAttributeSuggestions({
      definitions: [textDefinition],
      categories: [],
      existingValues: new Map([['def-note', 'do not populate']]),
      extracted: [
        {
          definitionId: 'def-note',
          value: 42,
          unit: null,
          formatted: '42',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(suggestions[0]!.conflict).toBeNull();
    expect(suggestions[0]!.existingDisplay).toBe('do not populate');
  });

  it('does not report a conflict for a quantity with no unit on either side', () => {
    const suggestions = build({
      existingValues: new Map([[RESISTANCE.id, '470']]),
      extracted: [
        {
          definitionId: RESISTANCE.id,
          value: 470,
          unit: null,
          formatted: '470',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(byId(suggestions, RESISTANCE.id).conflict).toBeNull();
  });
});

describe('multiple category candidates', () => {
  const GENDER = definition({
    id: 'def-gender',
    code: 'gender',
    name: 'Gender',
    dataType: 'SELECT',
    options: [{ code: 'Male', label: 'Male (Pin)' }],
  });

  it('attributes each attribute to the categories that establish it', () => {
    const suggestions = buildAttributeSuggestions({
      definitions: [PACKAGE, GENDER],
      categories: [
        category({
          categoryId: 'cat-conn',
          categoryName: 'Connectors',
          isPrimary: true,
          bindings: [binding(PACKAGE.id), binding(GENDER.id)],
        }),
        category({
          categoryId: 'cat-term',
          categoryName: 'Terminal Blocks',
          isPrimary: false,
          confidence: 0.74,
          confidenceLevel: 'MEDIUM',
          bindings: [binding(PACKAGE.id)],
        }),
      ],
    });

    const pkg = byId(suggestions, PACKAGE.id);
    expect(pkg.categoryIds.sort()).toEqual(['cat-conn', 'cat-term']);
    expect(pkg.consideredCategoryIds).toEqual(['cat-conn', 'cat-term']);

    const gender = byId(suggestions, GENDER.id);
    expect(gender.categoryIds).toEqual(['cat-conn']);
    expect(gender.consideredCategoryIds).toContain('cat-term');
  });
});

describe('ordering', () => {
  it('keeps bound attributes in category order and appends discoveries', () => {
    const suggestions = buildAttributeSuggestions({
      definitions: [PACKAGE, MOUNTING, RESISTANCE],
      categories: [
        category({
          categoryId: 'cat-conn',
          categoryName: 'Connectors',
          bindings: [binding(MOUNTING.id, { sortOrder: 1 })],
        }),
      ],
      extracted: [
        {
          definitionId: RESISTANCE.id,
          value: 4700,
          unit: 'ohm',
          formatted: '4.7 kohm',
          confidence: 0.9,
          confidenceLevel: 'HIGH',
        },
      ],
    });

    expect(suggestions.map((suggestion) => suggestion.code)).toEqual([
      'mounting_type',
      'resistance',
    ]);
  });
});

describe('merging the model\u2019s judgement', () => {
  function mlSuggestion(
    overrides: Partial<MlAttributeSuggestion> & {
      attributeDefinitionId: string;
      code: string;
    },
  ): MlAttributeSuggestion {
    return {
      relevance: [
        {
          type: 'ml_attribute_knowledge',
          description: 'Standard engineering specification for Connectors',
          source: 'domain:electronics_standard',
          weight: 0.8,
        },
      ],
      ...overrides,
    };
  }

  it('adds relevance the local rules did not establish', () => {
    const suggestions = build({
      mlSuggestions: [
        mlSuggestion({
          attributeDefinitionId: RESISTANCE.id,
          code: 'resistance',
        }),
      ],
    });

    const resistance = byId(suggestions, RESISTANCE.id);
    expect(resistance.relevance.map((entry) => entry.type)).toContain(
      'ml_attribute_knowledge',
    );
    expect(resistance.suggestedValue).toBeNull();
  });

  it('takes the model\u2019s value when there is no local one', () => {
    const suggestions = build({
      mlSuggestions: [
        mlSuggestion({
          attributeDefinitionId: MOUNTING.id,
          code: 'mounting_type',
          suggestedValue: 'SMD',
          formatted: 'SMD',
          confidence: 0.85,
          valueEvidence: [
            {
              type: 'ml_attribute_knowledge',
              description: "'surface mount' is the Mounting Type option 'SMD'",
              source: 'canonical:option_mapping',
              weight: 0.85,
            },
          ],
        }),
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    expect(mounting.suggestedValue).toMatchObject({ optionCode: 'SMD' });
    expect(mounting.confidence).toBe(0.85);
    expect(mounting.confidenceLevel).toBe('HIGH');
    expect(mounting.valueEvidence.map((entry) => entry.source)).toContain(
      'canonical:option_mapping',
    );
  });

  it('raises confidence when the two readings agree, within a ceiling', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
      mlSuggestions: [
        mlSuggestion({
          attributeDefinitionId: MOUNTING.id,
          code: 'mounting_type',
          suggestedValue: 'SMD',
          confidence: 0.92,
        }),
      ],
    });

    // The package rule alone gives 0.90 and the model 0.92; agreement credits the
    // stronger reading by a bounded amount rather than adding both.
    const mounting = byId(suggestions, MOUNTING.id);
    expect(mounting.suggestedValue?.optionCode).toBe('SMD');
    expect(mounting.confidence).toBeCloseTo(0.97);
  });

  it('never lets corroboration approach certainty', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
      mlSuggestions: [
        mlSuggestion({
          attributeDefinitionId: MOUNTING.id,
          code: 'mounting_type',
          suggestedValue: 'SMD',
          confidence: 0.99,
        }),
      ],
    });

    expect(byId(suggestions, MOUNTING.id).confidence).toBeLessThanOrEqual(0.98);
  });

  it('keeps the better-supported value and records the disagreement', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
      mlSuggestions: [
        mlSuggestion({
          attributeDefinitionId: MOUNTING.id,
          code: 'mounting_type',
          suggestedValue: 'Through Hole',
          formatted: 'Through Hole',
          confidence: 0.7,
        }),
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    // The package classification is the stronger statement at 0.9.
    expect(mounting.suggestedValue?.optionCode).toBe('SMD');
    expect(mounting.confidence).toBe(0.9);
    const disagreement = mounting.valueEvidence.find(
      (entry) => entry.source === 'ml:disagreement',
    );
    expect(disagreement?.description).toContain('Through Hole');
  });

  it('lets a stronger model value win, still without raising confidence', () => {
    const suggestions = build({
      packageDefinitionId: PACKAGE.id,
      mountingTypeDefinitionId: MOUNTING.id,
      extracted: [
        {
          definitionId: PACKAGE.id,
          value: '0805',
          unit: null,
          formatted: '0805',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
        },
      ],
      mlSuggestions: [
        mlSuggestion({
          attributeDefinitionId: MOUNTING.id,
          code: 'mounting_type',
          suggestedValue: 'Through Hole',
          formatted: 'Through Hole',
          confidence: 0.95,
        }),
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    // The package classification gives 0.90, the model 0.95.
    expect(mounting.suggestedValue?.optionCode).toBe('Through Hole');
    expect(mounting.confidence).toBe(0.95);
    expect(
      mounting.valueEvidence.some(
        (entry) => entry.source === 'ml:disagreement',
      ),
    ).toBe(true);
  });

  it('ignores a value that is not an option of the definition', () => {
    const suggestions = build({
      mlSuggestions: [
        mlSuggestion({
          attributeDefinitionId: MOUNTING.id,
          code: 'mounting_type',
          suggestedValue: 'Soldered',
          confidence: 0.9,
        }),
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    expect(mounting.relevance).toHaveLength(1);
    expect(mounting.suggestedValue).toBeNull();
  });

  it('ignores a suggestion for an attribute outside the catalog', () => {
    const suggestions = build({
      mlSuggestions: [
        mlSuggestion({ attributeDefinitionId: 'def-unknown', code: 'unknown' }),
      ],
    });
    expect(suggestions).toEqual([]);
  });

  it('changes nothing when the model gave nothing', () => {
    const withMl = build({ mlSuggestions: [] });
    const withoutMl = build();
    expect(withMl).toEqual(withoutMl);
  });
});

describe('the model\u2019s echo', () => {
  it('does not list a fact twice because two passes noticed it', () => {
    const suggestions = build({
      categories: [
        category({
          categoryId: 'cat-conn',
          categoryName: 'Connectors',
          bindings: [binding(MOUNTING.id)],
        }),
      ],
      mlSuggestions: [
        {
          attributeDefinitionId: MOUNTING.id,
          code: 'mounting_type',
          relevance: [
            {
              type: 'ml_attribute_knowledge',
              description:
                "Mounting Type is bound to this component's category",
              source: 'category:binding',
              weight: 0.9,
            },
            {
              type: 'ml_attribute_knowledge',
              description: 'Standard engineering specification for Connectors',
              source: 'domain:electronics_standard',
              weight: 0.8,
            },
          ],
        },
      ],
    });

    const mounting = byId(suggestions, MOUNTING.id);
    // The binding appears once — the local pass's own record of it.
    expect(
      mounting.relevance.filter(
        (evidence) => evidence.source === 'category:binding',
      ),
    ).toHaveLength(1);
    expect(mounting.relevance[0]!.type).toBe('category_binding');
    // The source only the model knows is kept.
    expect(
      mounting.relevance.filter(
        (evidence) => evidence.source === 'domain:electronics_standard',
      ),
    ).toHaveLength(1);
  });

  it('still reports relevance when the model is the only source', () => {
    const suggestions = build({
      mlSuggestions: [
        {
          attributeDefinitionId: RESISTANCE.id,
          code: 'resistance',
          relevance: [
            {
              type: 'ml_attribute_knowledge',
              description: 'Standard engineering specification for Resistors',
              source: 'domain:electronics_standard',
              weight: 0.8,
            },
          ],
        },
      ],
    });

    expect(byId(suggestions, RESISTANCE.id).relevance).toHaveLength(1);
  });
});
