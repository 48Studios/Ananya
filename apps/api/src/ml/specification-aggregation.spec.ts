import {
  AGGREGATE_STATES,
  CONFIDENCE_REASON_LABELS,
  aggregateSpecifications,
  comparableFromCandidate,
  type AggregatedAttributeDefinition,
  type SpecificationSourceCandidate,
} from './specification-aggregation';
import {
  deduplicateEvidence,
  normalizeEvidence,
  orderEvidence,
  type SpecificationEvidenceItem,
} from './specification-evidence';
import type { UnitRef } from './attribute-value-semantics';

/**
 * Pass 4 unit coverage for cross-document specification aggregation.
 *
 * The scenario the pass exists for: the same attribute stated by more than one
 * document. Agreement must strengthen evidence without multiplying findings,
 * disagreement must be surfaced instead of silently resolved, and the value the
 * component already records must take part in the comparison.
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
    name: 'kV',
    category: 'Voltage',
    isBaseUnit: false,
    conversionFactor: 1000,
    precision: 2,
  },
  {
    name: 'W',
    category: 'Power',
    isBaseUnit: true,
    conversionFactor: 1,
    precision: 3,
  },
  {
    name: 'mW',
    category: 'Power',
    isBaseUnit: false,
    conversionFactor: 0.001,
    precision: 4,
  },
];

const RESISTANCE: AggregatedAttributeDefinition = {
  id: 'def-resistance',
  code: 'resistance',
  name: 'Resistance',
  dataType: 'QUANTITY',
  unitCategory: 'Resistance',
  defaultUnit: 'ohm',
  validationRules: null,
};

const VOLTAGE: AggregatedAttributeDefinition = {
  id: 'def-voltage',
  code: 'voltage_rating',
  name: 'Voltage Rating',
  dataType: 'QUANTITY',
  unitCategory: 'Voltage',
  defaultUnit: 'V',
  validationRules: null,
};

const PACKAGE: AggregatedAttributeDefinition = {
  id: 'def-package',
  code: 'package',
  name: 'Package / Case',
  dataType: 'SELECT',
  unitCategory: null,
  defaultUnit: null,
  validationRules: null,
};

const DEFINITIONS = [RESISTANCE, VOLTAGE, PACKAGE];

function evidence(
  overrides: Partial<SpecificationEvidenceItem> = {},
): SpecificationEvidenceItem {
  return {
    role: 'PRIMARY',
    documentId: 'doc-1',
    documentVersion: 1,
    documentContentHash: 'hash-1',
    documentFileName: 'datasheet.pdf',
    documentType: 'DATASHEET',
    page: 3,
    text: '... resistance 300 ohm ...',
    extractionMethod: 'extractor:ee_regex',
    source: 'extractor:ee_regex',
    weight: 0.95,
    description: 'Extracted resistance rating 300Ω',
    section: 'ELECTRICAL_CHARACTERISTICS',
    ...overrides,
  };
}

function candidate(
  overrides: Partial<SpecificationSourceCandidate> = {},
): SpecificationSourceCandidate {
  return {
    documentId: 'doc-1',
    documentVersion: 1,
    documentContentHash: 'hash-1',
    documentFileName: 'datasheet.pdf',
    documentType: 'DATASHEET',
    attributeDefinitionId: 'def-resistance',
    attributeCode: 'resistance',
    extractedCode: 'resistance',
    formatted: '300Ω',
    unit: 'ohm',
    normalizedValue: { value: 300, unit: 'ohm' },
    optionCode: null,
    applicable: true,
    inapplicableReason: null,
    resolutionConfidence: 0.96,
    resolutionReasons: [
      'the attribute code matches the extracted property exactly',
    ],
    extractionConfidence: 0.95,
    evidence: [evidence()],
    ...overrides,
  };
}

function aggregate(
  candidates: SpecificationSourceCandidate[],
  options: {
    definitions?: AggregatedAttributeDefinition[];
    currentValues?: Map<string, { display: string }>;
    expectedAttributeCodes?: string[];
  } = {},
) {
  return aggregateSpecifications({
    definitions: options.definitions ?? DEFINITIONS,
    candidates,
    units: UNITS,
    currentValues: options.currentValues,
    expectedAttributeCodes: options.expectedAttributeCodes,
  });
}

function only(
  candidates: SpecificationSourceCandidate[],
  options: Parameters<typeof aggregate>[1] = {},
) {
  const result = aggregate(candidates, options);
  expect(result).toHaveLength(1);
  return result[0]!;
}

// ---------------------------------------------------------------------------
// §13 — agreement strengthens evidence without multiplying findings
// ---------------------------------------------------------------------------

describe('cross-document agreement', () => {
  it('produces one aggregate for two agreeing documents', () => {
    const result = only([
      candidate(),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        documentFileName: 'product-page.pdf',
        documentType: 'PRODUCT_PAGE',
        evidence: [
          evidence({
            documentId: 'doc-2',
            documentContentHash: 'hash-2',
            documentFileName: 'product-page.pdf',
            documentType: 'PRODUCT_PAGE',
            page: 2,
            text: 'Resistance 300 ohm',
          }),
        ],
      }),
    ]);

    expect(result.state).toBe('AGREED');
    expect(result.sources).toHaveLength(2);
    expect(result.groups).toHaveLength(1);
    expect(result.documentCount).toBe(2);
    expect(result.evidence).toHaveLength(2);
    expect(result.confidenceReasons).toContain(
      `+ ${CONFIDENCE_REASON_LABELS.MULTIPLE_DOCUMENTS}`,
    );
  });

  it('produces one aggregate for three agreeing documents', () => {
    const result = only([
      candidate(),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        documentFileName: 'product-page.pdf',
        evidence: [
          evidence({
            documentId: 'doc-2',
            documentContentHash: 'hash-2',
            documentFileName: 'product-page.pdf',
            page: 2,
            text: 'Resistance 300 ohm',
          }),
        ],
      }),
      candidate({
        documentId: 'doc-3',
        documentContentHash: 'hash-3',
        documentFileName: 'application-note.pdf',
        evidence: [
          evidence({
            documentId: 'doc-3',
            documentContentHash: 'hash-3',
            documentFileName: 'application-note.pdf',
            page: 1,
            text: 'nominal resistance 300 ohm',
          }),
        ],
      }),
    ]);

    expect(result.state).toBe('AGREED');
    expect(result.documentCount).toBe(3);
    expect(result.evidence).toHaveLength(3);
    expect(result.confidenceReasons).toContain(
      `+ ${CONFIDENCE_REASON_LABELS.MANY_DOCUMENTS}`,
    );
  });

  it('counts agreement across documents even when the unit is written differently', () => {
    // `300 Ω` and `0.3 kΩ` are the same resistance: agreement is semantic.
    const result = only([
      candidate(),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        formatted: '0.3kΩ',
        unit: 'kohm',
        normalizedValue: { value: 0.3, unit: 'kohm' },
      }),
    ]);

    expect(result.state).toBe('AGREED');
    expect(result.groups).toHaveLength(1);
    expect(
      result.sources.every((source) => source.agreement === 'AGREES'),
    ).toBe(true);
  });

  it('keeps two revisions of one document as two sources of one document', () => {
    const result = only([
      candidate({ documentVersion: 1, documentContentHash: 'hash-1' }),
      candidate({
        documentVersion: 2,
        documentContentHash: 'hash-2',
        evidence: [
          evidence({
            documentVersion: 2,
            documentContentHash: 'hash-2',
            page: 3,
            text: 'Resistance 300 ohm (revised layout)',
          }),
        ],
      }),
    ]);

    expect(result.sources).toHaveLength(2);
    // One document, two revisions: the count of independent sources stays one.
    expect(result.documentCount).toBe(1);
    expect(result.sources.map((source) => source.documentVersion)).toEqual([
      1, 2,
    ]);
  });

  it('produces no aggregate for two documents that state different attributes', () => {
    const result = aggregate([
      candidate(),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        extractedCode: 'voltage',
        formatted: '50V',
        unit: 'V',
        normalizedValue: { value: 50, unit: 'V' },
        evidence: [evidence({ documentId: 'doc-2', page: 1 })],
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.attributeCode)).toEqual([
      'resistance',
      'voltage_rating',
    ]);
  });

  it('orders aggregates and sources deterministically', () => {
    const build = () =>
      aggregate([
        candidate({
          documentId: 'doc-b',
          documentContentHash: 'hash-b',
          attributeDefinitionId: 'def-voltage',
          attributeCode: 'voltage_rating',
          formatted: '50V',
          unit: 'V',
          normalizedValue: { value: 50, unit: 'V' },
        }),
        candidate({ documentId: 'doc-c', documentContentHash: 'hash-c' }),
        candidate({ documentId: 'doc-a', documentContentHash: 'hash-a' }),
      ]);

    const first = build();
    expect(first.map((entry) => entry.attributeCode)).toEqual([
      'resistance',
      'voltage_rating',
    ]);
    // Sources sorted by document identity, never by discovery order.
    expect(first[0]!.sources.map((source) => source.documentId)).toEqual([
      'doc-a',
      'doc-c',
    ]);
  });
});

// ---------------------------------------------------------------------------
// §14 — cross-document conflicts are surfaced, never resolved
// ---------------------------------------------------------------------------

describe('cross-document conflicts', () => {
  it('reports a conflict when two documents state different values', () => {
    const result = only([
      candidate({
        formatted: '50V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 50, unit: 'V' },
      }),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        documentFileName: 'product-page.pdf',
        formatted: '25V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 25, unit: 'V' },
      }),
    ]);

    expect(result.state).toBe('CONFLICT');
    // Nothing is offered for application when sources disagree.
    expect(result.value).toBeNull();
    expect(result.display).toBeNull();
    expect(result.notApplicableReason).toContain('Documents disagree');
    expect(result.confidenceReasons).toContain(
      `- ${CONFIDENCE_REASON_LABELS.SOURCE_CONFLICT}`,
    );
  });

  it('shows what each source says', () => {
    const result = only([
      candidate({
        formatted: '50V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 50, unit: 'V' },
      }),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        documentFileName: 'product-page.pdf',
        documentType: 'PRODUCT_PAGE',
        formatted: '25V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 25, unit: 'V' },
      }),
    ]);

    expect(result.groups).toHaveLength(2);
    const displays = result.groups
      .map((group) => `${group.display} (${group.sources.length})`)
      .sort();
    expect(displays).toEqual(['25V (1)', '50V (1)']);
    // Every group is labelled, so the UI can mark the conflicting one.
    expect(result.groups.some((group) => group.agreement === 'CONFLICTS')).toBe(
      true,
    );
  });

  it('marks the minority as the conflicting source', () => {
    const result = only([
      candidate({
        formatted: '50V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 50, unit: 'V' },
      }),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        formatted: '25V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 25, unit: 'V' },
      }),
      candidate({
        documentId: 'doc-3',
        documentContentHash: 'hash-3',
        formatted: '25V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 25, unit: 'V' },
      }),
    ]);

    expect(result.state).toBe('CONFLICT');
    const first = result.sources.find(
      (source) => source.documentId === 'doc-1',
    )!;
    const agreeing = result.sources.filter(
      (source) => source.agreement === 'AGREES',
    );
    // Two documents agree with each other, so the outlier is the conflict.
    expect(agreeing).toHaveLength(2);
    expect(first.agreement).toBe('CONFLICTS');
  });

  it('reports a conflict across document types even when values are close', () => {
    const result = only([
      candidate(),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        formatted: '330Ω',
        normalizedValue: { value: 330, unit: 'ohm' },
      }),
    ]);

    expect(result.state).toBe('CONFLICT');
    expect(result.groups).toHaveLength(2);
  });

  it('does not treat an incomparable source as agreement', () => {
    const result = only([
      candidate(),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        // An unknown unit cannot be reconciled with `ohm`, and must not be
        // assumed equal.
        formatted: '25 C/W',
        unit: 'C/W',
        normalizedValue: { value: 25, unit: 'C/W' },
      }),
    ]);

    const unknown = result.sources.find(
      (source) => source.documentId === 'doc-2',
    )!;
    expect(unknown.agreement).toBe('INCOMPARABLE');
    // The weakness is disclosed, and it costs confidence.
    expect(result.confidenceReasons).toContain(
      `- ${CONFIDENCE_REASON_LABELS.INCOMPARABLE_SOURCE}`,
    );
    // An incomparable source is not corroboration, so this is not an agreed
    // value backed by two documents.
    expect(result.agreeingDocumentCount).toBe(1);
    expect(result.confidenceReasons).not.toContain(
      `+ ${CONFIDENCE_REASON_LABELS.MULTIPLE_DOCUMENTS}`,
    );
  });

  it('never counts a disagreeing document as corroboration', () => {
    const result = only([
      candidate({
        formatted: '50V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 50, unit: 'V' },
      }),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        formatted: '25V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 25, unit: 'V' },
      }),
    ]);

    expect(result.state).toBe('CONFLICT');
    expect(result.documentCount).toBe(2);
    // Two documents contributed, none of them corroborate the other.
    expect(result.agreeingDocumentCount).toBe(0);
    expect(result.confidenceReasons).not.toContain(
      `+ ${CONFIDENCE_REASON_LABELS.MULTIPLE_DOCUMENTS}`,
    );
  });

  it('labels no side of a tie as agreeing', () => {
    const result = only([
      candidate({
        formatted: '50V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 50, unit: 'V' },
      }),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        formatted: '25V',
        unit: 'V',
        attributeDefinitionId: 'def-voltage',
        attributeCode: 'voltage_rating',
        normalizedValue: { value: 25, unit: 'V' },
      }),
    ]);

    // With one document on each side, neither value is corroborated, so calling
    // either of them "agreed" would imply a majority that does not exist.
    expect(
      result.sources.every((source) => source.agreement === 'CONFLICTS'),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §16 — documented value versus the value the component records
// ---------------------------------------------------------------------------

describe('component value comparison', () => {
  it('reports when the component already records the agreed value', () => {
    const result = only([candidate()], {
      currentValues: new Map([['def-resistance', { display: '300 ohm' }]]),
    });

    expect(result.state).toBe('ALREADY_CURRENT');
    expect(result.erpAgreement).toBe('AGREES');
    expect(result.currentValue).toBe('300 ohm');
    expect(result.confidenceReasons).toContain(
      `+ ${CONFIDENCE_REASON_LABELS.ERP_AGREES}`,
    );
  });

  it('recognises an equivalent recorded value written in another unit', () => {
    const result = only([candidate()], {
      currentValues: new Map([['def-resistance', { display: '0.3 kohm' }]]),
    });

    expect(result.state).toBe('ALREADY_CURRENT');
  });

  it('reports when the component records a different value', () => {
    const result = only([candidate()], {
      currentValues: new Map([['def-resistance', { display: '470 ohm' }]]),
    });

    expect(result.state).toBe('AGREED');
    expect(result.erpAgreement).toBe('CONFLICTS');
    expect(result.erpComparison).toBe('DIFFERENT');
    expect(result.confidenceReasons).toContain(
      `- ${CONFIDENCE_REASON_LABELS.ERP_CONFLICTS}`,
    );
  });

  it('distinguishes per-source agreement with the recorded value', () => {
    // §16's example: the datasheet agrees with the ERP value, a second document
    // conflicts with it.
    const result = only(
      [
        candidate({
          formatted: '50V',
          unit: 'V',
          attributeDefinitionId: 'def-voltage',
          attributeCode: 'voltage_rating',
          normalizedValue: { value: 50, unit: 'V' },
        }),
        candidate({
          documentId: 'doc-2',
          documentContentHash: 'hash-2',
          formatted: '50V',
          unit: 'V',
          attributeDefinitionId: 'def-voltage',
          attributeCode: 'voltage_rating',
          normalizedValue: { value: 50, unit: 'V' },
        }),
      ],
      { currentValues: new Map([['def-voltage', { display: '50 V' }]]) },
    );

    expect(result.state).toBe('ALREADY_CURRENT');
    expect(result.sources.every((source) => source.erp === 'AGREES')).toBe(
      true,
    );

    const conflicting = only(
      [
        candidate({
          formatted: '50V',
          unit: 'V',
          attributeDefinitionId: 'def-voltage',
          attributeCode: 'voltage_rating',
          normalizedValue: { value: 50, unit: 'V' },
        }),
        candidate({
          documentId: 'doc-2',
          documentContentHash: 'hash-2',
          formatted: '25V',
          unit: 'V',
          attributeDefinitionId: 'def-voltage',
          attributeCode: 'voltage_rating',
          normalizedValue: { value: 25, unit: 'V' },
        }),
      ],
      { currentValues: new Map([['def-voltage', { display: '50 V' }]]) },
    );

    // A conflicting pair is a document conflict first, and the ERP comparison is
    // reported alongside rather than replacing it.
    expect(conflicting.state).toBe('CONFLICT');
    const datasheet = conflicting.sources.find(
      (source) => source.documentId === 'doc-1',
    )!;
    const productPage = conflicting.sources.find(
      (source) => source.documentId === 'doc-2',
    )!;
    expect(datasheet.erp).toBe('AGREES');
    expect(productPage.erp).toBe('CONFLICTS');
  });

  it('reports ABSENT when the component records nothing', () => {
    const result = only([candidate()]);

    expect(result.erpAgreement).toBe('ABSENT');
    expect(result.currentValue).toBeNull();
  });

  it('never mutates or discards evidence because the ERP value conflicts', () => {
    const result = only([candidate()], {
      currentValues: new Map([['def-resistance', { display: '470 ohm' }]]),
    });

    expect(result.evidence).toHaveLength(1);
    expect(result.value).toEqual({ value: 300, unit: 'ohm' });
  });
});

// ---------------------------------------------------------------------------
// §14 / §6 — not-actionable aggregates
// ---------------------------------------------------------------------------

describe('non-actionable aggregates', () => {
  it('does not offer a value that the attribute cannot represent', () => {
    const result = only([
      candidate({
        applicable: false,
        inapplicableReason: 'INVALID_VALUE',
        normalizedValue: null,
      }),
    ]);

    expect(result.state).toBe('NOT_ACTIONABLE');
    expect(result.value).toBeNull();
    expect(result.notApplicableReason).toBe('INVALID_VALUE');
  });

  it('ignores candidates whose attribute was never resolved', () => {
    const result = aggregate([
      candidate({ attributeDefinitionId: null, attributeCode: null }),
    ]);

    expect(result).toEqual([]);
  });

  it('ignores a candidate pointing at a definition that is gone', () => {
    const result = aggregate([
      candidate({ attributeDefinitionId: 'def-missing' }),
    ]);

    expect(result).toEqual([]);
  });

  it('carries the extracted code so the UI can show the document wording', () => {
    const result = only([candidate({ extractedCode: 'nominal_resistance' })]);

    expect(result.extractedCode).toBe('nominal_resistance');
    expect(result.attributeCode).toBe('resistance');
  });
});

// ---------------------------------------------------------------------------
// §12 / §17 — evidence quality and confidence reasons
// ---------------------------------------------------------------------------

describe('evidence and confidence', () => {
  it('deduplicates identical evidence across documents and revisions', () => {
    const shared = evidence();
    const items = deduplicateEvidence([shared, { ...shared }]);
    expect(items).toHaveLength(1);
  });

  it('keeps evidence from different pages as separate items', () => {
    const items = deduplicateEvidence([
      evidence({ page: 3 }),
      evidence({ page: 7, text: 'Resistance 300 ohm' }),
    ]);
    expect(items).toHaveLength(2);
  });

  it('keeps the strongest role when the same line appears twice', () => {
    const items = deduplicateEvidence([
      evidence({ role: 'CONTEXTUAL', section: 'GENERAL' }),
      evidence({ role: 'PRIMARY', section: 'ELECTRICAL_CHARACTERISTICS' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]!.role).toBe('PRIMARY');
  });

  it('orders evidence deterministically with strongest first', () => {
    const ordered = orderEvidence([
      evidence({ role: 'CONTEXTUAL', page: 1, section: 'GENERAL' }),
      evidence({ role: 'PRIMARY', page: 7, section: 'ORDERING_INFORMATION' }),
      evidence({ role: 'PRIMARY', page: 3 }),
    ]);

    expect(ordered.map((item) => item.page)).toEqual([3, 7, 1]);
    expect(ordered.map((item) => item.role)).toEqual([
      'PRIMARY',
      'PRIMARY',
      'CONTEXTUAL',
    ]);
  });

  it('normalises evidence for storage without losing pages', () => {
    const normalised = normalizeEvidence([
      evidence({ page: 7, text: 'Resistance 300 ohm' }),
      evidence({ page: 3 }),
      evidence({ page: 3 }),
    ]);

    expect(normalised).toHaveLength(2);
    expect(normalised.map((item) => item.page)).toEqual([3, 7]);
  });

  it('rewards primary-section evidence and penalises contextual-only evidence', () => {
    const primary = only([candidate()]);
    const contextual = only([
      candidate({
        evidence: [
          evidence({ role: 'CONTEXTUAL', section: 'GENERAL', page: 1 }),
        ],
      }),
    ]);

    expect(primary.confidenceReasons).toContain(
      `+ ${CONFIDENCE_REASON_LABELS.PRIMARY_EVIDENCE}`,
    );
    expect(contextual.confidenceReasons).toContain(
      `- ${CONFIDENCE_REASON_LABELS.CONTEXTUAL_ONLY}`,
    );
    expect(contextual.confidence).toBeLessThan(primary.confidence);
  });

  it('reports positives before negatives', () => {
    const result = only([candidate()], {
      currentValues: new Map([['def-resistance', { display: '470 ohm' }]]),
    });

    const signs = result.confidenceReasons.map((reason) => reason[0]);
    const firstNegative = signs.indexOf('-');
    expect(firstNegative).toBeGreaterThan(-1);
    expect(signs.slice(firstNegative).every((sign) => sign === '-')).toBe(true);
  });

  it('takes the weakest source as the aggregate confidence', () => {
    const strong = only([candidate()]);
    const mixed = only([
      candidate(),
      candidate({
        documentId: 'doc-2',
        documentContentHash: 'hash-2',
        resolutionConfidence: 0.5,
        extractionConfidence: 0.6,
      }),
    ]);

    expect(mixed.confidence).toBeLessThan(strong.confidence);
    expect(mixed.confidenceReasons).toContain(
      `- ${CONFIDENCE_REASON_LABELS.RESOLUTION_WEAK}`,
    );
  });

  it('never reports full confidence without corroboration', () => {
    const result = only([candidate()]);
    expect(result.confidence).toBeLessThan(1);
  });

  it('rewards a Data Pack expected specification', () => {
    const withExpected = only([candidate()], {
      expectedAttributeCodes: ['resistance'],
    });

    expect(withExpected.confidenceReasons).toContain(
      `+ ${CONFIDENCE_REASON_LABELS.EXPECTED_BY_CATEGORY}`,
    );
  });

  it('names every state the caller must handle', () => {
    expect([...AGGREGATE_STATES]).toEqual([
      'AGREED',
      'CONFLICT',
      'ALREADY_CURRENT',
      'NOT_ACTIONABLE',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Reading comparable values out of a candidate
// ---------------------------------------------------------------------------

describe('comparable value extraction', () => {
  it('reads a quantity from the coerced payload', () => {
    expect(comparableFromCandidate(candidate(), 'QUANTITY')).toEqual({
      amount: 300,
      unit: 'ohm',
    });
  });

  it('reads a select option', () => {
    expect(
      comparableFromCandidate(
        {
          formatted: '0805',
          unit: null,
          normalizedValue: { value: '0805', optionCode: '0805' },
          optionCode: '0805',
        },
        'SELECT',
      ),
    ).toEqual({ optionCode: '0805' });
  });

  it('reads a multi-select option list', () => {
    expect(
      comparableFromCandidate(
        {
          formatted: 'SMD, Through Hole',
          unit: null,
          normalizedValue: { value: ['SMD', 'Through Hole'] },
          optionCode: null,
        },
        'MULTI_SELECT',
      ),
    ).toEqual({ optionCodes: ['SMD', 'Through Hole'] });
  });

  it('reads a boolean and a date', () => {
    expect(
      comparableFromCandidate(
        {
          formatted: 'Yes',
          unit: null,
          normalizedValue: { value: true },
          optionCode: null,
        },
        'BOOLEAN',
      ),
    ).toEqual({ booleanValue: true });

    expect(
      comparableFromCandidate(
        {
          formatted: '2024-05-01',
          unit: null,
          normalizedValue: { value: '2024-05-01' },
          optionCode: null,
        },
        'DATE',
      ),
    ).toEqual({ dateValue: '2024-05-01' });
  });

  it('falls back to the display form when no coerced payload exists', () => {
    expect(
      comparableFromCandidate(
        {
          formatted: '0.125W',
          unit: 'W',
          normalizedValue: null,
          optionCode: null,
        },
        'QUANTITY',
      ),
    ).toEqual({ amount: 0.125, unit: 'W' });
  });
});
