import {
  ATTRIBUTE_SUGGESTION_SOURCE,
  MAX_ATTRIBUTE_FINDINGS_PER_COMPONENT,
  buildAttributeSuggestionFindings,
  type BuildAttributeFindingInput,
} from './component-attribute-suggestion-findings';
import type { AttributeSuggestionDto } from './dtos';

/**
 * Attribute suggestions → review-queue findings.
 *
 * The rules under test are the ones that decide whether a reviewer is asked to
 * look at something, so the tests state both directions: what becomes a finding,
 * and — just as importantly — what deliberately does not. The "does not" cases
 * are what keep the queue from becoming a firehose and what keep an invented
 * value out of a component.
 */

const COMPONENT = {
  id: 'comp-1',
  sku: 'CMP-000001',
  name: 'JST XH connector',
  updatedAt: new Date('2026-09-23T10:00:00.000Z'),
};

const VERSION = 'component-review-v3';

function suggestion(
  overrides: Partial<AttributeSuggestionDto> = {},
): AttributeSuggestionDto {
  return {
    attributeDefinitionId: 'def-mounting',
    code: 'mounting_type',
    name: 'Mounting Type',
    dataType: 'SELECT',
    unitCategory: null,
    defaultUnit: null,
    isRequired: false,
    categoryIds: ['cat-conn'],
    consideredCategoryIds: ['cat-conn'],
    relevance: [
      {
        type: 'category_binding',
        description: 'Mounting Type is bound to Connectors',
        source: 'category:binding',
        weight: 0.9,
      },
    ],
    valueEvidence: [
      {
        type: 'package_pattern',
        description: '0805 is a Chip footprint, which mounts as SMD',
        source: 'package:mounting_classification',
        weight: 0.9,
      },
    ],
    suggestedValue: {
      value: 'SMD',
      optionCode: 'SMD',
      optionLabel: 'Surface Mount (SMD/SMT)',
      formatted: 'SMD',
    },
    confidence: 0.9,
    confidenceLevel: 'HIGH',
    existingDisplay: null,
    existingMatches: null,
    conflict: null,
    ...overrides,
  };
}

function build(overrides: Partial<BuildAttributeFindingInput> = {}) {
  return buildAttributeSuggestionFindings({
    component: COMPONENT,
    suggestions: [],
    intelligenceVersion: VERSION,
    ...overrides,
  });
}

const relevantOnly = () =>
  suggestion({
    attributeDefinitionId: 'def-plating',
    code: 'contact_plating',
    name: 'Contact Plating',
    suggestedValue: null,
    confidence: null,
    confidenceLevel: null,
    valueEvidence: [],
  });

const conflicting = () =>
  suggestion({
    existingDisplay: 'Through Hole',
    existingMatches: false,
    conflict: { existingDisplay: 'Through Hole', suggestedDisplay: 'SMD' },
  });

const matching = () =>
  suggestion({ existingDisplay: 'SMD', existingMatches: true });

const inconclusive = () =>
  suggestion({ existingDisplay: '470 furlongs', existingMatches: false });

