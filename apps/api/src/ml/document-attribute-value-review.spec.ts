import {
  ATTRIBUTE_VALUE_ISSUE_CATEGORY,
  ATTRIBUTE_VALUE_ISSUE_TYPE,
  DOCUMENT_ATTRIBUTE_SOURCE,
  attributeFindingField,
  buildAttributeValueProvenance,
  buildDocumentAttributeFindings,
  readAttributeProvenance,
  suggestedAttributeDisplay,
} from './document-attribute-value-review';
import { buildFindingFingerprint } from './component-review-queue.service';
import { DATASHEET_INTELLIGENCE_VERSION } from './documentation-intelligence.dtos';
import type { AttributeCandidateDto } from './documentation-intelligence.dtos';
import {
  resolveAttributeCandidates,
  type AttributeDefinitionRef,
  type NormalizedExtraction,
  type NormalizedExtractionAttribute,
  type ResolveAttributeCandidatesInput,
} from './documentation-intelligence';

/**
 * Pass 3 unit coverage for Attribute Value Review.
 *
 * Two things are being pinned down here:
 *
 *  1. What a datasheet property becomes — its resolution state, validation
 *     state, and whether it may be applied at all.
 *  2. What a reviewable finding carries — the fingerprint that makes
 *     re-analysis idempotent and the provenance that records, on the component
 *     attribute itself, exactly where a value came from.
 *
 * Nothing in this module writes component data, and nothing is invented: a
 * property with no existing attribute definition is never given one.
 */

const CONTEXT = {
  documentId: 'doc-1',
  documentVersion: 2,
  documentFileName: 'MC0805S8F3000T5E.pdf',
  contentHash: 'a'.repeat(64),
};

const DOCUMENT = {
  documentId: 'doc-1',
  documentVersion: 2,
  documentFileName: 'MC0805S8F3000T5E.pdf',
  contentHash: 'a'.repeat(64),
  documentTitle: 'MC0805S8F3000T5E datasheet',
};

const COMPONENT = { id: 'comp-1', sku: 'SKU-1', name: 'Resistor' };

function attribute(
  overrides: Partial<NormalizedExtractionAttribute> = {},
): NormalizedExtractionAttribute {
  return {
    code: 'resistance',
    value: 330,
    unit: 'ohm',
    sourceValue: null,
    sourceUnit: null,
    formatted: '330Ω',
    confidence: 0.95,
    confidenceLevel: 'HIGH',
    evidence: [
      {
        type: 'datasheet_param',
        description: 'Extracted resistance rating 330Ω',
        weight: 0.95,
        source: 'extractor:ee_regex',
        page: 3,
        text: '... resistance 330 ohm ±1% ...',
        section: 'ELECTRICAL_CHARACTERISTICS',
      },
    ],
    ...overrides,
  };
}

function extraction(
  attributes: NormalizedExtractionAttribute[],
): NormalizedExtraction {
  return {
    attributes,
    extractedText: 'MC0805S8F3000T5E 330 Ohm 1% 0805',
    extractedTextPreview: 'MC0805S8F3000T5E 330 Ohm…',
    pageCount: 4,
    pagesAnalyzed: 4,
    extractorVersion: 'datasheet-extract-v1',
  };
}

function definition(
  overrides: Partial<AttributeDefinitionRef> = {},
): AttributeDefinitionRef {
  return {
    id: 'def-resistance',
    code: 'resistance',
    name: 'Resistance',
    dataType: 'QUANTITY',
    unitCategory: 'Resistance',
    defaultUnit: 'ohm',
    aliases: [],
    options: [],
    isActive: true,
    ...overrides,
  };
}

function resolve(
  attributeOverrides: Partial<NormalizedExtractionAttribute> = {},
  options: {
    definitions?: AttributeDefinitionRef[];
    currentValues?: Map<
      string,
      { attributeDefinitionId: string; display: string }
    >;
  } = {},
): AttributeCandidateDto {
  const input: ResolveAttributeCandidatesInput = {
    extraction: extraction([attribute(attributeOverrides)]),
    definitions: options.definitions ?? [definition()],
    currentValues: (options.currentValues ??
      new Map()) as ResolveAttributeCandidatesInput['currentValues'],
    context: CONTEXT,
  };
  return resolveAttributeCandidates(input)[0]!;
}

