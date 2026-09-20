import {
  MAX_NAME_CANDIDATE_ROWS,
  areCategoriesRelated,
  areEquivalentMpns,
  buildAttributeComparison,
  buildGenericNameTerms,
  buildIdentityAttributeIndex,
  buildManufacturerIdentityIndex,
  buildMpnIndex,
  buildSemanticCandidatePairs,
  capDuplicateFindings,
  collectNameIdentityCandidateIds,
  collectMatchingIdentityAttributes,
  compareCatalogOrder,
  compareManufacturerIdentity,
  createEmptyManufacturerIdentityIndex,
  detectDuplicateFindings,
  findIdentityAttributeConflicts,
  groupNameIdentityCandidates,
  isIdentityBearingName,
  normalizeComponentName,
  normalizeMpn,
  resolveManufacturerIdentity,
  runDuplicateDetection,
  stripPackagingSuffix,
  tokenizeName,
  type CatalogMpnEntry,
  type ComponentAttributeValueRow,
  type ComponentCategoryRef,
  type ComponentManufacturerRef,
  type ComponentIdentityAttributes,
} from './component-duplicate-intelligence';
import {
  MAX_SEMANTIC_CANDIDATES_PER_COMPONENT,
  MAX_SEMANTIC_FINDINGS_PER_AUDIT,
} from './component-semantic-similarity';
import { COMPONENT_REVIEW_INTELLIGENCE_VERSION } from './component-review-analyzer';

/**
 * Pass 5A coverage for the deterministic duplicate intelligence rules.
 *
 * Every test here is pure: no database, no ML service, no clock. The numbering
 * follows the pass contract (exact identity, packaging, name/attribute identity,
 * determinism, scale).
 */

const VERSION = 'component-duplicate-v1';