describe('a suggestion with a value becomes an appliable finding', () => {
  it('carries the definition, the value and the relevance that found it', () => {
    const { findings } = build({ suggestions: [suggestion()] });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.issueType).toBe('ATTRIBUTE_VALUE_SUGGESTION');
    expect(finding.issueCategory).toBe('ATTRIBUTE_VALUE');
    expect(finding.field).toBe('attributes.mounting_type');
    expect(finding.source).toBe(ATTRIBUTE_SUGGESTION_SOURCE);
    expect(finding.intelligenceVersion).toBe(VERSION);
    expect(finding.componentUpdatedAt).toEqual(COMPONENT.updatedAt);
    expect(finding.confidence).toBe(0.9);
    expect(finding.confidenceLevel).toBe('HIGH');
    expect(finding.metadata).toMatchObject({
      rule: 'ATTRIBUTE_SUGGESTION',
      attributeDefinitionId: 'def-mounting',
      actionable: true,
      conflict: false,
      relevance: ['category_binding'],
    });
    expect(finding.evidence).toEqual([
      expect.objectContaining({ type: 'category_binding' }),
      expect.objectContaining({ source: 'package:mounting_classification' }),
    ]);
  });

  it('stores the value in the shape the apply path reads', () => {
    const { findings } = build({ suggestions: [suggestion()] });
    const suggested = findings[0]!.suggestedValue!;

    // `display` labels the applied value; `value` is the coerced payload
    // `readAttributeWriteInput` unwraps.
    expect(suggested.display).toBe('SMD');
    expect(suggested.value).toEqual({ value: 'SMD', optionCode: 'SMD' });
    expect(suggested.attributeDefinitionId).toBe('def-mounting');
    expect(suggested.dataType).toBe('SELECT');
  });

  it('records a quantity with its unit', () => {
    const { findings } = build({
      suggestions: [
        suggestion({
          attributeDefinitionId: 'def-pitch',
          code: 'pitch',
          name: 'Contact Pitch',
          dataType: 'QUANTITY',
          unitCategory: 'Length',
          defaultUnit: 'mm',
          suggestedValue: { value: 2.5, unit: 'mm', formatted: '2.50 mm' },
        }),
      ],
    });

    expect(findings[0]!.suggestedValue!.value).toEqual({
      value: 2.5,
      unit: 'mm',
    });
    expect(findings[0]!.suggestedValue!.display).toBe('2.50 mm');
  });

  it('records a multi-select as its list of option codes', () => {
    const { findings } = build({
      suggestions: [
        suggestion({
          dataType: 'MULTI_SELECT',
          suggestedValue: {
            value: ['RoHS'],
            selectedOptionCodes: ['RoHS'],
            formatted: 'RoHS',
          },
        }),
      ],
    });

    expect(findings[0]!.suggestedValue!.value).toEqual({
      value: ['RoHS'],
      selectedOptionCodes: ['RoHS'],
    });
  });

  it('describes a conflict as a conflict, with the recorded value intact', () => {
    const { findings } = build({ suggestions: [conflicting()] });
    const finding = findings[0]!;

    expect(finding.title).toContain('conflicts');
    expect(finding.description).toContain('Through Hole');
    expect(finding.currentValue).toMatchObject({ value: 'Through Hole' });
    expect(finding.metadata).toMatchObject({
      conflict: true,
      actionable: true,
    });
  });

  it('reports the recorded value as absent when the component records none', () => {
    const { findings } = build({ suggestions: [suggestion()] });
    expect(findings[0]!.currentValue).toMatchObject({ value: null });
  });

  it('queues an inconclusive comparison, without calling it a conflict', () => {
    // The comparison could not read the recorded value as either agreement or
    // disagreement, so a reviewer decides. Claiming a conflict would state
    // something the system did not establish; staying silent would hide a value
    // that may well be wrong.
    const { findings } = build({ suggestions: [inconclusive()] });

    expect(findings).toHaveLength(1);
    expect(findings[0]!.metadata).toMatchObject({
      conflict: false,
      actionable: true,
    });
    expect(findings[0]!.currentValue).toMatchObject({ value: '470 furlongs' });
    expect(findings[0]!.title).not.toContain('conflicts');
  });
});

describe('what deliberately produces no finding', () => {
  it('says nothing about a value the component already records equivalently', () => {
    expect(build({ suggestions: [matching()] }).findings).toEqual([]);
  });

  it('says nothing about a suggestion with no definition to write to', () => {
    expect(
      build({
        suggestions: [suggestion({ attributeDefinitionId: '' })],
      }).findings,
    ).toEqual([]);
  });

  it('says nothing about an attribute another producer already raised', () => {
    const { findings } = build({
      suggestions: [suggestion()],
      coveredDefinitionIds: new Set(['def-mounting']),
    });
    expect(findings).toEqual([]);
  });

  it('does not queue a mere lexical mention with no value', () => {
    // A text mention is a ranking hint, not a configured expectation. Queuing
    // every mention would make the queue unusable.
    const { findings } = build({
      suggestions: [
        {
          ...relevantOnly(),
          relevance: [
            {
              type: 'attribute_mention',
              description: 'The supplied text names "contact plating"',
              source: 'text:mention',
              weight: 0.6,
            },
          ],
        },
      ],
    });

    expect(findings).toEqual([]);
  });

  it('does not call an attribute unknown when the component records a value', () => {
    // No suggestion value, but something *is* recorded: the finding would be
    // false, and the recorded value is the reviewer's own data.
    const { findings } = build({
      suggestions: [
        {
          ...relevantOnly(),
          existingDisplay: 'Gold',
          existingMatches: false,
        },
      ],
    });
    expect(findings).toEqual([]);
  });
});