function candidatesFrom(
  attributes: NormalizedExtractionAttribute[],
  definitions: AttributeDefinitionRef[] = [definition()],
  currentValues?: Map<
    string,
    { attributeDefinitionId: string; display: string }
  >,
): AttributeCandidateDto[] {
  return resolveAttributeCandidates({
    extraction: extraction(attributes),
    definitions,
    currentValues: (currentValues ??
      new Map()) as ResolveAttributeCandidatesInput['currentValues'],
    context: CONTEXT,
  });
}

// ---------------------------------------------------------------------------
// Resolution and validation state
// ---------------------------------------------------------------------------

describe('attribute candidate resolution state', () => {
  it('resolves a matched, representable value as applicable and valid', () => {
    const candidate = resolve();

    expect(candidate.resolutionState).toBe('RESOLVED');
    expect(candidate.validationState).toBe('VALID');
    expect(candidate.validationReason).toBeNull();
    expect(candidate.applicable).toBe(true);
    expect(candidate.inapplicableReason).toBeNull();
    expect(candidate.validationDetail).toBeNull();
  });

  it('never treats a property with no attribute definition as applicable', () => {
    const candidate = resolve({
      code: 'thermal_resistance',
      value: 25,
      formatted: '25 °C/W',
    });

    expect(candidate.resolutionState).toBe('UNRESOLVED');
    expect(candidate.validationState).toBe('INVALID');
    expect(candidate.applicable).toBe(false);
    expect(candidate.inapplicableReason).toBe('ATTRIBUTE_NOT_FOUND');
    // No definition is created, so there is nothing to coerce against.
    expect(candidate.validationReason).toBeNull();
    expect(candidate.attributeDefinitionId).toBeNull();
  });

  it('refuses an inactive attribute definition instead of resurrecting it', () => {
    const candidate = resolve(
      {},
      {
        definitions: [definition({ isActive: false })],
      },
    );

    expect(candidate.resolutionState).toBe('RESOLVED');
    expect(candidate.applicable).toBe(false);
    expect(candidate.inapplicableReason).toBe('ATTRIBUTE_NOT_ACTIVE');
  });

  it('marks a genuinely ambiguous property for human review', () => {
    const candidate = resolve(
      {},
      {
        definitions: [
          definition(),
          definition({
            id: 'def-resistance-2',
            code: 'resistance',
            name: 'Resistance (legacy)',
          }),
        ],
      },
    );

    expect(candidate.resolutionState).toBe('AMBIGUOUS');
    expect(candidate.validationState).toBe('REQUIRES_REVIEW');
    // Ambiguity is a resolution problem, not a value problem: no coercion ran.
    expect(candidate.validationReason).toBeNull();
    expect(candidate.applicable).toBe(false);
    expect(candidate.inapplicableReason).toBe('AMBIGUOUS_ATTRIBUTE');
  });

  it('treats a differing recorded value as reviewable rather than invalid', () => {
    const candidate = resolve(
      {},
      {
        currentValues: new Map([
          [
            'def-resistance',
            { attributeDefinitionId: 'def-resistance', display: '300 ohm' },
          ],
        ]),
      },
    );

    expect(candidate.conflict).toBe(true);
    expect(candidate.validationState).toBe('REQUIRES_REVIEW');
    // A conflict is exactly the case a reviewer exists to decide.
    expect(candidate.applicable).toBe(true);
    expect(candidate.inapplicableReason).toBeNull();
  });

  it('does not raise a finding for a value the component already records', () => {
    const candidate = resolve(
      {},
      {
        currentValues: new Map([
          [
            'def-resistance',
            { attributeDefinitionId: 'def-resistance', display: '330 ohm' },
          ],
        ]),
      },
    );

    expect(candidate.conflict).toBe(false);
    expect(candidate.validationState).toBe('VALID');
    expect(candidate.applicable).toBe(false);
    expect(candidate.inapplicableReason).toBe('VALUE_ALREADY_CURRENT');
  });

  it('compares a recorded value on its display form, not its exact text', () => {
    // A value typed by hand and the same value extracted from a datasheet reach
    // the same display form, so the reviewer is not asked to resolve casing.
    const candidate = resolve(
      { code: 'manufacturer_name', value: 'Yageo', formatted: 'yageo' },
      {
        definitions: [
          definition({
            code: 'manufacturer_name',
            name: 'Manufacturer Name',
            dataType: 'TEXT',
            defaultUnit: null,
          }),
        ],
        currentValues: new Map([
          [
            'def-resistance',
            { attributeDefinitionId: 'def-resistance', display: '  Yageo ' },
          ],
        ]),
      },
    );

    expect(candidate.conflict).toBe(false);
    expect(candidate.inapplicableReason).toBe('VALUE_ALREADY_CURRENT');
  });
});