function buildEntry(overrides: Partial<CatalogMpnEntry> = {}): CatalogMpnEntry {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sku: 'CMP-000001',
    name: 'Chip Resistor 27 Ohm',
    manufacturerPartNumber: 'RC0805FR-0727RL',
    manufacturerId: null,
    categoryId: null,
    isActive: true,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
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
    'cat-smd-resistors',
    {
      id: 'cat-smd-resistors',
      code: 'RES-SMD',
      name: 'SMD Resistors',
      parentId: 'cat-resistors',
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

const manufacturers: ComponentManufacturerRef[] = [
  { id: 'mfg-yageo', code: 'YAGEO', name: 'Yageo' },
  { id: 'mfg-phycomp', code: 'PHYCOMP', name: 'Phycomp' },
  { id: 'mfg-murata', code: 'MURATA', name: 'Murata' },
];

/** Mirrors the installed Data Pack manufacturer hints. */
const manufacturerHints = [
  {
    name: 'Yageo',
    code: 'YAGEO',
    prefixPatterns: ['^RC\\d{4}'],
    aliases: ['yageo', 'phycomp'],
  },
  {
    name: 'Murata',
    code: 'MURATA',
    prefixPatterns: ['^GRM\\d{2}'],
    aliases: ['murata'],
  },
];

function buildManufacturerIdentity() {
  return buildManufacturerIdentityIndex({
    manufacturers,
    hints: manufacturerHints,
  });
}

const packagePatterns = ['0201', '0402', '0603', '0805', '1206', 'SOT-23'];

const genericTerms = buildGenericNameTerms({
  categoryTerms: Array.from(categoryById.values()).flatMap((category) => [
    category.name,
    category.code,
  ]),
  packagePatterns,
});

function attributeRow(
  overrides: Partial<ComponentAttributeValueRow> & { componentId: string },
): ComponentAttributeValueRow {
  return {
    attributeDefinitionId: 'def-resistance',
    code: 'resistance',
    label: 'Resistance',
    dataType: 'QUANTITY',
    numberValue: '27',
    normalizedNumberValue: '27',
    booleanValue: null,
    optionId: null,
    unit: 'ohm',
    ...overrides,
  };
}

/** Attribute row whose stored and base-unit values agree. */
function quantityRow(
  componentId: string,
  code: string,
  value: string,
  dataType: 'QUANTITY' | 'INTEGER' = 'QUANTITY',
): ComponentAttributeValueRow {
  return attributeRow({
    componentId,
    code,
    label: code,
    dataType,
    numberValue: value,
    normalizedNumberValue: value,
    unit: null,
  });
}

function detect(
  catalog: CatalogMpnEntry[],
  options: {
    scope?: string[];
    includeInactive?: boolean;
    identityAttributes?: Map<string, ComponentIdentityAttributes>;
    manufacturerIdentity?: ReturnType<typeof buildManufacturerIdentity>;
  } = {},
) {
  return detectDuplicateFindings({
    catalog,
    scopeComponentIds: new Set(
      options.scope ?? catalog.map((entry) => entry.id),
    ),
    includeInactive: options.includeInactive ?? false,
    intelligenceVersion: VERSION,
    manufacturerIdentity:
      options.manufacturerIdentity ?? buildManufacturerIdentity(),
    categoryById,
    identityAttributesByComponentId: options.identityAttributes,
    genericTerms,
    packagePatterns,
  });
}

describe('normalizeComponentName', () => {
  it('normalizes case, whitespace and punctuation', () => {
    expect(normalizeComponentName('  RC0805FR-0727RL  ')).toBe(
      normalizeComponentName('rc0805fr 0727rl'),
    );
    expect(normalizeComponentName('10kΩ SMD Resistor 0805')).toBe(
      normalizeComponentName('10K Ohm SMD Resistor 0805'),
    );
  });

  it('keeps technical values distinct', () => {
    expect(normalizeComponentName('10KΩ Resistor 0805')).not.toBe(
      normalizeComponentName('100KΩ Resistor 0805'),
    );
    expect(normalizeComponentName('10uF 25V Capacitor')).not.toBe(
      normalizeComponentName('100uF 25V Capacitor'),
    );
  });

  it('treats micro and degree spellings as equivalent', () => {
    expect(normalizeComponentName('10µF Capacitor')).toBe(
      normalizeComponentName('10uF Capacitor'),
    );
    expect(normalizeComponentName('85°C Sensor')).toBe(
      normalizeComponentName('85degC Sensor'),
    );
  });
});

describe('isIdentityBearingName', () => {
  const options = { genericTerms, packagePatterns };

  it('rejects generic category-style names', () => {
    for (const name of [
      'Resistor',
      'Capacitor',
      'Connector',
      'SMD Resistor',
      'Chip Resistor',
      'Ceramic Capacitor 0805',
      'SMD',
    ]) {
      expect(isIdentityBearingName(name, options)).toBe(false);
    }
  });

  it('accepts names that carry a value or identifier', () => {
    for (const name of [
      '10KΩ SMD Resistor 0805',
      'LM358DR',
      '27Ω 0805 Thick Film Resistor',
      'GRM188R71C104KA01D',
    ]) {
      expect(isIdentityBearingName(name, options)).toBe(true);
    }
  });
});

describe('manufacturer identity', () => {
  it('resolves declared aliases to a single canonical identity', () => {
    const index = buildManufacturerIdentity();
    const yageo = resolveManufacturerIdentity('mfg-yageo', index);
    const phycomp = resolveManufacturerIdentity('mfg-phycomp', index);

    expect(yageo).not.toBeNull();
    expect(phycomp).toBe(yageo);
    expect(compareManufacturerIdentity('mfg-yageo', 'mfg-phycomp', index)).toBe(
      'SAME',
    );
  });

  it('never merges manufacturers that no alias ties together', () => {
    const index = buildManufacturerIdentity();
    expect(compareManufacturerIdentity('mfg-yageo', 'mfg-murata', index)).toBe(
      'CONFLICT',
    );
  });

  it('reports missing manufacturer references as indeterminate, not as a conflict', () => {
    const index = buildManufacturerIdentity();
    expect(compareManufacturerIdentity(null, 'mfg-yageo', index)).toBe(
      'INDETERMINATE',
    );
    expect(compareManufacturerIdentity(null, null, index)).toBe(
      'INDETERMINATE',
    );
  });

  it('does not merge manufacturers when an alias is claimed ambiguously', () => {
    const index = buildManufacturerIdentityIndex({
      manufacturers,
      hints: [
        { name: 'Yageo', code: 'YAGEO', aliases: ['sharedbrand'] },
        { name: 'Murata', code: 'MURATA', aliases: ['sharedbrand'] },
      ],
    });
    expect(compareManufacturerIdentity('mfg-yageo', 'mfg-murata', index)).toBe(
      'CONFLICT',
    );
  });

  it('keeps unknown manufacturer ids distinct from each other and from resolved ones', () => {
    const index = buildManufacturerIdentity();
    const unknown = resolveManufacturerIdentity('mfg-unknown', index);
    expect(unknown).not.toBeNull();
    expect(unknown).not.toBe(resolveManufacturerIdentity('mfg-yageo', index));
    expect(compareManufacturerIdentity('mfg-unknown', 'mfg-other', index)).toBe(
      'CONFLICT',
    );
  });

  it('treats every id as its own identity when no reference data is supplied', () => {
    const index = createEmptyManufacturerIdentityIndex();
    expect(compareManufacturerIdentity('a', 'b', index)).toBe('CONFLICT');
    expect(compareManufacturerIdentity('a', 'a', index)).toBe('SAME');
  });
});

describe('MPN normalization and packaging variants', () => {
  it('normalizes formatting differences', () => {
    expect(normalizeMpn('RC0805FR-0727RL')).toBe(
      normalizeMpn('rc0805fr0727rl'),
    );
    expect(normalizeMpn('RC0805FR-0727RL')).toBe(
      normalizeMpn('RC0805FR 0727RL'),
    );
  });

  it('strips only explicit packaging suffixes', () => {
    expect(stripPackagingSuffix('RC0805FR0710KLTR')).toBe('RC0805FR0710KL');
    expect(stripPackagingSuffix('RC0805FR0710KLCTU')).toBe('RC0805FR0710KL');
    expect(stripPackagingSuffix('RC0805FR0710KL')).toBe('RC0805FR0710KL');
  });

  it('never strips a suffix when the remainder would be too short', () => {
    expect(stripPackagingSuffix('AB07')).toBe('AB07');
    expect(stripPackagingSuffix('TR')).toBe('TR');
  });

  it('keeps meaningful manufacturer suffixes distinct', () => {
    // A trailing "DR" is not a packaging suffix; both stay different.
    expect(stripPackagingSuffix('LM358DR')).toBe('LM358DR');
    expect(stripPackagingSuffix('LM358DR')).not.toBe(
      stripPackagingSuffix('LM358D'),
    );
  });

  it('still treats separator-split fragments as equivalent for conflict reporting', () => {
    expect(areEquivalentMpns('RC0805FR', 'RC0805FR0710KL')).toBe(true);
  });
});

describe('physical-value guards', () => {
  it('reports conflicting structured attributes', () => {
    const index = buildIdentityAttributeIndex([
      attributeRow({ componentId: 'a', normalizedNumberValue: '27' }),
      attributeRow({
        componentId: 'b',
        numberValue: '100',
        normalizedNumberValue: '100',
      }),
    ]);

    const conflicts = findIdentityAttributeConflicts(
      index.get('a'),
      index.get('b'),
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe('resistance');
    expect(conflicts[0]!.first).toBe('27 ohm');
    expect(conflicts[0]!.second).toBe('100 ohm');
  });

  it('ignores attributes that only one record records', () => {
    const index = buildIdentityAttributeIndex([
      attributeRow({ componentId: 'a' }),
      attributeRow({ componentId: 'b', code: 'voltage_rating', unit: 'V' }),
    ]);
    expect(
      findIdentityAttributeConflicts(index.get('a'), index.get('b')),
    ).toHaveLength(0);
  });

  it('compares SELECT attributes by option, not by display text', () => {
    const options = new Map([
      [
        'opt-0805',
        { id: 'opt-0805', code: '0805', label: '0805 (2.0x1.25mm)' },
      ],
      ['opt-0603', { id: 'opt-0603', code: '0603', label: '0603' }],
    ]);
    const index = buildIdentityAttributeIndex(
      [
        {
          componentId: 'a',
          attributeDefinitionId: 'def-package',
          code: 'package',
          label: 'Package',
          dataType: 'SELECT',
          numberValue: null,
          normalizedNumberValue: null,
          booleanValue: null,
          optionId: 'opt-0805',
          unit: null,
        },
        {
          componentId: 'b',
          attributeDefinitionId: 'def-package',
          code: 'package',
          label: 'Package',
          dataType: 'SELECT',
          numberValue: null,
          normalizedNumberValue: null,
          booleanValue: null,
          optionId: 'opt-0603',
          unit: null,
        },
      ],
      options,
    );

    expect(index.get('a')?.get('package')?.comparable).toBe('0805');
    expect(
      findIdentityAttributeConflicts(index.get('a'), index.get('b')),
    ).toHaveLength(1);
  });

  it('ignores free-text attributes as identity evidence', () => {
    const index = buildIdentityAttributeIndex([
      {
        componentId: 'a',
        attributeDefinitionId: 'def-mfr_part_number',
        code: 'mfr_part_number',
        label: 'Manufacturer Part Number',
        dataType: 'TEXT',
        numberValue: null,
        normalizedNumberValue: null,
        booleanValue: null,
        optionId: null,
        unit: null,
      },
    ]);
    expect(index.size).toBe(0);
  });

  it('collects matching attributes for evidence', () => {
    const index = buildIdentityAttributeIndex([
      attributeRow({ componentId: 'a' }),
      attributeRow({ componentId: 'b' }),
    ]);
    const matches = collectMatchingIdentityAttributes(
      index.get('a'),
      index.get('b'),
    );
    expect(matches.map((match) => match.code)).toEqual(['resistance']);
  });
});

describe('detectDuplicateFindings — exact identity', () => {
  it('1. flags the same manufacturer + same normalized MPN as an exact duplicate', () => {
    const canonical = buildEntry({
      id: 'c',
      sku: 'CMP-100',
      manufacturerId: 'mfg-yageo',
      manufacturerPartNumber: 'RC0805FR-0727RL',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    const duplicate = buildEntry({
      id: 'd',
      sku: 'CMP-200',
      manufacturerId: 'mfg-yageo',
      manufacturerPartNumber: 'RC0805FR-0727RL',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    const findings = detect([canonical, duplicate]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('EXACT_DUPLICATE');
    expect(findings[0]!.componentId).toBe('d');
    expect(findings[0]!.relatedComponentId).toBe('c');
    expect(findings[0]!.confidence).toBe(1);
    expect(findings[0]!.confidenceLevel).toBe('HIGH');
    expect(findings[0]!.suggestedValue).toMatchObject({
      matchType: 'EXACT_MPN',
      duplicateOfComponentId: 'c',
    });
  });

  it('2. flags an MPN that differs only in formatting as an exact duplicate', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        manufacturerPartNumber: 'RC0805FR-0727RL',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        manufacturerPartNumber: 'rc0805fr 0727rl',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('EXACT_DUPLICATE');
  });

  it('3. flags manufacturer aliases with the same MPN as an exact duplicate', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        sku: 'CMP-100',
        manufacturerId: 'mfg-yageo',
        manufacturerPartNumber: 'RC0805FR-0727RL',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        sku: 'CMP-200',
        // Phycomp is an alias of Yageo in the manufacturer intelligence model.
        manufacturerId: 'mfg-phycomp',
        manufacturerPartNumber: 'RC0805FR0727RL',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('EXACT_DUPLICATE');
    expect(
      (findings[0]!.evidence ?? []).map((item) => item.source),
    ).not.toContain('analyzer:duplicate_conflict');
  });

  it('4. does NOT create an exact duplicate when manufacturer identity differs', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        manufacturerId: 'mfg-yageo',
        manufacturerPartNumber: 'RC0805FR-0727RL',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        manufacturerId: 'mfg-murata',
        manufacturerPartNumber: 'RC0805FR-0727RL',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('POTENTIAL_DUPLICATE');
    expect(findings[0]!.confidenceLevel).toBe('MEDIUM');
    expect(findings[0]!.suggestedValue).toMatchObject({
      matchType: 'MPN_MANUFACTURER_CONFLICT',
    });
    expect((findings[0]!.evidence ?? []).map((item) => item.source)).toContain(
      'analyzer:duplicate_conflict',
    );
  });

  it('does not create any finding when packaging variants also conflict on manufacturer', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        manufacturerId: 'mfg-yageo',
        manufacturerPartNumber: 'RC0805FR-0710KL',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        manufacturerId: 'mfg-murata',
        manufacturerPartNumber: 'RC0805FR-0710KLTR',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('5. does NOT treat MPNs sharing a prefix as duplicates', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        manufacturerPartNumber: 'RC0805FR-0727RL',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        manufacturerPartNumber: 'RC0805FR-0710KL',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('6. never reports a component as a duplicate of itself', () => {
    const single = buildEntry({ id: 'solo' });
    const findings = detect([single]);
    expect(findings).toHaveLength(0);
    expect(
      findings.filter(
        (finding) => finding.componentId === finding.relatedComponentId,
      ),
    ).toHaveLength(0);
  });

  it('7. produces exactly one finding for an A/B pair', () => {
    const findings = detect([
      buildEntry({ id: 'a', createdAt: new Date('2024-01-01T00:00:00.000Z') }),
      buildEntry({ id: 'b', createdAt: new Date('2025-01-01T00:00:00.000Z') }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.componentId).toBe('b');
    expect(findings[0]!.relatedComponentId).toBe('a');
  });

  it('8. uses canonical star topology for an A/B/C group', () => {
    const findings = detect([
      buildEntry({ id: 'c', createdAt: new Date('2026-01-01T00:00:00.000Z') }),
      buildEntry({ id: 'a', createdAt: new Date('2024-01-01T00:00:00.000Z') }),
      buildEntry({ id: 'b', createdAt: new Date('2025-01-01T00:00:00.000Z') }),
    ]);

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.componentId).sort()).toEqual([
      'b',
      'c',
    ]);
    expect(
      new Set(findings.map((finding) => finding.relatedComponentId)),
    ).toEqual(new Set(['a']));
  });

  it('breaks canonical ties deterministically by component id', () => {
    const createdAt = new Date('2024-01-01T00:00:00.000Z');
    const findings = detect([
      buildEntry({ id: 'zzz', createdAt }),
      buildEntry({ id: 'aaa', createdAt }),
    ]);
    expect(findings[0]!.componentId).toBe('zzz');
    expect(findings[0]!.relatedComponentId).toBe('aaa');
  });

  it('9. discovers a duplicate outside the analyzed batch', () => {
    const findings = detect(
      [
        buildEntry({
          id: 'old',
          sku: 'CMP-OLD',
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
        }),
        buildEntry({
          id: 'new',
          sku: 'CMP-NEW',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ],
      { scope: ['new'] },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.componentId).toBe('new');
    expect(findings[0]!.relatedComponentId).toBe('old');
  });

  it('10. discovers a duplicate beyond any 100-row candidate window', () => {
    const filler = Array.from({ length: 300 }, (_, index) =>
      buildEntry({
        id: `fill-${index.toString().padStart(4, '0')}`,
        sku: `FILL-${index}`,
        manufacturerPartNumber: `FILLER${index.toString().padStart(6, '0')}X`,
        createdAt: new Date(Date.UTC(2020, 0, 1) + index * 1000),
      }),
    );
    const canonical = buildEntry({
      id: 'late-a',
      sku: 'CMP-LATE-A',
      manufacturerPartNumber: 'RC0805FR-0710KL',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    const duplicate = buildEntry({
      id: 'late-b',
      sku: 'CMP-LATE-B',
      manufacturerPartNumber: 'RC0805FR-0710KL',
      createdAt: new Date('2025-06-01T00:00:00.000Z'),
    });

    const findings = detect([...filler, canonical, duplicate], {
      scope: ['late-b'],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.relatedComponentId).toBe('late-a');
  });

  it('ignores placeholder, short and missing part numbers', () => {
    const findings = detect([
      buildEntry({ id: 'a', manufacturerPartNumber: 'NONE' }),
      buildEntry({ id: 'b', manufacturerPartNumber: 'N/A' }),
      buildEntry({ id: 'c', manufacturerPartNumber: 'AB1' }),
      buildEntry({ id: 'd', manufacturerPartNumber: null }),
    ]);
    expect(findings).toHaveLength(0);
  });
});

describe('detectDuplicateFindings — packaging variants', () => {
  it('11. classifies a reel variant as a packaging-variant potential duplicate', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        sku: 'CMP-100',
        manufacturerId: 'mfg-yageo',
        manufacturerPartNumber: 'RC0805FR-0710KL',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        sku: 'CMP-200',
        manufacturerId: 'mfg-yageo',
        manufacturerPartNumber: 'RC0805FR-0710KLTR',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('POTENTIAL_DUPLICATE');
    expect(findings[0]!.confidence).toBe(0.9);
    expect(findings[0]!.confidenceLevel).toBe('HIGH');
    expect(findings[0]!.suggestedValue).toMatchObject({
      matchType: 'PACKAGING_VARIANT',
    });
  });

  it('11b. treats cut-tape and tray suffixes the same way', () => {
    for (const variant of ['RC0805FR0710KLCTU', 'RC0805FR0710KLTU']) {
      const findings = detect([
        buildEntry({
          id: 'c',
          manufacturerPartNumber: 'RC0805FR0710KL',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
        buildEntry({
          id: 'd',
          manufacturerPartNumber: variant,
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
      ]);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.issueType).toBe('POTENTIAL_DUPLICATE');
    }
  });

  it('12. never collapses a meaningful MPN suffix difference', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        manufacturerPartNumber: 'LM358DR',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        manufacturerPartNumber: 'LM358D',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(0);
  });
});

describe('detectDuplicateFindings — name and attribute identity', () => {
  const shared = {
    manufacturerId: 'mfg-yageo',
    categoryId: 'cat-resistors',
    manufacturerPartNumber: null,
  };

  it('13. flags equivalent names with the same manufacturer, category and attributes', () => {
    const attributes = buildIdentityAttributeIndex([
      attributeRow({ componentId: 'c', normalizedNumberValue: '27' }),
      attributeRow({ componentId: 'd', normalizedNumberValue: '27' }),
      {
        componentId: 'c',
        attributeDefinitionId: 'def-package',
        code: 'package',
        label: 'Package',
        dataType: 'SELECT',
        numberValue: null,
        normalizedNumberValue: null,
        booleanValue: null,
        optionId: 'opt-0805',
        unit: null,
      },
      {
        componentId: 'd',
        attributeDefinitionId: 'def-package',
        code: 'package',
        label: 'Package',
        dataType: 'SELECT',
        numberValue: null,
        normalizedNumberValue: null,
        booleanValue: null,
        optionId: 'opt-0805',
        unit: null,
      },
    ]);

    const findings = detect(
      [
        buildEntry({
          ...shared,
          id: 'c',
          sku: 'CMP-100',
          name: '10KΩ SMD Resistor 0805',
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
        }),
        buildEntry({
          ...shared,
          id: 'd',
          sku: 'CMP-200',
          name: '10K Ohm SMD Resistor 0805',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
      ],
      {
        identityAttributes: attributes,
      },
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('POTENTIAL_DUPLICATE');
    expect(findings[0]!.confidenceLevel).toBe('MEDIUM');
    expect(findings[0]!.suggestedValue).toMatchObject({
      matchType: 'NAME_ATTRIBUTE_IDENTITY',
    });
    const sources = (findings[0]!.evidence ?? []).map((item) => item.source);
    expect(sources).toContain('analyzer:duplicate_name');
    expect(sources).toContain('analyzer:duplicate_manufacturer');
    expect(sources).toContain('analyzer:duplicate_category');
    expect(sources).toContain('analyzer:duplicate_attributes');
  });

  it('14. does not flag components that only share a generic name', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        name: 'Resistor',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        name: 'Resistor',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('14b. does not flag components that only share a category', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        name: '10KΩ Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        name: '100KΩ Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('15/16/17/18. guards every conflicting identity-bearing attribute', () => {
    const cases: Array<{ code: string; first: string; second: string }> = [
      { code: 'resistance', first: '27', second: '100' },
      { code: 'capacitance', first: '0.00001', second: '0.0001' },
      { code: 'voltage_rating', first: '25', second: '50' },
      { code: 'forward_current', first: '0.1', second: '0.2' },
      { code: 'power_rating', first: '0.125', second: '0.25' },
      { code: 'tolerance', first: '1', second: '5' },
      { code: 'pin_count', first: '4', second: '8' },
    ];

    for (const testCase of cases) {
      const attributes = buildIdentityAttributeIndex([
        quantityRow(
          'c',
          testCase.code,
          testCase.first,
          testCase.code === 'pin_count' ? 'INTEGER' : 'QUANTITY',
        ),
        quantityRow(
          'd',
          testCase.code,
          testCase.second,
          testCase.code === 'pin_count' ? 'INTEGER' : 'QUANTITY',
        ),
      ]);

      const findings = detect(
        [
          buildEntry({
            id: 'c',
            name: 'Shielded Part 100',
            manufacturerId: 'mfg-yageo',
            categoryId: 'cat-resistors',
            manufacturerPartNumber: null,
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
          }),
          buildEntry({
            id: 'd',
            name: 'Shielded Part 100',
            manufacturerId: 'mfg-yageo',
            categoryId: 'cat-resistors',
            manufacturerPartNumber: null,
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
          }),
        ],
        { identityAttributes: attributes },
      );

      expect({ code: testCase.code, findings: findings.length }).toEqual({
        code: testCase.code,
        findings: 0,
      });
    }
  });

  it('19. does not flag incompatible categories', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        name: '10KΩ Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        name: '10KΩ Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-capacitors',
        manufacturerPartNumber: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('accepts a parent/child category relationship as compatible', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        name: '10KΩ Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        name: '10K Ohm Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-smd-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('POTENTIAL_DUPLICATE');
  });

  it('requires both records to be classified', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        name: '10KΩ Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: null,
        manufacturerPartNumber: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        name: '10K Ohm Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('requires an assigned manufacturer', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        name: '10KΩ Resistor 0805',
        manufacturerId: null,
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        name: '10K Ohm Resistor 0805',
        manufacturerId: null,
        categoryId: 'cat-resistors',
        manufacturerPartNumber: null,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it('prefers the stronger MPN rule when both tiers match the same pair', () => {
    const findings = detect([
      buildEntry({
        id: 'c',
        name: '10KΩ Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: 'RC0805FR-103KL',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
      buildEntry({
        id: 'd',
        name: '10K Ohm Resistor 0805',
        manufacturerId: 'mfg-yageo',
        categoryId: 'cat-resistors',
        manufacturerPartNumber: 'RC0805FR-103KL',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ]);

    expect(findings).toHaveLength(1);
    expect(findings[0]!.issueType).toBe('EXACT_DUPLICATE');
    expect(findings[0]!.suggestedValue).toMatchObject({
      matchType: 'EXACT_MPN',
    });
  });
});

describe('determinism', () => {
  const entries = [
    buildEntry({
      id: 'a',
      sku: 'CMP-A',
      manufacturerId: 'mfg-yageo',
      manufacturerPartNumber: 'RC0805FR-0727RL',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    }),
    buildEntry({
      id: 'b',
      sku: 'CMP-B',
      manufacturerId: 'mfg-yageo',
      manufacturerPartNumber: 'RC0805FR-0727RL',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    }),
    buildEntry({
      id: 'c',
      sku: 'CMP-C',
      manufacturerId: 'mfg-murata',
      manufacturerPartNumber: 'GRM188R71C104KA01D',
      createdAt: new Date('2024-06-01T00:00:00.000Z'),
    }),
    buildEntry({
      id: 'd',
      sku: 'CMP-D',
      manufacturerId: 'mfg-murata',
      manufacturerPartNumber: 'GRM188R71C104KA01D',
      createdAt: new Date('2025-06-01T00:00:00.000Z'),
    }),
  ];

  it('20/21. produces identical findings regardless of catalog order', () => {
    const forward = detect(entries);
    const reversed = detect([...entries].reverse());

    expect(forward.map((finding) => finding.componentId)).toEqual(
      reversed.map((finding) => finding.componentId),
    );
    expect(forward.map((finding) => finding.issueType)).toEqual(
      reversed.map((finding) => finding.issueType),
    );
    expect(forward.map((finding) => finding.suggestedValue)).toEqual(
      reversed.map((finding) => finding.suggestedValue),
    );
  });

  it('22. never emits both A→B and B→A for one pair', () => {
    const findings = detect(entries);
    const pairs = findings.map((finding) =>
      [finding.componentId, finding.relatedComponentId].sort().join('|'),
    );
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('produces byte-identical findings on repeated detection', () => {
    const first = JSON.stringify(detect(entries));
    const second = JSON.stringify(detect(entries));
    expect(second).toBe(first);
  });

  it('is idempotent for a three-member group regardless of input order', () => {
    const group = ['x', 'y', 'z'].map((id, index) =>
      buildEntry({
        id,
        manufacturerId: 'mfg-yageo',
        createdAt: new Date(Date.UTC(2024 + index, 0, 1)),
      }),
    );
    const first = detect(group);
    const second = detect([group[2]!, group[0]!, group[1]!]);
    expect(second.map((finding) => finding.componentId)).toEqual(
      first.map((finding) => finding.componentId),
    );
  });
});

describe('scale and bounds', () => {
  it('25. retrieval helpers stay bounded for a large catalog', () => {
    const catalog = Array.from({ length: 5000 }, (_, index) =>
      buildEntry({
        id: `id-${index.toString().padStart(5, '0')}`,
        sku: `CMP-${index}`,
        name: `Part ${index}`,
        manufacturerPartNumber: `UNIQUE${index.toString().padStart(8, '0')}X`,
        manufacturerId: 'mfg-yageo',
        createdAt: new Date(Date.UTC(2020, 0, 1) + index * 1000),
      }),
    );

    expect(detect(catalog)).toHaveLength(0);
    expect(
      collectNameIdentityCandidateIds(catalog, {
        manufacturerIdentity: buildManufacturerIdentity(),
        genericTerms,
        packagePatterns,
      }),
    ).toHaveLength(0);
  });

  it('groups name-identity candidates by identity key deterministically', () => {
    const catalog = [
      buildEntry({
        id: 'a',
        name: '10KΩ Resistor 0805',
        manufacturerId: 'mfg-yageo',
        manufacturerPartNumber: null,
      }),
      buildEntry({
        id: 'b',
        name: '10K Ohm Resistor 0805',
        manufacturerId: 'mfg-phycomp',
        manufacturerPartNumber: null,
      }),
      buildEntry({
        id: 'c',
        name: '10KΩ Resistor 0805',
        manufacturerId: 'mfg-murata',
        manufacturerPartNumber: null,
      }),
    ];

    const groups = groupNameIdentityCandidates(catalog, {
      manufacturerIdentity: buildManufacturerIdentity(),
      genericTerms,
      packagePatterns,
    });

    // Yageo + Phycomp merge into one identity, Murata stays separate.
    expect(groups).toHaveLength(2);
    const merged = groups.find((group) => group.members.length === 2);
    const standalone = groups.find((group) => group.members.length === 1);
    expect(merged?.members.map((member) => member.id).sort()).toEqual([
      'a',
      'b',
    ]);
    expect(standalone?.members.map((member) => member.id)).toEqual(['c']);
  });

  it('27. caps duplicate findings deterministically', () => {
    const findings = Array.from({ length: 12 }, (_, index) => ({
      componentId: `c-${index}`,
      issueType: 'EXACT_DUPLICATE',
      issueCategory: 'DUPLICATE' as const,
      title: 't',
      description: 'd',
      source: 'analyzer:duplicate',
    }));

    const capped = capDuplicateFindings(findings, 5);
    expect(capped.truncated).toBe(true);
    expect(capped.findings).toHaveLength(5);
    expect(capped.findings.map((finding) => finding.componentId)).toEqual([
      'c-0',
      'c-1',
      'c-2',
      'c-3',
      'c-4',
    ]);

    const uncapped = capDuplicateFindings(findings, 50);
    expect(uncapped.truncated).toBe(false);
    expect(uncapped.findings).toHaveLength(12);
  });

  it('exposes a finite name-candidate bound', () => {
    expect(MAX_NAME_CANDIDATE_ROWS).toBeGreaterThan(0);
    expect(Number.isFinite(MAX_NAME_CANDIDATE_ROWS)).toBe(true);
  });
});

describe('shared helpers', () => {
  it('orders catalog entries by creation date then id', () => {
    const older = buildEntry({
      id: 'b',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    const newer = buildEntry({
      id: 'a',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    expect([newer, older].sort(compareCatalogOrder)).toEqual([older, newer]);
  });

  it('indexes part numbers for owner lookups', () => {
    const index = buildMpnIndex([
      buildEntry({ id: 'a', manufacturerPartNumber: 'RC0805FR-0727RL' }),
      buildEntry({ id: 'b', manufacturerPartNumber: 'rc0805fr0727rl' }),
      buildEntry({ id: 'c', manufacturerPartNumber: null }),
    ]);
    expect(index.get('RC0805FR0727RL')?.map((entry) => entry.id)).toEqual([
      'a',
      'b',
    ]);
    expect(index.size).toBe(1);
  });

  it('treats ancestor/descendant categories as related', () => {
    expect(
      areCategoriesRelated('cat-resistors', 'cat-smd-resistors', categoryById),
    ).toBe(true);
    expect(
      areCategoriesRelated('cat-resistors', 'cat-capacitors', categoryById),
    ).toBe(false);
  });

  it('tokenizes names and singularizes plurals', () => {
    expect(tokenizeName('10KΩ SMD Resistors')).toEqual([
      '10k',
      'smd',
      'resistors',
    ]);
    expect(buildGenericNameTerms({}).has('resistor')).toBe(true);
    expect(buildGenericNameTerms({}).has('resistors')).toBe(true);
  });
});

/**
 * Pass 5B: the bounded semantic layer. These tests exercise the candidate
 * builder (bounds + determinism) and the merged pipeline (one finding per pair,
 * primary/supporting match types, instrumentation).
 */
describe('semantic candidate pairs (Pass 5B bounds)', () => {
  const semanticVocabulary = {
    genericTerms: buildGenericNameTerms({ packagePatterns }),
    packagePatterns,
  };

  function buildRow(overrides: Partial<CatalogMpnEntry> = {}): CatalogMpnEntry {
    return {
      id: 'row-1',
      sku: 'CMP-1',
      name: '10KΩ SMD Thick Film Resistor 0805',
      manufacturerPartNumber: null,
      manufacturerId: 'mfg-yageo',
      categoryId: 'cat-resistors',
      isActive: true,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function buildPairs(
    rows: CatalogMpnEntry[],
    options: {
      scope?: string[];
      includeInactive?: boolean;
      maxCandidatesPerComponent?: number;
      tokenFanout?: ReadonlyMap<string, number>;
    } = {},
  ) {
    return buildSemanticCandidatePairs({
      rows,
      scopeComponentIds: new Set(options.scope ?? rows.map((row) => row.id)),
      includeInactive: options.includeInactive ?? false,
      vocabulary: semanticVocabulary,
      tokenFanout: options.tokenFanout,
      maxCandidatesPerComponent: options.maxCandidatesPerComponent,
    });
  }

  it('blocks only on shared identity tokens', () => {
    const pairs = buildPairs([
      buildRow({ id: 'a', name: '10KΩ Resistor 0805' }),
      buildRow({
        id: 'b',
        name: '10K Ohm 0805 Resistor',
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      }),
      buildRow({
        id: 'c',
        name: 'LM358DR Operational Amplifier',
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      }),
    ]);

    expect(pairs.pairs).toHaveLength(1);
    expect(pairs.pairs[0]!.member.id).toBe('b');
    expect(pairs.pairs[0]!.canonical.id).toBe('a');
    expect(pairs.pairs[0]!.sharedBlockingTokens).toEqual(['0805', '10kohm']);
  });

  it('never pairs a component with itself', () => {
    const pairs = buildPairs([buildRow({ id: 'a' })]);
    expect(pairs.pairs).toHaveLength(0);
  });

  it('emits each pair once, in canonical direction', () => {
    const pairs = buildPairs([
      buildRow({
        id: 'newer',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      buildRow({
        id: 'older',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      }),
    ]);

    expect(pairs.pairs).toHaveLength(1);
    expect(pairs.pairs[0]!.member.id).toBe('newer');
    expect(pairs.pairs[0]!.canonical.id).toBe('older');
  });

  it('21. enforces the per-component candidate cap deterministically', () => {
    const rows = [
      buildRow({ id: 'seed', name: '10KΩ Resistor 0805' }),
      ...Array.from({ length: 40 }, (_, index) =>
        buildRow({
          id: `partner-${index.toString().padStart(2, '0')}`,
          name: '10KΩ Resistor 0805',
          createdAt: new Date(Date.UTC(2024, 0, 1) + index * 1000),
        }),
      ),
    ];

    const capped = buildPairs(rows, { scope: ['seed'] });
    expect(capped.pairs).toHaveLength(MAX_SEMANTIC_CANDIDATES_PER_COMPONENT);
    expect(capped.stats.cappedComponents).toBe(1);

    const reversed = buildPairs([...rows].reverse(), { scope: ['seed'] });
    expect(reversed.pairs.map((pair) => pair.canonical.id)).toEqual(
      capped.pairs.map((pair) => pair.canonical.id),
    );
  });

  it('ranks partners reached through a selective block first', () => {
    const rows = [
      buildRow({ id: 'seed', name: 'LM358DR Amplifier 10KΩ' }),
      buildRow({
        id: 'common-only',
        name: 'Other Part 10KΩ',
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      }),
      buildRow({
        id: 'selective',
        name: 'LM358DR Amplifier 10KΩ',
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      }),
    ];

    const pairs = buildPairs(rows, {
      scope: ['seed'],
      maxCandidatesPerComponent: 1,
      tokenFanout: new Map([
        ['10kohm', 500],
        ['10k', 500],
      ]),
    });

    // Both partners block on the common value token; only `selective` also shares
    // the identifier tokens, so it wins the single available slot.
    expect(pairs.pairs.map((pair) => pair.member.id)).toEqual(['selective']);
    expect(pairs.stats.nonSelectiveTokens).toEqual(['10kohm']);
    expect(pairs.stats.cappedComponents).toBe(1);
  });

  it('24. keeps a large candidate group bounded and ordered', () => {
    const rows = [
      buildRow({ id: 'seed', name: 'LM358DR Operational Amplifier SOIC' }),
      ...Array.from({ length: 500 }, (_, index) =>
        buildRow({
          id: `bulk-${index.toString().padStart(3, '0')}`,
          name: 'LM358DR Operational Amplifier SOIC',
          createdAt: new Date(Date.UTC(2024, 0, 1) + index * 1000),
        }),
      ),
    ];

    const first = buildPairs(rows, { scope: ['seed'] });
    const second = buildPairs([...rows].reverse(), { scope: ['seed'] });

    expect(first.pairs.length).toBe(MAX_SEMANTIC_CANDIDATES_PER_COMPONENT);
    expect(second.pairs.map((pair) => pair.canonical.id)).toEqual(
      first.pairs.map((pair) => pair.canonical.id),
    );
    expect(first.stats.cappedComponents).toBe(1);
  });

  it('respects inactive rows unless requested', () => {
    const rows = [
      buildRow({ id: 'active' }),
      buildRow({
        id: 'inactive',
        isActive: false,
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      }),
    ];

    expect(buildPairs(rows).pairs).toHaveLength(0);
    expect(buildPairs(rows, { includeInactive: true }).pairs).toHaveLength(1);
  });

  it('only considers pairs that touch the audit scope', () => {
    const rows = [
      buildRow({ id: 'a' }),
      buildRow({
        id: 'b',
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      }),
      buildRow({
        id: 'c',
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      }),
    ];
    const pairs = buildPairs(rows, { scope: ['c'] });
    // `c` is newer than both `a` and `b`, so it is the member of both pairs.
    expect(pairs.pairs).toHaveLength(2);
    expect(pairs.pairs.map((pair) => pair.member.id)).toEqual(['c', 'c']);
    expect(pairs.pairs.map((pair) => pair.canonical.id).sort()).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('semantic tier inside the duplicate pipeline', () => {
  const semanticVocabulary = {
    genericTerms: buildGenericNameTerms({ packagePatterns }),
    packagePatterns,
  };

  function entry(overrides: Partial<CatalogMpnEntry> = {}): CatalogMpnEntry {
    return {
      id: 'a',
      sku: 'CMP-000100',
      name: '10KΩ SMD Thick Film Resistor 0805',
      manufacturerPartNumber: null,
      manufacturerId: 'mfg-yageo',
      categoryId: 'cat-resistors',
      isActive: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function run(input: {
    catalog: CatalogMpnEntry[];
    pairs?: ReturnType<typeof buildSemanticCandidatePairs>['pairs'];
    attributes?: Map<string, ComponentIdentityAttributes>;
    scope?: string[];
  }) {
    return runDuplicateDetection({
      catalog: input.catalog,
      scopeComponentIds: new Set(
        input.scope ?? input.catalog.map((row) => row.id),
      ),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
      manufacturerIdentity: buildManufacturerIdentity(),
      categoryById,
      identityAttributesByComponentId: input.attributes,
      genericTerms: semanticVocabulary.genericTerms,
      packagePatterns,
      semanticCandidatePairs: input.pairs ?? [],
    });
  }

  it('produces a semantic POTENTIAL_DUPLICATE finding', () => {
    const catalog = [
      entry({ id: 'a' }),
      entry({
        id: 'b',
        sku: 'CMP-000200',
        name: '10K Ohm 0805 SMD Thick Film Resistor',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ];
    const { pairs } = buildSemanticCandidatePairs({
      rows: catalog,
      scopeComponentIds: new Set(['a', 'b']),
      includeInactive: false,
      vocabulary: semanticVocabulary,
    });

    const outcome = run({ catalog, pairs });

    expect(outcome.semantic.candidatesConsidered).toBe(1);
    expect(outcome.semantic.candidatesAccepted).toBe(1);
    expect(outcome.semantic.findingsProduced).toBe(1);
    expect(outcome.semantic.truncated).toBe(false);

    const semanticFinding = outcome.findings.find(
      (finding) =>
        finding.suggestedValue?.matchType === 'SEMANTIC_NAME_SIMILARITY',
    );
    expect(semanticFinding).toBeDefined();
    expect(semanticFinding!.issueType).toBe('POTENTIAL_DUPLICATE');
    expect(semanticFinding!.issueCategory).toBe('DUPLICATE');
    expect(semanticFinding!.componentId).toBe('b');
    expect(semanticFinding!.relatedComponentId).toBe('a');
    // Fully corroborated (manufacturer + category + resistance + package +
    // identical name modulo formatting), so HIGH is justified - the confidence
    // never comes from name similarity alone.
    expect(semanticFinding!.confidenceLevel).toBe('HIGH');
    expect(typeof semanticFinding!.confidence).toBe('number');
    expect(semanticFinding!.suggestedValue).toMatchObject({
      primaryMatchType: 'SEMANTIC_NAME_SIMILARITY',
    });
    expect(
      (semanticFinding!.evidence ?? []).map((item) => item.source),
    ).toEqual(expect.arrayContaining(['analyzer:duplicate_similarity']));
    expect(semanticFinding!.description).not.toContain('look similar');
  });

  it('17. never produces EXACT_DUPLICATE from the semantic tier', () => {
    const catalog = [
      entry({ id: 'a' }),
      entry({
        id: 'b',
        name: '10K Ohm 0805 SMD Thick Film Resistor',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ];
    const { pairs } = buildSemanticCandidatePairs({
      rows: catalog,
      scopeComponentIds: new Set(['a', 'b']),
      includeInactive: false,
      vocabulary: semanticVocabulary,
    });

    for (const finding of run({ catalog, pairs }).findings) {
      if (finding.suggestedValue?.matchType === 'SEMANTIC_NAME_SIMILARITY') {
        expect(finding.issueType).toBe('POTENTIAL_DUPLICATE');
      }
    }
  });

  it('20. creates one finding per pair with supporting match types', () => {
    // Same manufacturer + identical normalized name + identical MPN: the
    // deterministic rules and the semantic tier all match the same pair.
    const catalog = [
      entry({ id: 'a', manufacturerPartNumber: 'RC0805FR0727RL' }),
      entry({
        id: 'b',
        manufacturerPartNumber: 'RC0805FR0727RL',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ];
    const { pairs } = buildSemanticCandidatePairs({
      rows: catalog,
      scopeComponentIds: new Set(['a', 'b']),
      includeInactive: false,
      vocabulary: semanticVocabulary,
    });

    const outcome = run({ catalog, pairs });
    const pairFindings = outcome.findings.filter(
      (finding) => finding.componentId === 'b',
    );
    expect(pairFindings).toHaveLength(1);

    const finding = pairFindings[0]!;
    expect(finding.issueType).toBe('EXACT_DUPLICATE');
    expect(finding.suggestedValue).toMatchObject({
      matchType: 'EXACT_MPN',
      primaryMatchType: 'EXACT_MPN',
    });
    // Three rules matched the same pair; only the strongest becomes the primary
    // classification and the others are recorded as supporting evidence.
    expect(finding.suggestedValue?.supportingMatchTypes).toEqual([
      'NAME_ATTRIBUTE_IDENTITY',
      'SEMANTIC_NAME_SIMILARITY',
    ]);
    expect(finding.metadata?.supportingMatchTypes).toEqual([
      'NAME_ATTRIBUTE_IDENTITY',
      'SEMANTIC_NAME_SIMILARITY',
    ]);
    expect(finding.metadata?.primaryMatchType).toBe('EXACT_MPN');
  });

  it('18/19. ranks candidates deterministically and reports rejection reasons', () => {
    const catalog = [
      entry({ id: 'seed', name: 'LM358DR Operational Amplifier SOIC-8' }),
      entry({
        id: 'similar',
        name: 'LM358DR Operational Amplifier SOIC-8',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
      entry({
        id: 'conflict',
        name: 'LM358DR Operational Amplifier SOIC-8 25V',
        createdAt: new Date('2025-02-01T00:00:00.000Z'),
      }),
    ];
    const { pairs } = buildSemanticCandidatePairs({
      rows: catalog,
      scopeComponentIds: new Set(['seed']),
      includeInactive: false,
      vocabulary: semanticVocabulary,
    });

    const first = run({ catalog, pairs });
    const second = run({ catalog: [...catalog].reverse(), pairs });
    expect(second.findings.map((finding) => finding.componentId)).toEqual(
      first.findings.map((finding) => finding.componentId),
    );
    expect(second.semantic).toEqual(first.semantic);
    expect(first.semantic.candidatesConsidered).toBe(2);
  });

  it('22. caps semantic findings per audit and reports truncation', () => {
    const catalog = [
      entry({ id: 'seed', name: 'LM358DR Operational Amplifier SOIC-8' }),
      ...Array.from(
        { length: MAX_SEMANTIC_FINDINGS_PER_AUDIT + 25 },
        (_, index) =>
          entry({
            id: `bulk-${index.toString().padStart(4, '0')}`,
            sku: `CMP-${index}`,
            name: 'LM358DR Operational Amplifier SOIC-8',
            createdAt: new Date(Date.UTC(2024, 0, 1) + index * 1000),
          }),
      ),
    ];
    const { pairs } = buildSemanticCandidatePairs({
      rows: catalog,
      scopeComponentIds: new Set(catalog.map((row) => row.id)),
      includeInactive: false,
      vocabulary: semanticVocabulary,
      maxCandidatesPerComponent: 500,
    });

    const outcome = run({ catalog, pairs });
    const semanticFindings = outcome.findings.filter(
      (finding) =>
        finding.suggestedValue?.matchType === 'SEMANTIC_NAME_SIMILARITY',
    );

    expect(semanticFindings.length).toBeLessThanOrEqual(
      MAX_SEMANTIC_FINDINGS_PER_AUDIT,
    );
    expect(outcome.semantic.findingsTruncated).toBeGreaterThan(0);
    expect(outcome.semantic.truncated).toBe(true);
  });

  it('25. never scores more pairs than the bounded candidate set', () => {
    const catalog = [
      ...Array.from({ length: 120 }, (_, index) =>
        entry({
          id: `row-${index.toString().padStart(3, '0')}`,
          sku: `CMP-${index}`,
          name: `LM358DR Operational Amplifier SOIC-8 ${index}`,
          createdAt: new Date(Date.UTC(2024, 0, 1) + index * 1000),
        }),
      ),
    ];
    const { pairs } = buildSemanticCandidatePairs({
      rows: catalog,
      scopeComponentIds: new Set(['row-000']),
      includeInactive: false,
      vocabulary: semanticVocabulary,
    });

    const outcome = run({ catalog, pairs });
    // One seed component can never score more than the per-component cap.
    expect(outcome.semantic.candidatesConsidered).toBeLessThanOrEqual(
      MAX_SEMANTIC_CANDIDATES_PER_COMPONENT,
    );
  });

  it('counts rejections by reason for instrumentation', () => {
    const catalog = [
      entry({ id: 'seed', name: 'LM358DR Operational Amplifier 25V' }),
      entry({
        id: 'worse',
        name: 'LM358DR Operational Amplifier 50V',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ];
    const { pairs } = buildSemanticCandidatePairs({
      rows: catalog,
      scopeComponentIds: new Set(['seed']),
      includeInactive: false,
      vocabulary: semanticVocabulary,
    });

    const outcome = run({ catalog, pairs });
    expect(outcome.semantic.candidatesRejected).toBe(1);
    expect(outcome.semantic.rejectionReasons.TECHNICAL_VALUE_CONFLICT).toBe(1);
    expect(outcome.semantic.findingsProduced).toBe(0);
  });

  it('retrieves but rejects two records whose technical values differ', () => {
    // Blocking is recall-oriented: a shared footprint is enough to *retrieve*
    // the pair. Precision comes from the physical-value guard, which rejects it.
    const catalog = [
      entry({ id: 'seed', name: '10KΩ Resistor 0805' }),
      entry({
        id: 'other',
        name: '100KΩ Resistor 0805',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ];
    const { pairs } = buildSemanticCandidatePairs({
      rows: catalog,
      scopeComponentIds: new Set(['seed']),
      includeInactive: false,
      vocabulary: semanticVocabulary,
    });

    expect(pairs).toHaveLength(1);

    const outcome = run({ catalog, pairs });
    expect(outcome.semantic.candidatesConsidered).toBe(1);
    expect(outcome.semantic.candidatesRejected).toBe(1);
    expect(outcome.semantic.rejectionReasons.TECHNICAL_VALUE_CONFLICT).toBe(1);
    expect(outcome.semantic.findingsProduced).toBe(0);
  });
});

describe('buildAttributeComparison (duplicate review comparison)', () => {
  const comparisonVocabulary = {
    genericTerms: buildGenericNameTerms({ packagePatterns }),
    packagePatterns,
  };

  function catalogEntry(
    overrides: Partial<CatalogMpnEntry> = {},
  ): CatalogMpnEntry {
    return {
      id: 'a',
      sku: 'CMP-000100',
      name: 'Chip Resistor 27 Ohm',
      manufacturerPartNumber: null,
      manufacturerId: 'mfg-yageo',
      categoryId: 'cat-resistors',
      isActive: true,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  /** Attribute rows for one component, indexed by component id. */
  function attributes(
    componentId: string,
    entries: Array<{ code: string; label: string; value: string }>,
  ): ComponentAttributeValueRow[] {
    return entries.map((entry) => ({
      componentId,
      attributeDefinitionId: `def-${entry.code}`,
      code: entry.code,
      label: entry.label,
      dataType: 'QUANTITY',
      numberValue: entry.value,
      normalizedNumberValue: entry.value,
      booleanValue: null,
      optionId: null,
      unit: null,
    }));
  }

  /** Indexed values for a pair of components, keyed by component id. */
  function indexPair(
    memberEntries: Array<{ code: string; label: string; value: string }>,
    canonicalEntries: Array<{ code: string; label: string; value: string }>,
  ) {
    return buildIdentityAttributeIndex([
      ...attributes('a', memberEntries),
      ...attributes('b', canonicalEntries),
    ]);
  }

  it('reports matches and differences for attributes recorded on both sides', () => {
    const index = indexPair(
      [
        { code: 'resistance', label: 'Resistance', value: '27' },
        { code: 'tolerance', label: 'Tolerance', value: '1' },
      ],
      [
        { code: 'resistance', label: 'Resistance', value: '27' },
        { code: 'tolerance', label: 'Tolerance', value: '5' },
      ],
    );

    const comparison = buildAttributeComparison(index.get('a'), index.get('b'));

    expect(comparison).toEqual([
      {
        code: 'resistance',
        label: 'Resistance',
        current: '27',
        related: '27',
        result: 'MATCH',
      },
      {
        code: 'tolerance',
        label: 'Tolerance',
        current: '1',
        related: '5',
        result: 'DIFFERENT',
      },
    ]);
  });

  it('omits attributes only one side records (missing is not a difference)', () => {
    const index = indexPair(
      [{ code: 'resistance', label: 'Resistance', value: '27' }],
      [
        { code: 'resistance', label: 'Resistance', value: '27' },
        { code: 'voltage_rating', label: 'Voltage Rating', value: '25' },
      ],
    );

    expect(
      buildAttributeComparison(index.get('a'), index.get('b')).map(
        (entry) => entry.code,
      ),
    ).toEqual(['resistance']);
  });

  it('returns nothing when either side has no identity attributes', () => {
    const index = indexPair(
      [{ code: 'resistance', label: 'Resistance', value: '27' }],
      [],
    );
    expect(buildAttributeComparison(index.get('a'), undefined)).toEqual([]);
    expect(buildAttributeComparison(undefined, index.get('a'))).toEqual([]);
  });

  it('is deterministic regardless of attribute order', () => {
    // Identical attribute sets on both sides, only the insertion order differs.
    const first = indexPair(
      [
        { code: 'tolerance', label: 'Tolerance', value: '1' },
        { code: 'resistance', label: 'Resistance', value: '27' },
      ],
      [
        { code: 'resistance', label: 'Resistance', value: '27' },
        { code: 'tolerance', label: 'Tolerance', value: '1' },
      ],
    );
    const second = indexPair(
      [
        { code: 'resistance', label: 'Resistance', value: '27' },
        { code: 'tolerance', label: 'Tolerance', value: '1' },
      ],
      [
        { code: 'tolerance', label: 'Tolerance', value: '1' },
        { code: 'resistance', label: 'Resistance', value: '27' },
      ],
    );

    const left = buildAttributeComparison(first.get('a'), first.get('b'));
    const right = buildAttributeComparison(second.get('a'), second.get('b'));
    expect(right.map((entry) => entry.code)).toEqual(
      left.map((entry) => entry.code),
    );
    expect(right.map((entry) => entry.result)).toEqual(
      left.map((entry) => entry.result),
    );
  });

  it('is attached to duplicate findings for the review comparison', () => {
    const catalog = [
      catalogEntry({ id: 'a', manufacturerPartNumber: 'RC0805FR0727RL' }),
      catalogEntry({
        id: 'b',
        manufacturerPartNumber: 'rc0805fr0727rl',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      }),
    ];
    const identityAttributes = buildIdentityAttributeIndex([
      ...attributes('a', [
        { code: 'resistance', label: 'Resistance', value: '27' },
      ]),
      ...attributes('b', [
        { code: 'resistance', label: 'Resistance', value: '27' },
      ]),
    ]);

    const outcome = runDuplicateDetection({
      catalog,
      scopeComponentIds: new Set(['a', 'b']),
      includeInactive: false,
      intelligenceVersion: COMPONENT_REVIEW_INTELLIGENCE_VERSION,
      manufacturerIdentity: buildManufacturerIdentity(),
      categoryById,
      identityAttributesByComponentId: identityAttributes,
      genericTerms: comparisonVocabulary.genericTerms,
      packagePatterns,
    });

    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]!.metadata?.attributeComparison).toEqual([
      {
        code: 'resistance',
        label: 'Resistance',
        current: '27',
        related: '27',
        result: 'MATCH',
      },
    ]);
  });
});
