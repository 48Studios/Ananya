import {
  buildDocumentEvidence,
  buildDocumentFindingFingerprints,
  buildDocumentIdentity,
  buildDocumentIdentityFindings,
  coerceAttributeValue,
  collectAnalysisEvidence,
  evaluateAnalysisEligibility,
  matchExtractedAttributeDefinition,
  normalizeExtraction,
  resolveAttributeCandidates,
  selectManufacturerPartNumberCandidate,
  summarizeDocumentAnalysis,
  type AttributeDefinitionRef,
  type CurrentAttributeValue,
  type NormalizedExtraction,
  type NormalizedExtractionAttribute,
} from './documentation-intelligence';
import {
  DATASHEET_INTELLIGENCE_VERSION,
  DOCUMENT_ANALYSIS_SOURCE,
  MAX_ANALYZABLE_DOCUMENT_BYTES,
  type DocumentEvidenceDto,
  type DocumentIdentityDto,
} from './documentation-intelligence.dtos';
import { buildFindingFingerprint } from './component-review-queue.service';
import type { ComponentSuggestionResponseDto } from './dtos';

/**
 * Pass 2 unit coverage for Documentation Intelligence.
 *
 * The subject is a pure mapping layer, so these tests assert the two absolute
 * rules directly: nothing mutates component data, and nothing is invented. Every
 * case that could produce a wrong suggestion is covered explicitly.
 */

const CONTEXT = {
  documentId: 'doc-1',
  documentVersion: 2,
  documentFileName: 'MC0805S8F3000T5E.pdf',
  contentHash: 'a'.repeat(64),
};

function attribute(
  overrides: Partial<NormalizedExtractionAttribute> = {},
): NormalizedExtractionAttribute {
  return {
    code: 'resistance',
    value: 300,
    unit: 'ohm',
    // No source quantity unless a test states one: the canonical pair is then
    // the only representation, which is what the extractor's own contract says.
    sourceValue: null,
    sourceUnit: null,
    formatted: '300Ω',
    confidence: 0.95,
    confidenceLevel: 'HIGH',
    evidence: [
      {
        type: 'datasheet_param',
        description: 'Extracted resistance rating 300Ω',
        weight: 0.95,
        source: 'extractor:ee_regex',
        page: 3,
        text: '... resistance 300 ohm ±1% ...',
        section: 'ELECTRICAL_CHARACTERISTICS',
      },
    ],
    ...overrides,
  };
}