describe('attribute candidate validation reasons', () => {
  const cases: Array<{
    name: string;
    attribute: Partial<NormalizedExtractionAttribute>;
    def?: Partial<AttributeDefinitionRef>;
    reason: string;
  }> = [
    {
      name: 'a non-numeric quantity',
      attribute: { value: null, formatted: 'ten ohms' },
      reason: 'INVALID_QUANTITY',
    },
    {
      name: 'a quantity with no unit anywhere',
      attribute: { value: 330, unit: null, formatted: '330' },
      def: { defaultUnit: null },
      reason: 'UNIT_MISMATCH',
    },
    {
      name: 'a non-numeric number',
      attribute: { value: 'abc', formatted: 'abc' },
      def: { dataType: 'NUMBER', defaultUnit: null },
      reason: 'INVALID_NUMBER',
    },
    {
      name: 'a fractional integer',
      attribute: { value: 1.5, formatted: '1.5' },
      def: { dataType: 'INTEGER', defaultUnit: null },
      reason: 'INVALID_INTEGER',
    },
    {
      name: 'a non-boolean boolean',
      attribute: { value: 'yes', formatted: 'yes' },
      def: { dataType: 'BOOLEAN', defaultUnit: null },
      reason: 'INVALID_BOOLEAN',
    },
    {
      name: 'an unparseable date',
      attribute: { value: null, formatted: 'sometime' },
      def: { dataType: 'DATE', defaultUnit: null },
      reason: 'INVALID_DATE',
    },
    {
      name: 'an unknown select option',
      attribute: { value: null, formatted: '1206' },
      def: {
        dataType: 'SELECT',
        defaultUnit: null,
        options: [{ code: '0805', label: '0805' }],
      },
      reason: 'INVALID_SELECT_OPTION',
    },
    {
      name: 'an unsupported attribute type',
      attribute: {},
      def: { dataType: 'JSON', defaultUnit: null },
      reason: 'ATTRIBUTE_TYPE_MISMATCH',
    },
  ];

  for (const testCase of cases) {
    it(`reports ${testCase.reason} for ${testCase.name}`, () => {
      const candidate = resolve(testCase.attribute, {
        definitions: [definition(testCase.def)],
      });

      expect(candidate.validationState).toBe('INVALID');
      expect(candidate.validationReason).toBe(testCase.reason);
      expect(candidate.applicable).toBe(false);
      expect(candidate.inapplicableReason).toBe('INVALID_VALUE');
      // The refusal itself is shown to the reviewer, verbatim.
      expect(candidate.validationDetail).toBeTruthy();
    });
  }

  it('keeps every invalid value non-executable', () => {
    const candidates = candidatesFrom(
      [
        attribute({ value: null, formatted: 'ten ohms' }),
        attribute({ code: 'tolerance', value: 'abc', formatted: 'abc' }),
      ],
      [
        definition(),
        definition({
          id: 'def-tolerance',
          code: 'tolerance',
          name: 'Tolerance',
          dataType: 'NUMBER',
          defaultUnit: null,
        }),
      ],
    );

    expect(candidates.every((candidate) => candidate.applicable)).toBe(false);
    expect(
      candidates.every((candidate) => candidate.validationState === 'INVALID'),
    ).toBe(true);
  });

  it('accepts a select option matched by label', () => {
    const candidate = resolve(
      { code: 'package', value: '0805', formatted: '0805', unit: null },
      {
        definitions: [
          definition({
            id: 'def-package',
            code: 'package',
            name: 'Package',
            dataType: 'SELECT',
            defaultUnit: null,
            options: [{ code: '0805', label: '0805 (SMD)' }],
          }),
        ],
      },
    );

    expect(candidate.applicable).toBe(true);
    expect(candidate.optionCode).toBe('0805');
    expect(candidate.normalizedValue).toEqual({
      value: '0805',
      optionCode: '0805',
    });
  });
});

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

