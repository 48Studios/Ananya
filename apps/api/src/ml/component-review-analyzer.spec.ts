import {
  areCategoriesRelated,
  areEquivalentMpns,
  buildMpnIndex,
  capDuplicateFindings,
  COMPONENT_REVIEW_INTELLIGENCE_VERSION,
  detectDuplicateFindings,
  evaluateComponentFindings,
  extractCandidateMpnFromText,
  isEngineeringMeasurement,
  isPackageCode,
  isPlaceholderMpn,
  MEASUREMENT_UNITS,
  normalizeMpn,
  stripPackagingSuffix,
  type AnalyzableComponent,
  type CatalogMpnEntry,
  type ComponentCategoryRef,
  type ComponentManufacturerRef,
} from './component-review-analyzer';
import {
  COMPONENT_REVIEW_ISSUE_TYPES,
  COMPONENT_REVIEW_ISSUE_TYPE_VALUES,
} from './component-review-queue.dtos';
import type { ComponentSuggestionResponseDto } from './dtos';

function buildComponent(
  overrides: Partial<AnalyzableComponent> = {},
): AnalyzableComponent {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sku: 'CMP-000421',
    name: '10k Ohm 0805 SMD Resistor',
    description: null,
    manufacturerPartNumber: null,
    manufacturerId: null,
    categoryId: null,
    unit: 'pcs',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildCatalogEntry(
  overrides: Partial<CatalogMpnEntry> = {},
): CatalogMpnEntry {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sku: 'CMP-000871',
    name: 'Chip Resistor 27 Ohm',
    manufacturerPartNumber: 'RC0805FR-0727RL',
    manufacturerId: null,
    categoryId: null,
    isActive: true,
    createdAt: new Date('2025-06-01T00:00:00.000Z'),
    updatedAt: new Date('2025-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

const categoryById = new Map<string, ComponentCategoryRef>([
  [
    'cat-electronics',
    {
      id: 'cat-electronics',
      code: 'ELEC',
      name: 'Electronic Components',
      parentId: null,
    },
  ],
  [
    'cat-resistors',
    {
      id: 'cat-resistors',
      code: 'RES',
      name: 'Resistors',
      parentId: 'cat-electronics',
    },
  ],
  [
    'cat-capacitors',
    {
      id: 'cat-capacitors',
      code: 'CAP',
      name: 'Capacitors',
      parentId: 'cat-electronics',
    },
  ],
]);

const manufacturerById = new Map<string, ComponentManufacturerRef>([
  ['mfg-yageo', { id: 'mfg-yageo', code: 'YAGEO', name: 'Yageo' }],
  ['mfg-murata', { id: 'mfg-murata', code: 'MURATA', name: 'Murata' }],
]);

function buildSuggestion(
  overrides: Partial<ComponentSuggestionResponseDto> = {},
): ComponentSuggestionResponseDto {
  return {
    query: 'RC0805FR-0727RL',
    isDuplicate: false,
    duplicateWarnings: [],
    attributes: {},
    attributeSuggestions: [],
    alternativeCategories: [],
    isMlActive: true,
    executionTimeMs: 3,
    confidenceLevel: 'HIGH',
    ...overrides,
  };
}

const baseEvaluationInput = {
  categoryById,
  manufacturerById,
  mpnIndex: new Map<string, CatalogMpnEntry[]>(),
  packagePatterns: ['0201', '0402', '0603', '0805', 'SOT-23'],
  intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
};

describe('ComponentReviewAnalyzer normalization', () => {
  it('normalizes part numbers to uppercase alphanumerics', () => {
    expect(normalizeMpn('rc0805fr-0727rl')).toBe('RC0805FR0727RL');
    expect(normalizeMpn('  ')).toBeNull();
    expect(normalizeMpn(null)).toBeNull();
  });

  it('detects placeholder part numbers', () => {
    expect(isPlaceholderMpn('NONE')).toBe(true);
    expect(isPlaceholderMpn('UNKNOWN')).toBe(true);
    expect(isPlaceholderMpn('RC0805FR0727RL')).toBe(false);
  });

  it('strips packaging suffixes only when a substantial identifier remains', () => {
    // Mirrors apps/ml/app/services/duplicate_detector.py::strip_packaging_suffix
    expect(stripPackagingSuffix('RC0805FR0710KLTR')).toBe('RC0805FR0710KL');
    expect(stripPackagingSuffix('RC0805FR0710KL')).toBe('RC0805FR0710KL');
    // Too short to safely strip.
    expect(stripPackagingSuffix('SS34TU')).toBe('SS34TU');
  });

  it('recognizes footprint codes as packages rather than part numbers', () => {
    expect(isPackageCode('0805', [])).toBe(true);
    expect(isPackageCode('1206', [])).toBe(true);
    expect(isPackageCode('SOT23', ['SOT-23'])).toBe(true);
    expect(isPackageCode('RC0805FR0727RL', ['0805'])).toBe(false);
  });

  describe('areEquivalentMpns', () => {
    it('treats identical values as equivalent', () => {
      expect(areEquivalentMpns('RC0805FR0710KL', 'RC0805FR0710KL')).toBe(true);
    });

    it('treats packaging and reel variants as equivalent', () => {
      expect(areEquivalentMpns('RC0805FR0710KL', 'RC0805FR0710KLTR')).toBe(
        true,
      );
      expect(areEquivalentMpns('SS34', 'SS34TU')).toBe(true);
    });

    it('treats separator-split fragments as equivalent', () => {
      // "RC0805FR 0710KL" tokenizes to "RC0805FR", a fragment of the persisted MPN.
      expect(areEquivalentMpns('RC0805FR0710KL', 'RC0805FR')).toBe(true);
      expect(areEquivalentMpns('RC0805FR', 'RC0805FR0710KL')).toBe(true);
    });

    it('treats genuinely different part numbers as different', () => {
      expect(areEquivalentMpns('RC0805FR0710RL', 'RC0805FR0727RL')).toBe(false);
      expect(areEquivalentMpns('GRM188R71C104KA01D', 'C0805C105K8RACTU')).toBe(
        false,
      );
    });
  });

  describe('areCategoriesRelated', () => {
    it('treats identical, ancestor, and descendant categories as related', () => {
      expect(
        areCategoriesRelated('cat-resistors', 'cat-resistors', categoryById),
      ).toBe(true);
      expect(
        areCategoriesRelated('cat-resistors', 'cat-electronics', categoryById),
      ).toBe(true);
      expect(
        areCategoriesRelated('cat-electronics', 'cat-resistors', categoryById),
      ).toBe(true);
    });

    it('treats sibling categories as unrelated', () => {
      expect(
        areCategoriesRelated('cat-resistors', 'cat-capacitors', categoryById),
      ).toBe(false);
    });
  });
});

describe('isEngineeringMeasurement', () => {
  const packagePatterns = ['0201', '0402', '0603', '0805', '1206', 'SOT-23'];

  // Normalization uppercases and strips separators before this check runs, so
  // these inputs mirror what the extractor actually passes in.
  it.each([
    ['125MW', 'power rating (125mW)'],
    ['125MW0805', 'power rating with trailing footprint'],
    ['5V', 'voltage rating'],
    ['12V', 'voltage rating'],
    ['1000V', 'voltage rating'],
    ['100MA', 'current rating (100mA)'],
    ['10KHZ', 'frequency rating (10kHz)'],
    ['1PCT', 'percentage notation'],
    ['10UF', 'capacitance rating'],
    ['100NF', 'capacitance rating'],
    ['220PF', 'capacitance rating'],
    ['27OHM', 'resistance rating (27ohm)'],
    ['10KOHM', 'resistance rating'],
    ['25DEGC', 'temperature rating'],
    ['20DB', 'ratio notation'],
    ['1000MAH', 'battery capacity'],
  ])('rejects %s (%s)', (token) => {
    expect(isEngineeringMeasurement(token, packagePatterns)).toBe(true);
  });

  it.each([
    ['SOD123', 'footprint code is not a measurement'],
    ['RC0805FR0727RL', 'letters before the number'],
    ['C0805C104K5RACTU', 'letters before the number'],
    ['LM358DR', 'letters before the number'],
    ['SSM3K35AMFV', 'unit-like letters after a letter prefix'],
    ['CRCW080510K0FKEA', 'unit-like trailing letters'],
    ['GRM188R71C104KA01D', 'capacitor part number'],
    ['1N4148', 'numeric prefix that is not a unit'],
    ['1N4148W', 'numeric prefix with unit-like trailing letter'],
    ['2N2222', 'numeric prefix that is not a unit'],
  ])('accepts %s (%s)', (token) => {
    expect(isEngineeringMeasurement(token, packagePatterns)).toBe(false);
  });

  it('only treats a trailing remainder as tolerable when it is a footprint', () => {
    expect(isEngineeringMeasurement('125MW0805', packagePatterns)).toBe(true);
    expect(isEngineeringMeasurement('125MWXYZ', packagePatterns)).toBe(false);
  });

  it('keeps ambiguous single-letter identifiers out of the unit list', () => {
    // Bare R would reject legitimate resistor/label suffixes such as 5R1.
    expect(MEASUREMENT_UNITS).not.toContain('R');
    expect(MEASUREMENT_UNITS).not.toContain('C');
    expect(MEASUREMENT_UNITS).not.toContain('AC');
    expect(MEASUREMENT_UNITS).not.toContain('DC');
    expect(isEngineeringMeasurement('5R1', [])).toBe(false);
    expect(isEngineeringMeasurement('ABC12DC', [])).toBe(false);
  });
});

describe('extractCandidateMpnFromText', () => {
  const packagePatterns = ['0201', '0402', '0603', '0805', '1206', 'SOT-23'];
  const manufacturers = [{ name: 'Yageo', code: 'YAGEO' }];

  it('extracts a part number embedded in a component name', () => {
    expect(
      extractCandidateMpnFromText(
        'Chip Resistor RC0805FR-0727RL 27Ω',
        manufacturers,
        packagePatterns,
      ),
    ).toBe('RC0805FR-0727RL');
  });

  it('keeps legitimate part numbers whose letters resemble units', () => {
    // Each of these contains unit-like letters (W, V, A, F, H) and must survive.
    const cases: Array<[string, string]> = [
      ['Part RC0805FR-0727RL', 'RC0805FR-0727RL'],
      ['Ceramic capacitor C0805C104K5RACTU 100nF', 'C0805C104K5RACTU'],
      ['Op-amp LM358DR SOIC-8', 'LM358DR'],
      ['MOSFET SSM3K35AMFV SOT-23', 'SSM3K35AMFV'],
      ['Diode 1N4148', '1N4148'],
      ['Transistor 2N2222', '2N2222'],
    ];
    for (const [text, expected] of cases) {
      expect(
        extractCandidateMpnFromText(text, manufacturers, packagePatterns),
      ).toBe(expected);
    }
  });

  it('skips engineering measurements and keeps scanning for a real part number', () => {
    expect(
      extractCandidateMpnFromText(
        '27Ω ±1% 125mW 0805 thick-film resistor',
        manufacturers,
        packagePatterns,
      ),
    ).toBeUndefined();

    // The measurement is skipped, then the genuine MPN is still found.
    expect(
      extractCandidateMpnFromText(
        '125mW 0805 Resistor RC0805FR-0727RL',
        manufacturers,
        packagePatterns,
      ),
    ).toBe('RC0805FR-0727RL');
  });

  it.each([
    ['125mW', '125mW'],
    ['125MW', '125MW'],
    ['1000V rating', '1000V'],
    ['100mA load', '100mA'],
    ['10kHz signal', '10kHz'],
    ['100nF cap', '100nF'],
    ['220pF cap', '220pF'],
    ['27ohm', '27ohm'],
    ['20dB gain', '20dB'],
  ])('rejects the measurement in %s', (_label, text) => {
    expect(
      extractCandidateMpnFromText(text, manufacturers, packagePatterns),
    ).toBeUndefined();
  });

  it('still rejects footprints, placeholders, and identifiers that are too short', () => {
    const rejected = [
      'SMD Resistor 0805 Jumper',
      'Resistor 1206',
      'Part SOT-23 package',
      'Identifier NONE here',
      'Length 25mm',
      'Value TBD',
    ];
    for (const text of rejected) {
      expect(
        extractCandidateMpnFromText(text, manufacturers, packagePatterns),
      ).toBeUndefined();
    }
  });

  it('still strips manufacturer and product suffixes', () => {
    expect(
      extractCandidateMpnFromText(
        'Chip Resistor RC0805FR-0727RL-YAGEO-SMD 27Ω',
        manufacturers,
        packagePatterns,
      ),
    ).toBe('RC0805FR-0727RL');
  });

  it('rejects every specification notation from the hardening contract', () => {
    // Literal strings from the agreed contract. Some are rejected by the token
    // shape (too short, or split on `Ω` / `°` / `%`) and the rest by the
    // measurement rule; the observable requirement is identical either way.
    const specifications = [
      '125mW',
      '125MW',
      '27Ω',
      '27ohm',
      '5V',
      '12V',
      '100mA',
      '10kHz',
      '1%',
      '10uF',
      '100nF',
      '220pF',
      '25°C',
      '0805',
      'SOT-23',
    ];

    for (const specification of specifications) {
      expect(
        extractCandidateMpnFromText(
          specification,
          manufacturers,
          packagePatterns,
        ),
      ).toBeUndefined();
    }
  });
});

describe('Component Review Queue issue taxonomy', () => {
  it('matches the agreed contract exactly', () => {
    expect(COMPONENT_REVIEW_ISSUE_TYPES).toEqual({
      IDENTITY: [
        'MPN_MISSING',
        'MPN_CONFLICT',
        'MANUFACTURER_UNRESOLVED',
        'MANUFACTURER_CONFLICT',
      ],
      CLASSIFICATION: ['CATEGORY_UNRESOLVED', 'CATEGORY_CONFLICT'],
      DUPLICATE: ['EXACT_DUPLICATE', 'POTENTIAL_DUPLICATE'],
      DATA_QUALITY: [],
      // Pass 3 (Documentation Intelligence): specifications extracted from a
      // datasheet become reviewable attribute-value suggestions on this queue
      // rather than in a parallel queue.
      //
      // Pass 4 adds DOCUMENT_CONFLICT to the same category: the subject is still
      // an attribute value, but the queue has to distinguish "here is a value to
      // apply" from "the component's documents disagree". A conflict is absent
      // from COMPONENT_APPLY_RULES, so it can never be applied.
      //
      // The attribute-relevance producer adds ATTRIBUTE_VALUE_UNKNOWN: relevance
      // was established but no value could be determined. Also review-only, and
      // also absent from COMPONENT_APPLY_RULES — there is nothing to write.
      ATTRIBUTE_VALUE: [
        'ATTRIBUTE_VALUE_SUGGESTION',
        'ATTRIBUTE_VALUE_UNKNOWN',
        'DOCUMENT_CONFLICT',
      ],
    });
  });

  it('exposes a flat ordered list derived from the categories', () => {
    expect(COMPONENT_REVIEW_ISSUE_TYPE_VALUES).toEqual([
      'MPN_MISSING',
      'MPN_CONFLICT',
      'MANUFACTURER_UNRESOLVED',
      'MANUFACTURER_CONFLICT',
      'CATEGORY_UNRESOLVED',
      'CATEGORY_CONFLICT',
      'EXACT_DUPLICATE',
      'POTENTIAL_DUPLICATE',
      'ATTRIBUTE_VALUE_SUGGESTION',
      'ATTRIBUTE_VALUE_UNKNOWN',
      'DOCUMENT_CONFLICT',
    ]);
  });

  it('only emits declared issue types from the rules', () => {
    const declared = new Set<string>(COMPONENT_REVIEW_ISSUE_TYPE_VALUES);

    const ruleFindings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({
        manufacturerPartNumber: 'RC0805FR-0710RL',
        name: 'Chip Resistor RC0805FR-0727RL 27Ω',
      }),
      suggestion: buildSuggestion({
        manufacturer: {
          resolution: 'EXISTING',
          manufacturerId: 'mfg-yageo',
          manufacturerName: 'Yageo',
          confidence: 0.99,
          confidenceLevel: 'HIGH',
          matchType: 'pattern',
        },
        category: {
          resolution: 'EXISTING',
          categoryId: 'cat-resistors',
          categoryName: 'Resistors',
          confidence: 0.93,
          confidenceLevel: 'HIGH',
        },
      }),
    });

    const duplicateFindingsForTypes = detectDuplicateFindings({
      catalog: [
        buildCatalogEntry({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          manufacturerPartNumber: 'RC0805FR-0727RL',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
        buildCatalogEntry({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          manufacturerPartNumber: 'RC0805FR-0727RLTR',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
      ],
      scopeComponentIds: new Set([
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ]),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });

    const allTypes = [...ruleFindings, ...duplicateFindingsForTypes].map(
      (finding) => finding.issueType,
    );
    expect(allTypes.length).toBeGreaterThan(0);
    for (const issueType of allTypes) {
      expect(declared.has(issueType)).toBe(true);
    }
  });
});

describe('capDuplicateFindings', () => {
  const buildFindings = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      buildDuplicateFindingStub(index),
    );

  it('leaves below-cap batches untouched', () => {
    const findings = buildFindings(3);
    const result = capDuplicateFindings(findings, 5);
    expect(result.truncated).toBe(false);
    expect(result.findings).toHaveLength(3);
  });

  it('truncates above-cap batches deterministically from the front', () => {
    const findings = buildFindings(7);
    const result = capDuplicateFindings(findings, 5);
    expect(result.truncated).toBe(true);
    expect(result.findings).toHaveLength(5);
    expect(result.findings.map((finding) => finding.componentId)).toEqual(
      findings.slice(0, 5).map((finding) => finding.componentId),
    );
  });

  it('defaults to the module cap', () => {
    expect(capDuplicateFindings(buildFindings(2)).truncated).toBe(false);
    expect(capDuplicateFindings(buildFindings(1)).findings).toHaveLength(1);
  });
});

function buildDuplicateFindingStub(index: number) {
  const suffix = index.toString().padStart(8, '0');
  return {
    componentId: `${suffix}-0000-4000-8000-000000000000`,
    issueType: 'POTENTIAL_DUPLICATE' as const,
    issueCategory: 'DUPLICATE' as const,
    title: `Duplicate ${index}`,
    description: `Duplicate stub ${index}`,
    source: 'analyzer:duplicate',
    intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
  };
}

describe('evaluateComponentFindings', () => {
  it('suggests an MPN found in the component name when none is recorded', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({ name: 'Chip Resistor RC0805FR-0727RL 27Ω' }),
      suggestion: null,
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.issueType).toBe('MPN_MISSING');
    expect(finding.issueCategory).toBe('IDENTITY');
    expect(finding.field).toBe('manufacturerPartNumber');
    expect(finding.suggestedValue?.manufacturerPartNumber).toBe(
      'RC0805FR-0727RL',
    );
    expect(finding.confidenceLevel).toBe('HIGH');
    expect(finding.evidence?.length).toBeGreaterThan(0);
    expect(finding.componentUpdatedAt).toEqual(
      new Date('2026-02-01T00:00:00.000Z'),
    );
  });

  it('strips manufacturer and product suffixes from a name-embedded part number', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({
        name: 'Chip Resistor RC0805FR-0727RL-YAGEO-SMD 27Ω',
      }),
      suggestion: null,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.suggestedValue?.manufacturerPartNumber).toBe(
      'RC0805FR-0727RL',
    );
  });

  it('reports an MPN conflict when the text identifies a different part number', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({
        manufacturerPartNumber: 'RC0805FR-0710RL',
        name: 'Chip Resistor RC0805FR-0727RL 27Ω',
      }),
      suggestion: null,
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.issueType).toBe('MPN_CONFLICT');
    expect(finding.issueCategory).toBe('IDENTITY');
    expect(finding.field).toBe('manufacturerPartNumber');
    expect(finding.currentValue).toMatchObject({
      manufacturerPartNumber: 'RC0805FR-0710RL',
    });
    expect(finding.suggestedValue).toMatchObject({
      manufacturerPartNumber: 'RC0805FR-0727RL',
    });
    expect(finding.confidenceLevel).toBe('HIGH');
    expect(
      finding.evidence?.some((item) => item.source === 'analyzer:mpn_conflict'),
    ).toBe(true);
  });

  it('never reports an MPN conflict for equivalent formatting or packaging variants', () => {
    const formattingVariants = [
      'rc0805fr0710kl',
      'RC0805FR 0710KL',
      'RC0805FR-0710KL',
      'RC0805FR_0710KL',
    ];

    for (const variant of formattingVariants) {
      const findings = evaluateComponentFindings({
        ...baseEvaluationInput,
        component: buildComponent({
          manufacturerPartNumber: 'RC0805FR-0710KL',
          name: `Chip Resistor ${variant} 10kΩ`,
        }),
        suggestion: null,
      });
      expect(
        findings.filter((finding) => finding.issueType === 'MPN_CONFLICT'),
      ).toHaveLength(0);
    }

    // Tape/reel variant of the same engineering part is not a conflict.
    const packagingVariant = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({
        manufacturerPartNumber: 'RC0805FR-0710KL',
        name: 'Chip Resistor RC0805FR-0710KLTR 10kΩ',
      }),
      suggestion: null,
    });
    expect(
      packagingVariant.filter(
        (finding) => finding.issueType === 'MPN_CONFLICT',
      ),
    ).toHaveLength(0);
  });

  it('does not derive an MPN conflict from the persisted value itself', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({
        manufacturerPartNumber: 'RC0805FR-0727RL',
        name: 'Chip Resistor RC0805FR-0727RL 27Ω',
      }),
      suggestion: null,
    });
    expect(findings).toHaveLength(0);
  });

  it('ignores weak identifiers, footprint codes, and unrelated text for MPN rules', () => {
    const scenarios = [
      { name: 'Steel Mounting Bracket Assembly', mpn: 'ABC12345' },
      { name: 'SMD Resistor 0805 Jumper', mpn: 'ABC12345' },
      { name: 'Resistor, 10 kOhm, 1%, 50V, quantity 500', mpn: 'ABC12345' },
      { name: 'Custom assembly CMP000421XYZ', mpn: 'ABC12345' },
    ];

    for (const scenario of scenarios) {
      const findings = evaluateComponentFindings({
        ...baseEvaluationInput,
        component: buildComponent({
          sku: 'CMP000421XYZ',
          name: scenario.name,
          manufacturerPartNumber: scenario.mpn,
        }),
        suggestion: null,
      });
      expect(findings).toEqual([]);
    }
  });

  it('notes when the suggested MPN already belongs to another component', () => {
    const mpnIndex = buildMpnIndex([buildCatalogEntry({ sku: 'CMP-000871' })]);

    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      mpnIndex,
      component: buildComponent({ name: 'Chip Resistor RC0805FR-0727RL 27Ω' }),
      suggestion: null,
    });

    expect(findings[0]!.suggestedValue?.collidesWithExistingComponent).toBe(
      true,
    );
    expect(
      findings[0]!.evidence?.some((item) =>
        String(item.description).includes('CMP-000871'),
      ),
    ).toBe(true);
  });

  it('does not suggest an MPN for names without an identifier token', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({ name: 'Steel Mounting Bracket Assembly' }),
      suggestion: null,
    });
    expect(findings).toHaveLength(0);
  });

  it('does not suggest footprint codes or the internal SKU as an MPN', () => {
    const packageCodeFindings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({ name: 'SMD Resistor 0805 Jumper' }),
      suggestion: null,
    });
    expect(
      packageCodeFindings.some(
        (finding) => finding.issueType === 'MPN_MISSING',
      ),
    ).toBe(false);

    const skuAsMpnFindings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({
        sku: 'CMP000421XYZ',
        name: 'Custom assembly CMP000421XYZ',
      }),
      suggestion: null,
    });
    expect(skuAsMpnFindings).toHaveLength(0);
  });

  it('REGRESSION: does not report MPN_MISSING for CMP-000003, whose description is purely specifications', () => {
    // Real production false positive: the analyzer proposed "125MW" (a 125mW
    // power rating) as the missing manufacturer part number.
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({
        sku: 'CMP-000003',
        name: '27Ω 0805 SMD Thick Film Resistor',
        description:
          '27Ω ±1% 125mW 0805 thick-film for general-purpose applications resistor.',
        manufacturerPartNumber: null,
      }),
      suggestion: null,
    });

    expect(findings).toHaveLength(0);
    expect(
      findings.some(
        (finding) =>
          finding.issueType === 'MPN_MISSING' ||
          finding.issueType === 'MPN_CONFLICT',
      ),
    ).toBe(false);
  });

  it('REGRESSION: rejects every engineering measurement in a specification-only description', () => {
    const measurements = [
      '125mW',
      '125MW',
      '1000V',
      '100mA',
      '10kHz',
      '100nF',
      '220pF',
      '27ohm',
      '20dB',
    ];

    for (const measurement of measurements) {
      const findings = evaluateComponentFindings({
        ...baseEvaluationInput,
        component: buildComponent({
          name: `Resistor ${measurement}`,
          description: `${measurement} thick-film resistor`,
          manufacturerPartNumber: null,
        }),
        suggestion: null,
      });
      expect(
        findings.filter(
          (finding) =>
            finding.issueType === 'MPN_MISSING' ||
            finding.issueType === 'MPN_CONFLICT',
        ),
      ).toHaveLength(0);
    }
  });

  it('REGRESSION: still detects a real MPN alongside specifications', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({
        sku: 'CMP-000004',
        name: '27Ω 0805 SMD Thick Film Resistor',
        description:
          '27Ω ±1% 125mW 0805 thick-film resistor, manufacturer part RC0805FR-0727RL.',
        manufacturerPartNumber: null,
      }),
      suggestion: null,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('MPN_MISSING');
    expect(findings[0]!.suggestedValue?.manufacturerPartNumber).toBe(
      'RC0805FR-0727RL',
    );
  });

  it('reports a missing manufacturer resolved with high confidence', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      mpnIndex: buildMpnIndex([]),
      component: buildComponent({
        manufacturerPartNumber: 'RC0805FR-0727RL',
        name: 'Chip Resistor RC0805FR-0727RL',
      }),
      suggestion: buildSuggestion({
        manufacturer: {
          resolution: 'EXISTING',
          manufacturerId: 'mfg-yageo',
          manufacturerCode: 'YAGEO',
          manufacturerName: 'Yageo',
          confidence: 0.99,
          confidenceLevel: 'HIGH',
          matchType: 'pattern',
          evidence: [
            {
              type: 'mpn_pattern',
              description: "Matched manufacturer part-number pattern '^RC'",
              weight: 0.68,
              source: 'knowledge:yageo',
            },
          ],
        },
      }),
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.issueType).toBe('MANUFACTURER_UNRESOLVED');
    expect(finding.suggestedValue).toMatchObject({
      manufacturerId: 'mfg-yageo',
      manufacturerName: 'Yageo',
      resolution: 'EXISTING',
    });
    expect(finding.evidence?.[0]?.source).toBe('knowledge:yageo');
  });

  it('ignores manufacturer resolutions below the confidence threshold', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({ name: 'Chip Resistor' }),
      suggestion: buildSuggestion({
        manufacturer: {
          resolution: 'NEW_CANDIDATE',
          manufacturerName: 'Yageo',
          confidence: 0.7,
          confidenceLevel: 'MEDIUM',
          matchType: 'knowledge',
        },
      }),
    });
    expect(findings).toHaveLength(0);
  });

  it('reports a manufacturer conflict when the stored manufacturer disagrees', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({ manufacturerId: 'mfg-murata' }),
      suggestion: buildSuggestion({
        manufacturer: {
          resolution: 'EXISTING',
          manufacturerId: 'mfg-yageo',
          manufacturerName: 'Yageo',
          confidence: 0.95,
          confidenceLevel: 'HIGH',
          matchType: 'datapack',
        },
      }),
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.issueType).toBe('MANUFACTURER_CONFLICT');
    expect(finding.currentValue).toMatchObject({ manufacturerName: 'Murata' });
    expect(finding.description).toContain('Yageo');
  });

  it('accepts name and code variants of the stored manufacturer', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({ manufacturerId: 'mfg-yageo' }),
      suggestion: buildSuggestion({
        manufacturer: {
          resolution: 'NEW_CANDIDATE',
          manufacturerName: 'YAGEO',
          manufacturerCode: 'Yageo',
          confidence: 0.99,
          confidenceLevel: 'HIGH',
          matchType: 'knowledge',
        },
      }),
    });
    expect(findings).toHaveLength(0);
  });

  it('reports a missing category resolved to an existing category', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent(),
      suggestion: buildSuggestion({
        category: {
          resolution: 'EXISTING',
          categoryId: 'cat-resistors',
          categoryName: 'Electronic Components',
          subcategoryName: 'Resistors',
          categoryPath: ['Electronic Components', 'Resistors'],
          confidence: 0.92,
          confidenceLevel: 'HIGH',
          evidence: [
            {
              type: 'classifier',
              description: 'Statistical category model probability (92%)',
              weight: 0.5,
              source: 'model:category_classifier_v1',
            },
          ],
        },
      }),
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.issueType).toBe('CATEGORY_UNRESOLVED');
    expect(finding.issueCategory).toBe('CLASSIFICATION');
    expect(finding.suggestedValue).toMatchObject({
      categoryId: 'cat-resistors',
      categoryPath: 'Electronic Components › Resistors',
    });
  });

  it('reports a category conflict but not a hierarchy refinement', () => {
    const conflict = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({ categoryId: 'cat-capacitors' }),
      suggestion: buildSuggestion({
        category: {
          resolution: 'EXISTING',
          categoryId: 'cat-resistors',
          categoryName: 'Resistors',
          confidence: 0.93,
          confidenceLevel: 'HIGH',
        },
      }),
    });
    expect(conflict).toHaveLength(1);
    expect(conflict[0]!.issueType).toBe('CATEGORY_CONFLICT');

    const refinement = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent({ categoryId: 'cat-electronics' }),
      suggestion: buildSuggestion({
        category: {
          resolution: 'EXISTING',
          categoryId: 'cat-resistors',
          categoryName: 'Resistors',
          confidence: 0.93,
          confidenceLevel: 'HIGH',
        },
      }),
    });
    // Narrowing "Electronic Components" to its child "Resistors" is not a conflict.
    expect(refinement).toHaveLength(0);
  });

  it('does not queue new-category candidates', () => {
    const findings = evaluateComponentFindings({
      ...baseEvaluationInput,
      component: buildComponent(),
      suggestion: buildSuggestion({
        category: {
          resolution: 'NEW_CANDIDATE',
          categoryName: 'Specialty Sensors',
          subcategoryName: 'Specialty Sensors',
          confidence: 0.97,
          confidenceLevel: 'HIGH',
        },
      }),
    });
    expect(findings).toHaveLength(0);
  });
});