describe('relevance without a value is review-only', () => {
  it('queues a configured expectation with no value, and no confidence', () => {
    const { findings } = build({ suggestions: [relevantOnly()] });
    const finding = findings[0]!;

    expect(finding.issueType).toBe('ATTRIBUTE_VALUE_UNKNOWN');
    expect(finding.issueCategory).toBe('ATTRIBUTE_VALUE');
    expect(finding.suggestedValue).toBeNull();
    // Relevance is not a prediction: a confidence here would read as one.
    expect(finding.confidence).toBeUndefined();
    expect(finding.confidenceLevel).toBeUndefined();
    expect(finding.metadata).toMatchObject({
      rule: 'ATTRIBUTE_RELEVANCE_ONLY',
      actionable: false,
      attributeDefinitionId: 'def-plating',
    });
    expect(finding.currentValue).toMatchObject({ value: null });
    expect(finding.description).toContain('no value could be determined');
  });

  it('accepts a Data Pack expectation as configured relevance', () => {
    const { findings } = build({
      suggestions: [
        {
          ...relevantOnly(),
          relevance: [
            {
              type: 'data_pack_expectation',
              description: 'Data Pack expects Contact Plating for Connectors',
              source: 'datapack:expected_attributes',
              weight: 0.85,
            },
          ],
        },
      ],
    });
    expect(findings).toHaveLength(1);
  });

  it('accepts an inherited binding as configured relevance', () => {
    const { findings } = build({
      suggestions: [
        {
          ...relevantOnly(),
          relevance: [
            {
              type: 'category_binding_inherited',
              description:
                'Contact Plating is bound to Connectors (inherited from a parent category)',
              source: 'category:inherited-binding',
              weight: 0.8,
            },
          ],
        },
      ],
    });
    expect(findings).toHaveLength(1);
  });

  it('never carries a suggested value, so the queue cannot offer an apply', () => {
    const { findings } = build({ suggestions: [relevantOnly()] });
    expect(findings[0]!.suggestedValue).toBeNull();
    expect(findings[0]!.metadata?.actionable).toBe(false);
  });
});

describe('ordering and the per-component cap', () => {
  const valued = (index: number) =>
    suggestion({
      attributeDefinitionId: `def-valued-${index}`,
      code: `valued_${index}`,
      name: `Valued ${index}`,
    });
  const unknown = (index: number) => ({
    ...relevantOnly(),
    attributeDefinitionId: `def-unknown-${index}`,
    code: `unknown_${index}`,
    name: `Unknown ${index}`,
  });

  it('keeps the backend order inside each group', () => {
    const { findings } = build({
      suggestions: [valued(1), valued(2), unknown(3), unknown(4)],
    });

    expect(findings.map((finding) => finding.metadata?.attributeCode)).toEqual([
      'valued_1',
      'valued_2',
      'unknown_3',
      'unknown_4',
    ]);
  });

  it('drops the least actionable findings when the cap is reached', () => {
    const { findings, truncated } = build({
      suggestions: [
        ...Array.from({ length: 3 }, (_unused, index) => valued(index)),
        ...Array.from({ length: 8 }, (_unused, index) => unknown(index)),
      ],
    });

    expect(truncated).toBe(true);
    expect(findings).toHaveLength(MAX_ATTRIBUTE_FINDINGS_PER_COMPONENT);
    // Every actionable finding survived; only relevance-only ones were dropped.
    expect(
      findings.filter(
        (finding) => finding.issueType === 'ATTRIBUTE_VALUE_SUGGESTION',
      ),
    ).toHaveLength(3);
  });

  it('reports no truncation when everything fits', () => {
    expect(build({ suggestions: [suggestion()] }).truncated).toBe(false);
  });
});