describe('attribute value findings', () => {
  const definitions: AttributeDefinitionRef[] = [
    definition(),
    definition({
      id: 'def-tolerance',
      code: 'tolerance',
      name: 'Tolerance',
      dataType: 'NUMBER',
      defaultUnit: null,
    }),
  ];

  it('names the field after the attribute code', () => {
    expect(attributeFindingField('resistance')).toBe('attributes.resistance');
  });

  it('states the suggested value with its unit', () => {
    // The extractor already rendered the unit symbolically, so it is not
    // appended again: the reviewer must not read "330Ω ohm".
    const [candidate] = candidatesFrom([attribute()], definitions);
    expect(suggestedAttributeDisplay(candidate!)).toBe('330Ω');

    const [unitless] = candidatesFrom(
      [attribute({ formatted: '330' })],
      definitions,
    );
    expect(suggestedAttributeDisplay(unitless!)).toBe('330 ohm');

    const [percent] = candidatesFrom(
      [attribute({ code: 'tolerance', value: 1, unit: '%', formatted: '1%' })],
      definitions,
    );
    expect(suggestedAttributeDisplay(percent!)).toBe('1%');

    const [noUnit] = candidatesFrom(
      [attribute({ value: 'Yageo', unit: null, formatted: 'Yageo' })],
      [definition({ dataType: 'TEXT', defaultUnit: null })],
    );
    expect(suggestedAttributeDisplay(noUnit!)).toBe('Yageo');
  });

  it('creates one finding per applicable candidate', () => {
    const candidates = candidatesFrom(
      [
        attribute(),
        attribute({ code: 'tolerance', value: 1, unit: '%', formatted: '1%' }),
      ],
      definitions,
    );

    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates,
      document: DOCUMENT,
    });

    expect(plan.findings).toHaveLength(2);
    expect(plan.findings.map((finding) => finding.field).sort()).toEqual([
      'attributes.resistance',
      'attributes.tolerance',
    ]);
    expect(
      plan.findings.every((f) => f.issueType === ATTRIBUTE_VALUE_ISSUE_TYPE),
    ).toBe(true);
    expect(
      plan.findings.every(
        (f) => f.issueCategory === ATTRIBUTE_VALUE_ISSUE_CATEGORY,
      ),
    ).toBe(true);
    expect(
      plan.findings.every((f) => f.source === DOCUMENT_ATTRIBUTE_SOURCE),
    ).toBe(true);
  });

  it('never creates a finding for a candidate that is not applicable', () => {
    const candidates = candidatesFrom(
      [
        attribute(),
        // Already recorded by the component.
        attribute({ code: 'tolerance', value: 1, unit: '%', formatted: '1%' }),
        // No attribute definition exists.
        attribute({ code: 'thermal_resistance', formatted: '25 °C/W' }),
        // Invalid value for the definition it matched.
        attribute({ code: 'package', formatted: 'not-a-package' }),
      ],
      definitions,
      new Map([
        [
          'def-tolerance',
          { attributeDefinitionId: 'def-tolerance', display: '1' },
        ],
      ]),
    );

    expect(candidates.map((c) => c.applicable)).toEqual([
      true,
      false,
      false,
      false,
    ]);

    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates,
      document: DOCUMENT,
    });

    expect(plan.findings).toHaveLength(1);
    expect(plan.findings[0]!.field).toBe('attributes.resistance');
    expect(plan.fingerprintByAttributeDefinitionId.size).toBe(1);
  });

  it('records the current value, or null when the component records nothing', () => {
    const [candidate] = candidatesFrom([attribute()], definitions);
    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates: [candidate!],
      document: DOCUMENT,
    });

    expect(plan.findings[0]!.currentValue).toEqual({
      attributeDefinitionId: 'def-resistance',
      attributeCode: 'resistance',
      value: null,
    });
    expect(plan.findings[0]!.title).toContain('specified in the datasheet');
  });

  it('describes a conflict using the value the component records', () => {
    const candidates = candidatesFrom(
      [attribute()],
      definitions,
      new Map([
        [
          'def-resistance',
          { attributeDefinitionId: 'def-resistance', display: '300 ohm' },
        ],
      ]),
    );

    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates,
      document: DOCUMENT,
    });

    expect(plan.findings[0]!.currentValue).toEqual({
      attributeDefinitionId: 'def-resistance',
      attributeCode: 'resistance',
      value: '300 ohm',
    });
    expect(plan.findings[0]!.title).toContain('differs from the datasheet');
    expect(plan.findings[0]!.description).toContain('"300 ohm"');
    expect(plan.findings[0]!.description).toContain(
      'MC0805S8F3000T5E datasheet',
    );
  });

  it('stores the endpoint-shaped value the attribute use case expects', () => {
    const [candidate] = candidatesFrom([attribute()], definitions);
    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates: [candidate!],
      document: DOCUMENT,
    });

    const suggested = plan.findings[0]!.suggestedValue!;
    expect(suggested.value).toEqual({ value: 330, unit: 'ohm' });
    expect(suggested.attributeDefinitionId).toBe('def-resistance');
    expect(suggested.attributeCode).toBe('resistance');
    expect(suggested.dataType).toBe('QUANTITY');
    expect(suggested.display).toBe('330Ω');
    expect(suggested.rawValue).toBe(330);
    expect(suggested.document).toEqual({
      documentId: 'doc-1',
      documentVersion: 2,
      documentFileName: 'MC0805S8F3000T5E.pdf',
      documentContentHash: 'a'.repeat(64),
      extractionSource: DOCUMENT_ATTRIBUTE_SOURCE,
    });
  });

  it('carries the extraction facts a reviewer needs to judge it', () => {
    const [candidate] = candidatesFrom([attribute()], definitions);
    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates: [candidate!],
      document: DOCUMENT,
    });

    const finding = plan.findings[0]!;
    expect(finding.confidence).toBe(0.95);
    expect(finding.confidenceLevel).toBe('HIGH');
    expect(finding.evidence).toHaveLength(1);
    expect(finding.evidence![0]!.page).toBe(3);
    expect(finding.intelligenceVersion).toBe(DATASHEET_INTELLIGENCE_VERSION);
  });

  it('marks findings actionable and names the attribute in metadata', () => {
    const [candidate] = candidatesFrom([attribute()], definitions);
    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates: [candidate!],
      document: DOCUMENT,
    });

    const metadata = plan.findings[0]!.metadata!;
    expect(metadata.actionable).toBe(true);
    expect(metadata.origin).toBe('DATASHEET');
    // The field is stored in metadata, which is where the queue reads it from.
    expect(metadata.field).toBe('attributes.resistance');
    expect(metadata.attributeDefinitionId).toBe('def-resistance');
    expect(metadata.attributeCode).toBe('resistance');
    expect(metadata.dataType).toBe('QUANTITY');
    expect(metadata.validationState).toBe('VALID');
    expect(metadata.resolutionState).toBe('RESOLVED');
    expect(metadata.conflict).toBe(false);
  });

  it('skips a candidate with no attribute identity even if it claims to be applicable', () => {
    // Defensive: a finding without an attribute identity could never be applied,
    // so it must not enter the queue at all.
    const orphan = {
      ...candidatesFrom([attribute()], definitions)[0]!,
      attributeDefinitionId: null,
      attributeCode: null,
    };

    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates: [orphan],
      document: DOCUMENT,
    });

    expect(plan.findings).toHaveLength(0);
  });

  it('produces no findings and no fingerprints for an empty analysis', () => {
    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates: [],
      document: DOCUMENT,
    });

    expect(plan.findings).toEqual([]);
    expect(plan.fingerprintByAttributeDefinitionId.size).toBe(0);
  });
});