describe('detectDuplicateFindings', () => {
  it('detects exact duplicates and treats the oldest record as canonical', () => {
    const canonical = buildCatalogEntry({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sku: 'CMP-000100',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      manufacturerPartNumber: 'RC0805FR-0727RL',
    });
    const duplicate = buildCatalogEntry({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      sku: 'CMP-000200',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      manufacturerPartNumber: 'rc0805fr0727rl',
    });

    const findings = detectDuplicateFindings({
      catalog: [canonical, duplicate],
      scopeComponentIds: new Set([duplicate.id]),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.issueType).toBe('EXACT_DUPLICATE');
    expect(finding.issueCategory).toBe('DUPLICATE');
    expect(finding.componentId).toBe(duplicate.id);
    expect(finding.relatedComponentId).toBe(canonical.id);
    expect(finding.confidence).toBe(1);
    expect(finding.confidenceLevel).toBe('HIGH');
    expect(finding.suggestedValue).toMatchObject({
      duplicateOfComponentId: canonical.id,
      duplicateOfSku: canonical.sku,
      matchType: 'EXACT_MPN',
    });
  });

  it('detects packaging-variant duplicates with a lower confidence', () => {
    const canonical = buildCatalogEntry({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sku: 'CMP-000100',
      manufacturerPartNumber: 'RC0805FR-0710KL',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    const variant = buildCatalogEntry({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      sku: 'CMP-000200',
      manufacturerPartNumber: 'RC0805FR-0710KLTR',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const findings = detectDuplicateFindings({
      catalog: [canonical, variant],
      scopeComponentIds: new Set([variant.id, canonical.id]),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('POTENTIAL_DUPLICATE');
    expect(findings[0]!.confidence).toBe(0.9);
    expect(findings[0]!.description).toContain('packaging suffix');
  });

  it('adds conflict evidence when the duplicate pair disagrees', () => {
    const canonical = buildCatalogEntry({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      manufacturerId: 'mfg-murata',
      categoryId: 'cat-capacitors',
    });
    const duplicate = buildCatalogEntry({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      manufacturerId: 'mfg-yageo',
      categoryId: 'cat-resistors',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const findings = detectDuplicateFindings({
      catalog: [canonical, duplicate],
      scopeComponentIds: new Set([duplicate.id]),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });

    const sources = (findings[0]!.evidence ?? []).map((item) => item.source);
    expect(sources).toContain('analyzer:duplicate_conflict');
    expect(findings[0]!.evidence).toHaveLength(3);
  });

  it('produces one finding per duplicate in a group (star topology)', () => {
    const members = [
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ].map((id, index) =>
      buildCatalogEntry({
        id,
        sku: `CMP-00010${index}`,
        createdAt: new Date(Date.UTC(2024 + index, 0, 1)),
      }),
    );

    const findings = detectDuplicateFindings({
      catalog: members,
      scopeComponentIds: new Set(members.map((member) => member.id)),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });

    expect(findings).toHaveLength(2);
    expect(
      new Set(findings.map((finding) => finding.relatedComponentId)).size,
    ).toBe(1);
  });

  it('ignores placeholder, short, and missing part numbers', () => {
    const findings = detectDuplicateFindings({
      catalog: [
        buildCatalogEntry({ manufacturerPartNumber: 'NONE' }),
        buildCatalogEntry({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          manufacturerPartNumber: 'N/A',
        }),
        buildCatalogEntry({
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          manufacturerPartNumber: 'SS3',
        }),
      ],
      scopeComponentIds: new Set(),
      includeInactive: true,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });
    expect(findings).toHaveLength(0);
  });

  it('skips pairs where neither side was analyzed', () => {
    const findings = detectDuplicateFindings({
      catalog: [
        buildCatalogEntry({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
        buildCatalogEntry({
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
      ],
      scopeComponentIds: new Set(['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee']),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });
    expect(findings).toHaveLength(0);
  });

  it('detects an exact duplicate located beyond any 100-row candidate window', () => {
    // 150 unrelated components followed by the duplicate pair, so the duplicate
    // sits well past position 100 in catalog order.
    const filler = Array.from({ length: 150 }, (_, index) =>
      buildCatalogEntry({
        id: `${index.toString().padStart(8, '0')}-1111-4111-8111-111111111111`,
        sku: `FILL-${index}`,
        manufacturerPartNumber: `FILLER${index.toString().padStart(6, '0')}X`,
        createdAt: new Date(Date.UTC(2020, 0, 1) + index * 1000),
      }),
    );
    const canonical = buildCatalogEntry({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sku: 'CMP-LATE-A',
      manufacturerPartNumber: 'RC0805FR-0710KL',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const duplicate = buildCatalogEntry({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sku: 'CMP-LATE-B',
      manufacturerPartNumber: 'RC0805FR-0710KL',
      createdAt: new Date('2025-06-01T00:00:00.000Z'),
    });

    const findings = detectDuplicateFindings({
      catalog: [...filler, canonical, duplicate],
      scopeComponentIds: new Set([duplicate.id]),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('EXACT_DUPLICATE');
    expect(findings[0]!.componentId).toBe(duplicate.id);
    expect(findings[0]!.relatedComponentId).toBe(canonical.id);
  });

  it('orders duplicate findings deterministically regardless of catalog order', () => {
    const entries = [
      buildCatalogEntry({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        manufacturerPartNumber: 'RC0805FR-0727RL',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildCatalogEntry({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        manufacturerPartNumber: 'RC0805FR-0727RL',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
      buildCatalogEntry({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        manufacturerPartNumber: 'GRM188R71C104KA01D',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildCatalogEntry({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        manufacturerPartNumber: 'GRM188R71C104KA01D',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ];
    const scope = new Set(entries.map((entry) => entry.id));

    const forward = detectDuplicateFindings({
      catalog: entries,
      scopeComponentIds: scope,
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });
    const reversed = detectDuplicateFindings({
      catalog: [...entries].reverse(),
      scopeComponentIds: scope,
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });

    expect(forward.map((finding) => finding.componentId)).toEqual(
      reversed.map((finding) => finding.componentId),
    );
    // Grouped by normalized part number.
    expect(
      forward.map((finding) => finding.suggestedValue?.normalizedMpn),
    ).toEqual(['GRM188R71C104KA01D', 'RC0805FR0727RL']);
  });

  it('does not emit findings for inactive duplicates unless requested', () => {
    const canonical = buildCatalogEntry({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    const inactiveDuplicate = buildCatalogEntry({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      isActive: false,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const excluded = detectDuplicateFindings({
      catalog: [canonical, inactiveDuplicate],
      scopeComponentIds: new Set([inactiveDuplicate.id]),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });
    expect(excluded).toHaveLength(0);

    const included = detectDuplicateFindings({
      catalog: [canonical, inactiveDuplicate],
      scopeComponentIds: new Set([inactiveDuplicate.id]),
      includeInactive: true,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
    });
    expect(included).toHaveLength(1);
  });
});