function extraction(
  attributes: NormalizedExtractionAttribute[],
  overrides: Partial<NormalizedExtraction> = {},
): NormalizedExtraction {
  return {
    attributes,
    extractedText: 'MC0805S8F3000T5E 300 Ohm 1% 0805',
    extractedTextPreview: 'MC0805S8F3000T5E 300 Ohm…',
    pageCount: 4,
    pagesAnalyzed: 4,
    extractorVersion: 'datasheet-extract-v1',
    ...overrides,
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

const RGB_DEFINITION = definition({
  id: 'def-package',
  code: 'package',
  name: 'Package',
  dataType: 'SELECT',
  unitCategory: null,
  defaultUnit: null,
  options: [
    { code: '0805', label: '0805' },
    { code: '0603', label: '0603' },
  ],
});

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

describe('datasheet analysis eligibility', () => {
  const eligible = {
    sourceType: 'UPLOADED_FILE',
    documentType: 'DATASHEET',
    mimeType: 'application/pdf',
    fileName: 'part.pdf',
    sizeBytes: 1024,
    storageKey: 'part.pdf',
    storageObjectExists: true,
  };

  it('accepts an uploaded PDF datasheet whose file exists', () => {
    expect(evaluateAnalysisEligibility(eligible)).toEqual({ available: true });
  });

  it('refuses external references without crawling them', () => {
    const result = evaluateAnalysisEligibility({
      ...eligible,
      sourceType: 'EXTERNAL_URL',
      mimeType: null,
      storageKey: null,
    });
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toBe('EXTERNAL_REFERENCE');
    expect(result.message).toMatch(/upload/i);
  });

  it('refuses non-datasheet document types', () => {
    const result = evaluateAnalysisEligibility({
      ...eligible,
      documentType: 'CAD_DRAWING',
    });
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toBe('NOT_A_DATASHEET');
  });

  it('refuses images and CAD files', () => {
    for (const [mimeType, fileName, reason] of [
      ['image/png', 'photo.png', 'NOT_A_PDF'],
      ['model/step', 'bracket.step', 'NOT_A_PDF'],
      ['image/vnd.dwg', 'drawing.dwg', 'NOT_A_PDF'],
    ] as const) {
      const result = evaluateAnalysisEligibility({
        ...eligible,
        mimeType,
        fileName,
      });
      expect(result.available).toBe(false);
      if (result.available) continue;
      expect(result.reason).toBe(reason);
    }
  });

  it('does not trust a mislabelled MIME type', () => {
    // Claims PDF, is actually a STEP file: the extension decides.
    const result = evaluateAnalysisEligibility({
      ...eligible,
      mimeType: 'application/pdf',
      fileName: 'bracket.step',
    });
    expect(result.available).toBe(false);
  });

  it('accepts a PDF whose MIME type is missing', () => {
    expect(
      evaluateAnalysisEligibility({
        ...eligible,
        mimeType: null,
        fileName: 'datasheet.pdf',
      }),
    ).toEqual({ available: true });
  });

  it('refuses a document whose stored file is gone', () => {
    const result = evaluateAnalysisEligibility({
      ...eligible,
      storageObjectExists: false,
    });
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toBe('MISSING_STORAGE_OBJECT');
  });

  it('refuses an oversized document with the documented wording', () => {
    const result = evaluateAnalysisEligibility({
      ...eligible,
      sizeBytes: MAX_ANALYZABLE_DOCUMENT_BYTES + 1,
    });
    expect(result.available).toBe(false);
    if (result.available) return;
    expect(result.reason).toBe('TOO_LARGE');
    expect(result.message).toBe(
      'Document is too large for datasheet analysis.',
    );
  });

  it('accepts a document exactly at the limit', () => {
    expect(
      evaluateAnalysisEligibility({
        ...eligible,
        sizeBytes: MAX_ANALYZABLE_DOCUMENT_BYTES,
      }),
    ).toEqual({ available: true });
  });
});

// ---------------------------------------------------------------------------
// Extraction normalization
// ---------------------------------------------------------------------------

describe('extraction normalization', () => {
  it('normalizes the ML payload and keeps evidence locations', () => {
    const normalized = normalizeExtraction({
      attributes: {
        resistance: {
          code: 'resistance',
          value: 300,
          unit: 'ohm',
          formatted: '300Ω',
          confidence: 0.95,
          confidence_level: 'HIGH',
          evidence: [
            {
              type: 'datasheet_param',
              description: 'Extracted resistance rating 300Ω',
              weight: 0.95,
              source: 'extractor:ee_regex',
              page: 3,
              text: '... 300 ohm ...',
            },
          ],
        },
      },
      extracted_text: 'text',
      extracted_text_preview: 'preview',
      page_count: 4,
      pages_analyzed: 3,
      extractor_version: 'datasheet-extract-v1',
    });

    expect(normalized.pageCount).toBe(4);
    expect(normalized.pagesAnalyzed).toBe(3);
    expect(normalized.extractorVersion).toBe('datasheet-extract-v1');
    expect(normalized.attributes).toHaveLength(1);
    expect(normalized.attributes[0]!.evidence[0]!.page).toBe(3);
  });

  it('never invents a page or an excerpt the extractor did not provide', () => {
    const normalized = normalizeExtraction({
      attributes: {
        resistance: {
          code: 'resistance',
          value: 300,
          formatted: '300Ω',
          confidence: 0.9,
          evidence: [{ type: 'datasheet_param', description: 'no location' }],
        },
      } as never,
    });

    const evidence = normalized.attributes[0]!.evidence[0]!;
    expect(evidence.page).toBeNull();
    expect(evidence.text).toBeNull();
  });

  it('rejects a non-integer page rather than rounding it', () => {
    const normalized = normalizeExtraction({
      attributes: {
        resistance: {
          code: 'resistance',
          value: 1,
          formatted: '1',
          confidence: 1,
          evidence: [
            { type: 'datasheet_param', description: 'x', page: 2.5, weight: 1 },
          ],
        },
      },
    });

    expect(normalized.attributes[0]!.evidence[0]!.page).toBeNull();
  });

  it('orders attributes deterministically for identical documents', () => {
    const first = normalizeExtraction({
      attributes: {
        voltage: {
          code: 'voltage',
          value: 50,
          formatted: '50V',
          confidence: 1,
        },
        resistance: {
          code: 'resistance',
          value: 1,
          formatted: '1',
          confidence: 1,
        },
      },
    });
    const second = normalizeExtraction({
      attributes: {
        resistance: {
          code: 'resistance',
          value: 1,
          formatted: '1',
          confidence: 1,
        },
        voltage: {
          code: 'voltage',
          value: 50,
          formatted: '50V',
          confidence: 1,
        },
      },
    });

    expect(first.attributes.map((a) => a.code)).toEqual([
      'resistance',
      'voltage',
    ]);
    expect(first).toEqual(second);
  });

  it('drops malformed entries instead of inventing values', () => {
    const normalized = normalizeExtraction({
      attributes: {
        broken: null as never,
        good: {
          code: 'package',
          value: '0805',
          formatted: '0805',
          confidence: 1,
        },
      },
    });

    expect(normalized.attributes).toHaveLength(1);
    expect(normalized.attributes[0]!.code).toBe('package');
    expect(normalized.attributes[0]!.confidenceLevel).toBe('MEDIUM');
  });

  it('defaults a missing optional field without failing', () => {
    const normalized = normalizeExtraction({ attributes: {} });
    expect(normalized.attributes).toEqual([]);
    expect(normalized.extractedText).toBeNull();
    expect(normalized.pageCount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

describe('document evidence', () => {
  it('ties every item to the exact document revision', () => {
    const evidence = buildDocumentEvidence(attribute().evidence, CONTEXT);

    expect(evidence).toHaveLength(1);
    const item = evidence[0]!;
    expect(item.documentId).toBe('doc-1');
    expect(item.documentVersion).toBe(2);
    expect(item.documentContentHash).toBe('a'.repeat(64));
    expect(item.documentFileName).toBe('MC0805S8F3000T5E.pdf');
    expect(item.page).toBe(3);
    expect(item.text).toContain('300 ohm');
    expect(item.extractionMethod).toBe('extractor:ee_regex');
    // Existing EvidenceItemDto conventions are preserved.
    expect(item.type).toBe('datasheet_param');
    expect(typeof item.weight).toBe('number');
  });

  it('collects evidence from candidates and identity without duplication', () => {
    const candidates = resolveAttributeCandidates({
      extraction: extraction([attribute()]),
      definitions: [definition()],
      currentValues: new Map(),
      context: CONTEXT,
    });
    const identity = buildDocumentIdentity({
      suggestion: null,
      manufacturerPartNumber: null,
      manufacturerPartNumberSource: null,
      context: CONTEXT,
      pageCount: 4,
    });

    const evidence = collectAnalysisEvidence(candidates, identity);
    expect(evidence.length).toBe(candidates[0]!.evidence.length + 1);
  });
});

// ---------------------------------------------------------------------------
// Attribute mapping
// ---------------------------------------------------------------------------

describe('attribute definition resolution', () => {
  const definitions = [
    definition(),
    RGB_DEFINITION,
    definition({
      id: 'def-voltage',
      code: 'voltage_rating',
      name: 'Voltage Rating',
      dataType: 'QUANTITY',
      defaultUnit: 'V',
      aliases: ['working voltage'],
    }),
  ];

  it('matches an exact definition code', () => {
    expect(
      matchExtractedAttributeDefinition('resistance', definitions)?.id,
    ).toBe('def-resistance');
  });

  it('matches through the canonical alias vocabulary', () => {
    // `voltage` is the extractor's code; the ERP definition is `voltage_rating`.
    expect(matchExtractedAttributeDefinition('voltage', definitions)?.id).toBe(
      'def-voltage',
    );
  });

  it('matches a declared alias', () => {
    expect(
      matchExtractedAttributeDefinition('working voltage', definitions)?.id,
    ).toBe('def-voltage');
  });

  it('tolerates datasheet wording suffixes and prefixes', () => {
    expect(
      matchExtractedAttributeDefinition('resistance_value', definitions)?.id,
    ).toBe('def-resistance');
    expect(
      matchExtractedAttributeDefinition('rated_voltage', definitions)?.id,
    ).toBe('def-voltage');
  });

  it('returns null when no definition exists, never inventing one', () => {
    expect(
      matchExtractedAttributeDefinition('thermal_resistance', definitions),
    ).toBeNull();
    expect(matchExtractedAttributeDefinition('', definitions)).toBeNull();
  });
});

describe('attribute value coercion', () => {
  it('coerces a QUANTITY with its unit', () => {
    const result = coerceAttributeValue(definition(), attribute());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ value: 300, unit: 'ohm' });
    expect(result.display).toBe('300 ohm');
  });

  it('refuses a quantity the extraction stated without a unit, never assuming the definition\u2019s own', () => {
    // Deliberate: this used to coerce `300` under the definition's `ohm`, which
    // re-labels the number. A quantity is a value and a unit, so an extraction
    // that states no unit cannot be recorded as if it had stated the
    // attribute's.
    const result = coerceAttributeValue(
      definition(),
      attribute({ unit: null, value: 300 }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('UNIT_MISMATCH');
    expect(result.detail).toMatch(/no unit/i);
  });

  it('refuses a quantity with no unit and no definition unit either', () => {
    const result = coerceAttributeValue(
      definition({ defaultUnit: null }),
      attribute({ unit: null }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toMatch(/unit/i);
  });

  it('coerces NUMBER and INTEGER, refusing a non-numeric value', () => {
    const number = coerceAttributeValue(
      definition({ dataType: 'NUMBER' }),
      attribute({ value: 12.5, formatted: '12.5' }),
    );
    expect(number.ok).toBe(true);
    if (number.ok) expect(number.value).toEqual({ value: 12.5 });

    const text = coerceAttributeValue(
      definition({ dataType: 'NUMBER' }),
      attribute({ value: null, formatted: 'not a number' }),
    );
    expect(text.ok).toBe(false);

    const fractional = coerceAttributeValue(
      definition({ dataType: 'INTEGER' }),
      attribute({ value: 1.5 }),
    );
    expect(fractional.ok).toBe(false);
  });

  it('coerces TEXT and BOOLEAN', () => {
    const text = coerceAttributeValue(
      definition({ dataType: 'TEXT' }),
      attribute({ value: 'X7R', formatted: 'X7R', unit: null }),
    );
    expect(text.ok).toBe(true);
    if (text.ok) expect(text.value).toEqual({ value: 'X7R' });

    const boolean = coerceAttributeValue(
      definition({ dataType: 'BOOLEAN' }),
      attribute({ value: true, formatted: 'yes' }),
    );
    expect(boolean.ok).toBe(true);

    const invalidBoolean = coerceAttributeValue(
      definition({ dataType: 'BOOLEAN' }),
      attribute({ value: 'maybe', formatted: 'maybe' }),
    );
    expect(invalidBoolean.ok).toBe(false);
  });

  it('coerces SELECT only against existing options', () => {
    const matched = coerceAttributeValue(
      RGB_DEFINITION,
      attribute({
        code: 'package',
        value: '0805',
        formatted: '0805',
        unit: null,
      }),
    );
    expect(matched.ok).toBe(true);
    if (!matched.ok) return;
    expect(matched.value.value).toBe('0805');

    const unmatched = coerceAttributeValue(
      RGB_DEFINITION,
      attribute({
        code: 'package',
        value: '1206',
        formatted: '1206',
        unit: null,
      }),
    );
    expect(unmatched.ok).toBe(false);
    if (unmatched.ok) return;
    expect(unmatched.detail).toMatch(/options/i);
  });

  it('coerces a DATE only when it parses', () => {
    const valid = coerceAttributeValue(
      definition({ dataType: 'DATE' }),
      attribute({ value: '2026-01-15', formatted: '2026-01-15' }),
    );
    expect(valid.ok).toBe(true);

    const invalid = coerceAttributeValue(
      definition({ dataType: 'DATE' }),
      attribute({ value: 'soon', formatted: 'soon' }),
    );
    expect(invalid.ok).toBe(false);
  });

  it('refuses an unsupported data type instead of writing free text', () => {
    const result = coerceAttributeValue(
      definition({ dataType: 'MULTI_SELECT_WIDGET' }),
      attribute(),
    );
    expect(result.ok).toBe(false);
  });
});

describe('attribute candidates', () => {
  const definitions = [
    definition(),
    definition({
      id: 'def-tolerance',
      code: 'tolerance',
      name: 'Tolerance',
      dataType: 'NUMBER',
      defaultUnit: null,
    }),
  ];

  it('marks a matched candidate as applicable and carries document evidence', () => {
    const [candidate] = resolveAttributeCandidates({
      extraction: extraction([attribute()]),
      definitions,
      currentValues: new Map(),
      context: CONTEXT,
    });

    expect(candidate!.resolution).toBe('DEFINITION_MATCHED');
    expect(candidate!.attributeDefinitionId).toBe('def-resistance');
    expect(candidate!.normalizedValue).toEqual({ value: 300, unit: 'ohm' });
    expect(candidate!.conflict).toBe(false);
    expect(candidate!.evidence[0]!.page).toBe(3);
  });

  it('reports a property with no definition instead of creating one', () => {
    const [candidate] = resolveAttributeCandidates({
      extraction: extraction([
        attribute({ code: 'thermal_resistance', formatted: '25 °C/W' }),
      ]),
      definitions,
      currentValues: new Map(),
      context: CONTEXT,
    });

    expect(candidate!.resolution).toBe('NO_DEFINITION');
    expect(candidate!.resolutionDetail).toContain(
      'Attribute definition not found',
    );
    expect(candidate!.attributeDefinitionId).toBeNull();
    expect(candidate!.normalizedValue).toBeNull();
    // The raw extraction survives as evidence for a future workflow.
    expect(candidate!.formatted).toBe('25 °C/W');
    expect(candidate!.evidence).toHaveLength(1);
  });

  it('keeps an extracted value that cannot be represented as unresolved', () => {
    const [candidate] = resolveAttributeCandidates({
      extraction: extraction([
        attribute({
          code: 'tolerance',
          value: null,
          unit: '%',
          formatted: '±1% (see notes)',
        }),
      ]),
      definitions,
      currentValues: new Map(),
      context: CONTEXT,
    });

    expect(candidate!.resolution).toBe('UNRESOLVED_VALUE');
    expect(candidate!.attributeDefinitionId).toBe('def-tolerance');
    expect(candidate!.resolutionDetail).toContain('Expected a number');
    expect(candidate!.formatted).toBe('±1% (see notes)');
  });

  it('detects a conflict with the value the component already records', () => {
    const currentValues = new Map<string, CurrentAttributeValue>([
      [
        'def-resistance',
        { attributeDefinitionId: 'def-resistance', display: '10000' },
      ],
    ]);

    const [candidate] = resolveAttributeCandidates({
      extraction: extraction([attribute()]),
      definitions,
      currentValues,
      context: CONTEXT,
    });

    expect(candidate!.conflict).toBe(true);
    expect(candidate!.currentValue).toBe('10000');
  });

  it('does not report a conflict when the values agree after formatting', () => {
    const currentValues = new Map<string, CurrentAttributeValue>([
      [
        'def-resistance',
        { attributeDefinitionId: 'def-resistance', display: '300 ohm' },
      ],
    ]);

    const [candidate] = resolveAttributeCandidates({
      extraction: extraction([attribute()]),
      definitions,
      currentValues,
      context: CONTEXT,
    });

    expect(candidate!.conflict).toBe(false);
    expect(candidate!.currentValue).toBe('300 ohm');
  });

  it('produces one candidate per extracted property', () => {
    const candidates = resolveAttributeCandidates({
      extraction: extraction([
        attribute(),
        attribute({
          code: 'package',
          value: '0805',
          formatted: '0805',
          unit: null,
        }),
        attribute({ code: 'mystery_property', formatted: '?' }),
      ]),
      definitions: [...definitions, RGB_DEFINITION],
      currentValues: new Map(),
      context: CONTEXT,
    });

    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.resolution).sort()).toEqual([
      'DEFINITION_MATCHED',
      'DEFINITION_MATCHED',
      'NO_DEFINITION',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function suggestion(
  overrides: Partial<ComponentSuggestionResponseDto> = {},
): ComponentSuggestionResponseDto {
  return {
    query: 'MC0805S8F3000T5E',
    manufacturerPartNumber: 'MC0805S8F3000T5E',
    manufacturer: {
      resolution: 'EXISTING',
      manufacturerId: 'mfg-yageo',
      manufacturerCode: 'YAGEO',
      manufacturerName: 'Yageo',
      confidence: 0.94,
      confidenceLevel: 'HIGH',
      matchType: 'datasheet_mention',
      evidence: [
        {
          type: 'keyword',
          description: 'Manufacturer "Yageo" found in datasheet text',
          weight: 0.94,
          source: 'resolver:datasheet_keyword',
        },
      ],
    },
    category: null,
    alternativeCategories: [],
    isDuplicate: false,
    duplicateWarnings: [],
    attributes: {},
    attributeSuggestions: [],
    confidenceLevel: 'HIGH',
    isMlActive: true,
    executionTimeMs: 12,
    ...overrides,
  };
}

describe('document identity', () => {
  it('carries the existing intelligence resolution and its evidence', () => {
    const identity = buildDocumentIdentity({
      suggestion: suggestion(),
      manufacturerPartNumber: 'MC0805S8F3000T5E',
      manufacturerPartNumberSource: 'COMPONENT_INTELLIGENCE',
      context: CONTEXT,
      pageCount: 4,
    });

    expect(identity.manufacturerName).toBe('Yageo');
    expect(identity.manufacturerId).toBe('mfg-yageo');
    expect(identity.manufacturerMatchType).toBe('datasheet_mention');
    expect(identity.manufacturerPartNumber).toBe('MC0805S8F3000T5E');
    expect(identity.manufacturerPartNumberSource).toBe(
      'COMPONENT_INTELLIGENCE',
    );
    expect(identity.evidence[0]!.documentVersion).toBe(2);
    expect(identity.evidence[0]!.documentContentHash).toBe('a'.repeat(64));
  });

  it('records no identity when intelligence resolved nothing', () => {
    const identity = buildDocumentIdentity({
      suggestion: null,
      manufacturerPartNumber: null,
      manufacturerPartNumberSource: null,
      context: CONTEXT,
      pageCount: null,
    });

    expect(identity.manufacturerName).toBeNull();
    expect(identity.manufacturerId).toBeNull();
    expect(identity.manufacturerPartNumber).toBeNull();
    // Even with nothing resolved, the document is cited as the source.
    expect(identity.evidence).toHaveLength(1);
    expect(identity.evidence[0]!.documentId).toBe('doc-1');
  });

  it('picks the first trustworthy MPN candidate and reports its source', () => {
    expect(
      selectManufacturerPartNumberCandidate([
        { value: null, source: 'DOCUMENT_FILE_NAME' },
        { value: '  MC0805S8F3000T5E ', source: 'DOCUMENT_TEXT' },
      ]),
    ).toEqual({ value: 'MC0805S8F3000T5E', source: 'DOCUMENT_TEXT' });

    // Too short to be a part number: ignored rather than suggested.
    expect(
      selectManufacturerPartNumberCandidate([
        { value: 'R1', source: 'DOCUMENT_TEXT' },
      ]),
    ).toEqual({ value: null, source: null });
  });
});

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const COMPONENT = {
  id: 'comp-1',
  manufacturerId: null as string | null,
  manufacturerPartNumber: null as string | null,
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

function identity(
  overrides: Partial<DocumentIdentityDto> = {},
): DocumentIdentityDto {
  return {
    ...buildDocumentIdentity({
      suggestion: suggestion(),
      manufacturerPartNumber: 'MC0805S8F3000T5E',
      manufacturerPartNumberSource: 'COMPONENT_INTELLIGENCE',
      context: CONTEXT,
      pageCount: 4,
    }),
    ...overrides,
  };
}

describe('document identity findings', () => {
  it('creates an MPN_MISSING finding using the existing issue type', () => {
    const findings = buildDocumentIdentityFindings({
      component: COMPONENT,
      identity: identity(),
      context: CONTEXT,
      documentTitle: 'MC0805S8F3000T5E Datasheet',
    });

    const mpn = findings.find((f) => f.issueType === 'MPN_MISSING');
    expect(mpn).toBeDefined();
    expect(mpn!.issueCategory).toBe('IDENTITY');
    expect(mpn!.field).toBe('manufacturerPartNumber');
    expect(mpn!.source).toBe(DOCUMENT_ANALYSIS_SOURCE);
    expect(mpn!.intelligenceVersion).toBe(DATASHEET_INTELLIGENCE_VERSION);
    expect(mpn!.suggestedValue?.manufacturerPartNumber).toBe(
      'MC0805S8F3000T5E',
    );
    // The document identity travels with the suggestion, so the reviewer — and
    // the fingerprint — can tell which datasheet produced it.
    expect(mpn!.suggestedValue?.document).toMatchObject({
      documentId: 'doc-1',
      documentVersion: 2,
      documentContentHash: 'a'.repeat(64),
    });
    expect((mpn!.metadata as { origin?: string }).origin).toBe('DATASHEET');
  });

  it('creates a MANUFACTURER_UNRESOLVED finding when none is recorded', () => {
    const findings = buildDocumentIdentityFindings({
      component: COMPONENT,
      identity: identity(),
      context: CONTEXT,
      documentTitle: 'Datasheet',
    });

    const manufacturer = findings.find(
      (f) => f.issueType === 'MANUFACTURER_UNRESOLVED',
    );
    expect(manufacturer).toBeDefined();
    expect(manufacturer!.suggestedValue?.manufacturerId).toBe('mfg-yageo');
    expect(manufacturer!.confidenceLevel).toBe('HIGH');
  });

  it('reports conflicts instead of overwriting a recorded value', () => {
    const findings = buildDocumentIdentityFindings({
      component: {
        ...COMPONENT,
        manufacturerId: 'mfg-murata',
        manufacturerPartNumber: 'RC0805FR-0710KL',
      },
      identity: identity(),
      context: CONTEXT,
      documentTitle: 'Datasheet',
    });

    expect(findings.map((f) => f.issueType).sort()).toEqual([
      'MANUFACTURER_CONFLICT',
      'MPN_CONFLICT',
    ]);
    const conflict = findings.find((f) => f.issueType === 'MPN_CONFLICT')!;
    expect(conflict.currentValue?.manufacturerPartNumber).toBe(
      'RC0805FR-0710KL',
    );
  });

  it('creates nothing when the document agrees with the component', () => {
    const findings = buildDocumentIdentityFindings({
      component: {
        ...COMPONENT,
        manufacturerId: 'mfg-yageo',
        manufacturerPartNumber: 'MC0805S8F3000T5E',
      },
      identity: identity(),
      context: CONTEXT,
      documentTitle: 'Datasheet',
    });

    expect(findings).toEqual([]);
  });

  it('matches a stored MPN that differs only in punctuation', () => {
    const findings = buildDocumentIdentityFindings({
      component: { ...COMPONENT, manufacturerPartNumber: 'MC0805S8F3000T5E' },
      identity: identity({ manufacturerName: null, manufacturerId: null }),
      context: CONTEXT,
      documentTitle: 'Datasheet',
    });

    expect(findings).toEqual([]);
  });

  it('ignores a low-confidence manufacturer resolution', () => {
    const lowConfidence = buildDocumentIdentity({
      suggestion: suggestion({
        manufacturer: {
          resolution: 'NEW_CANDIDATE',
          manufacturerName: 'Some Vendor',
          confidence: 0.4,
          confidenceLevel: 'LOW',
          matchType: 'fuzzy',
          evidence: [],
        },
      }),
      manufacturerPartNumber: null,
      manufacturerPartNumberSource: null,
      context: CONTEXT,
      pageCount: null,
    });

    expect(
      buildDocumentIdentityFindings({
        component: COMPONENT,
        identity: lowConfidence,
        context: CONTEXT,
        documentTitle: 'Datasheet',
      }),
    ).toEqual([]);
  });

  it('produces findings compatible with the existing fingerprint function', () => {
    const findings = buildDocumentIdentityFindings({
      component: COMPONENT,
      identity: identity(),
      context: CONTEXT,
      documentTitle: 'Datasheet',
    });

    const fingerprints = buildDocumentFindingFingerprints(findings);
    expect(fingerprints).toHaveLength(findings.length);
    for (const [index, finding] of findings.entries()) {
      expect(fingerprints[index]).toBe(
        buildFindingFingerprint({
          componentId: finding.componentId,
          relatedComponentId: finding.relatedComponentId,
          issueType: finding.issueType,
          field: finding.field,
          currentValue: finding.currentValue,
          suggestedValue: finding.suggestedValue,
          intelligenceVersion: finding.intelligenceVersion,
        }),
      );
    }
  });

  it('is idempotent and document-specific', () => {
    const build = (documentVersion: number, contentHash: string) =>
      buildDocumentFindingFingerprints(
        buildDocumentIdentityFindings({
          component: COMPONENT,
          identity: identity(),
          context: { ...CONTEXT, documentVersion, contentHash },
          documentTitle: 'Datasheet',
        }),
      );

    const first = build(2, 'a'.repeat(64));
    // Same bytes analysed again: identical fingerprints, so the queue updates
    // the existing findings instead of duplicating them.
    expect(build(2, 'a'.repeat(64))).toEqual(first);
    // A new document revision: different fingerprints, so new findings are
    // created rather than silently rewriting the old evidence.
    expect(build(3, 'b'.repeat(64))).not.toEqual(first);
  });

  it('never mutates component data', () => {
    const component = { ...COMPONENT };
    const snapshot = JSON.stringify(component);

    buildDocumentIdentityFindings({
      component,
      identity: identity(),
      context: CONTEXT,
      documentTitle: 'Datasheet',
    });

    expect(JSON.stringify(component)).toBe(snapshot);
  });

  it('carries document evidence onto every finding it produces', () => {
    const findings = buildDocumentIdentityFindings({
      component: COMPONENT,
      identity: identity(),
      context: CONTEXT,
      documentTitle: 'Datasheet',
    });

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.evidence?.length).toBeGreaterThan(0);
      expect(finding.evidence?.[0]).toMatchObject({
        documentId: 'doc-1',
        documentVersion: 2,
        documentContentHash: 'a'.repeat(64),
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

describe('analysis summary', () => {
  it('counts what the extraction actually produced', () => {
    const attributes = resolveAttributeCandidates({
      extraction: extraction([
        attribute(),
        attribute({ code: 'tolerance', value: 1, formatted: '1%' }),
        attribute({ code: 'unknown_prop', formatted: '?' }),
      ]),
      definitions: [
        definition(),
        definition({
          id: 'def-tolerance',
          code: 'tolerance',
          name: 'Tolerance',
          dataType: 'NUMBER',
          defaultUnit: null,
        }),
      ],
      currentValues: new Map(),
      context: CONTEXT,
    });
    const identityDto = identity();

    const summary = summarizeDocumentAnalysis({
      attributes,
      identity: identityDto,
      evidence: collectAnalysisEvidence(attributes, identityDto),
      findingsCreated: 2,
      findingsPending: 2,
    });

    expect(summary.extractedSpecifications).toBe(3);
    expect(summary.matchedDefinitions).toBe(2);
    expect(summary.unresolvedDefinitions).toBe(1);
    expect(summary.unresolvedValues).toBe(0);
    expect(summary.findingsCreated).toBe(2);
    expect(summary.findingsPending).toBe(2);
    // Evidence is counted, not estimated.
    expect(summary.evidenceCount).toBe(
      attributes.length + identityDto.evidence.length,
    );
  });

  it('reports zeroes for an extraction that found nothing', () => {
    const empty = extraction([]);
    const identityDto = identity();
    const attributes = resolveAttributeCandidates({
      extraction: empty,
      definitions: [definition()],
      currentValues: new Map(),
      context: CONTEXT,
    });

    const summary = summarizeDocumentAnalysis({
      attributes,
      identity: identityDto,
      evidence: collectAnalysisEvidence(attributes, identityDto),
      findingsCreated: 0,
      findingsPending: 0,
    });

    expect(summary).toMatchObject({
      extractedSpecifications: 0,
      matchedDefinitions: 0,
      unresolvedDefinitions: 0,
      unresolvedValues: 0,
      conflicts: 0,
      findingsCreated: 0,
    });
  });

  it('counts conflicts separately from resolutions', () => {
    const currentValues = new Map<string, CurrentAttributeValue>([
      [
        'def-resistance',
        { attributeDefinitionId: 'def-resistance', display: '10' },
      ],
    ]);
    const attributes = resolveAttributeCandidates({
      extraction: extraction([attribute()]),
      definitions: [definition()],
      currentValues,
      context: CONTEXT,
    });
    const identityDto = identity();

    const summary = summarizeDocumentAnalysis({
      attributes,
      identity: identityDto,
      evidence: collectAnalysisEvidence(attributes, identityDto),
      findingsCreated: 0,
      findingsPending: 0,
    });

    expect(summary.conflicts).toBe(1);
    expect(summary.matchedDefinitions).toBe(1);
  });
});

describe('evidence model contract', () => {
  it('exposes the fields the pass requires on every evidence item', () => {
    const item: DocumentEvidenceDto = buildDocumentEvidence(
      attribute().evidence,
      CONTEXT,
    )[0]!;

    for (const field of [
      'documentId',
      'documentVersion',
      'page',
      'text',
      'extractionMethod',
      'documentContentHash',
    ] as const) {
      expect(field in item).toBe(true);
    }
  });
});