describe('attribute value finding fingerprints', () => {
  const definitions: AttributeDefinitionRef[] = [definition()];

  /**
   * The fingerprint is the identity the queue will persist under, so it is read
   * from the plan's map — the same key the analysis uses to attach review state
   * back to a candidate row.
   */
  function fingerprintFor(input: {
    componentId?: string;
    attribute?: Partial<NormalizedExtractionAttribute>;
    document?: typeof DOCUMENT;
    currentDisplay?: string;
  }): string {
    const currentValues = input.currentDisplay
      ? new Map([
          [
            'def-resistance',
            {
              attributeDefinitionId: 'def-resistance',
              display: input.currentDisplay,
            },
          ],
        ])
      : undefined;
    const [candidate] = candidatesFrom(
      [attribute(input.attribute)],
      definitions,
      currentValues,
    );
    const plan = buildDocumentAttributeFindings({
      component: { ...COMPONENT, id: input.componentId ?? COMPONENT.id },
      candidates: [candidate!],
      document: input.document ?? DOCUMENT,
    });
    const fingerprint = plan.fingerprintByAttributeDefinitionId.get(
      candidate!.attributeDefinitionId!,
    );
    expect(fingerprint).toBeTruthy();
    return fingerprint!;
  }

  it('reproduces the existing queue fingerprint function exactly', () => {
    const [candidate] = candidatesFrom([attribute()], definitions);
    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates: [candidate!],
      document: DOCUMENT,
    });

    // No second fingerprint implementation: the finding is identifiable by the
    // queue's own function over the persisted payload.
    const expected = buildFindingFingerprint({
      componentId: COMPONENT.id,
      issueType: ATTRIBUTE_VALUE_ISSUE_TYPE,
      field: 'attributes.resistance',
      currentValue: plan.findings[0]!.currentValue,
      suggestedValue: plan.findings[0]!.suggestedValue,
      intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
    });

    expect(plan.fingerprintByAttributeDefinitionId.get('def-resistance')).toBe(
      expected,
    );
  });

  it('is deterministic for identical bytes and unchanged component state', () => {
    expect(fingerprintFor({})).toBe(fingerprintFor({}));
  });

  it('changes when the document revision changes', () => {
    const revised = { ...DOCUMENT, documentVersion: 3 };
    const rehashed = { ...DOCUMENT, contentHash: 'b'.repeat(64) };

    expect(fingerprintFor({ document: revised })).not.toBe(fingerprintFor({}));
    expect(fingerprintFor({ document: rehashed })).not.toBe(fingerprintFor({}));
  });

  it('changes when the recorded attribute value changes', () => {
    // This is what makes a stale suggestion produce a NEW finding rather than
    // silently overwriting a reviewer decision made against the old value.
    expect(fingerprintFor({ currentDisplay: '300 ohm' })).not.toBe(
      fingerprintFor({ currentDisplay: '470 ohm' }),
    );
    expect(fingerprintFor({ currentDisplay: '300 ohm' })).not.toBe(
      fingerprintFor({}),
    );
  });

  it('changes when the suggested value changes', () => {
    expect(
      fingerprintFor({ attribute: { value: 470, formatted: '470Ω' } }),
    ).not.toBe(fingerprintFor({}));
  });

  it('changes per component', () => {
    expect(fingerprintFor({ componentId: 'comp-2' })).not.toBe(
      fingerprintFor({}),
    );
  });

  it('is keyed by attribute definition so a finding maps back to its row', () => {
    const [candidate] = candidatesFrom([attribute()], definitions);
    const plan = buildDocumentAttributeFindings({
      component: COMPONENT,
      candidates: [candidate!],
      document: DOCUMENT,
    });

    expect(plan.fingerprintByAttributeDefinitionId.get('def-resistance')).toBe(
      plan.fingerprintByAttributeDefinitionId.get(
        candidate!.attributeDefinitionId!,
      ),
    );
    expect(plan.findings).toHaveLength(
      plan.fingerprintByAttributeDefinitionId.size,
    );
  });
});

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

describe('attribute value provenance', () => {
  const base = {
    findingId: 'finding-1',
    document: {
      documentId: 'doc-1',
      documentVersion: 2,
      contentHash: 'a'.repeat(64),
    },
  };

  it('records the document revision, the finding, and the reviewer', () => {
    const provenance = buildAttributeValueProvenance({
      ...base,
      evidence: [
        {
          page: 3,
          text: '... resistance 330 ohm ±1% ...',
          extractionMethod: 'extractor:ee_regex',
        },
      ],
      reviewer: { id: 'user-1', email: 'reviewer@example.com' },
      appliedAt: new Date('2024-05-01T10:00:00.000Z'),
    });

    expect(provenance).toEqual({
      source: DOCUMENT_ATTRIBUTE_SOURCE,
      documentId: 'doc-1',
      documentVersion: 2,
      contentHash: 'a'.repeat(64),
      page: 3,
      evidenceExcerpt: '... resistance 330 ohm ±1% ...',
      extractionMethod: 'extractor:ee_regex',
      intelligenceVersion: DATASHEET_INTELLIGENCE_VERSION,
      findingId: 'finding-1',
      reviewerId: 'user-1',
      reviewerEmail: 'reviewer@example.com',
      appliedAt: '2024-05-01T10:00:00.000Z',
    });
  });

  it('prefers the evidence item that actually located the value', () => {
    const provenance = buildAttributeValueProvenance({
      ...base,
      evidence: [
        // An earlier item quotes text but never located it in the document.
        { page: null, text: 'resistance 330', extractionMethod: 'extractor:a' },
        { page: 7, text: 'R = 330 Ω', extractionMethod: 'extractor:b' },
      ],
    });

    expect(provenance.page).toBe(7);
    expect(provenance.evidenceExcerpt).toBe('R = 330 Ω');
    expect(provenance.extractionMethod).toBe('extractor:b');
  });

  it('falls back to a quoted excerpt when nothing located the value', () => {
    const provenance = buildAttributeValueProvenance({
      ...base,
      evidence: [
        { page: null, text: '', extractionMethod: 'extractor:a' },
        { page: null, text: 'resistance 330', extractionMethod: 'extractor:b' },
      ],
    });

    // The page stays null rather than borrowing the first item's page, which
    // would point a reviewer at the wrong place.
    expect(provenance.page).toBeNull();
    expect(provenance.evidenceExcerpt).toBe('resistance 330');
    expect(provenance.extractionMethod).toBe('extractor:b');
  });

  it('records honest nulls when there is no evidence at all', () => {
    const provenance = buildAttributeValueProvenance({ ...base, evidence: [] });

    expect(provenance.page).toBeNull();
    expect(provenance.evidenceExcerpt).toBeNull();
    expect(provenance.extractionMethod).toBeUndefined();
    expect(provenance.reviewerId).toBeNull();
    expect(provenance.reviewerEmail).toBeNull();
  });

  it('treats whitespace-only evidence text as no excerpt', () => {
    const provenance = buildAttributeValueProvenance({
      ...base,
      evidence: [{ page: 1, text: '   ', extractionMethod: 'extractor:a' }],
    });

    expect(provenance.page).toBe(1);
    expect(provenance.evidenceExcerpt).toBeNull();
  });

  it('stamps an application time even when the caller does not', () => {
    const provenance = buildAttributeValueProvenance({
      ...base,
      evidence: [],
    });

    expect(typeof provenance.appliedAt).toBe('string');
    expect(Number.isNaN(Date.parse(provenance.appliedAt!))).toBe(false);
  });

  it('reads stored provenance defensively', () => {
    expect(readAttributeProvenance(null)).toBeNull();
    expect(readAttributeProvenance(undefined)).toBeNull();
    const stored = { source: DOCUMENT_ATTRIBUTE_SOURCE };
    expect(readAttributeProvenance(stored)).toBe(stored);
  });
});
