import {
  MAX_SEMANTIC_CANDIDATES_PER_COMPONENT,
  MAX_SEMANTIC_FINDINGS_PER_AUDIT,
  MAX_SEMANTIC_TOKEN_FANOUT,
  SEMANTIC_HIGH_SCORE,
  SEMANTIC_MIN_SCORE,
  SEMANTIC_MIN_SCORE_MANUFACTURER_CONFLICT,
  SEMANTIC_SCORING_PENALTIES,
  SEMANTIC_SCORING_WEIGHTS,
  buildSemanticNameProfile,
  compareValueTokens,
  formatBaseMagnitude,
  jaccardSimilarity,
  mpnFamilyKey,
  parseValueToken,
  scoreSemanticCandidate,
  semanticBlockingTokens,
  semanticNameTokens,
  sharesOnlyPackageTokens,
  sharedSignificantTokens,
  significantTokens,
  type SemanticNameProfile,
  type SemanticScoreInput,
  type SemanticTokenVocabulary,
} from './component-semantic-similarity';
import { buildGenericNameTerms } from './component-duplicate-intelligence';
import { buildIdentityAttributeIndex } from './component-duplicate-intelligence';

/**
 * Pass 5B coverage for the bounded semantic / lexical similarity layer.
 *
 * The numbering follows the pass contract: positive matches, negative guards,
 * determinism, bounds. Everything here is pure - no database, no ML service.
 */

const packagePatterns = ['0201', '0402', '0603', '0805', '1206', 'SOT-23'];

const vocabulary: SemanticTokenVocabulary = {
  genericTerms: buildGenericNameTerms({ packagePatterns }),
  packagePatterns,
};

function profileOf(name: string): SemanticNameProfile {
  return buildSemanticNameProfile(name, vocabulary);
}

/** Minimal scoring input; tests override only what they exercise. */
function scoreInput(
  overrides: Partial<SemanticScoreInput> & {
    memberName: string;
    canonicalName: string;
  },
): SemanticScoreInput {
  const { memberName, canonicalName } = overrides;
  return {
    manufacturerRelation: 'SAME',
    memberManufacturerName: 'Yageo',
    canonicalManufacturerName: 'Yageo',
    categoryRelation: 'SAME',
    memberCategoryName: 'Resistors',
    canonicalCategoryName: 'Resistors',
    memberProfile: profileOf(memberName),
    canonicalProfile: profileOf(canonicalName),
    memberMpn: null,
    canonicalMpn: null,
    matchingAttributes: [],
    ...overrides,
  };
}

function score(
  overrides: Partial<SemanticScoreInput> & {
    memberName: string;
    canonicalName: string;
  },
) {
  return scoreSemanticCandidate(scoreInput(overrides));
}

describe('semantic value tokens', () => {
  it('parses amounts with unit letters into base units', () => {
    expect(parseValueToken('10kohm')).toMatchObject({
      unit: 'ohm',
      magnitude: 10_000,
    });
    expect(parseValueToken('100nf')).toMatchObject({
      unit: 'F',
      magnitude: 100e-9,
    });
    expect(parseValueToken('25v')).toMatchObject({ unit: 'V', magnitude: 25 });
    expect(parseValueToken('1pct')).toMatchObject({ unit: '%', magnitude: 1 });
  });

  it('never parses part-number-like tokens as values', () => {
    for (const token of [
      '1n4148',
      '2n2222',
      'atmega328p',
      'lm358dr',
      'rc0805fr0727rl',
      'ssm3k35amfv',
    ]) {
      expect(parseValueToken(token)).toBeNull();
    }
  });

  it('formats base magnitudes for evidence', () => {
    expect(formatBaseMagnitude(10_000, 'ohm')).toBe('10 kohm');
    expect(formatBaseMagnitude(100e-9, 'F')).toBe('100 nF');
    expect(formatBaseMagnitude(0.125, 'W')).toBe('125 mW');
  });

  it('treats Ω / ohm and µF / uF spellings as the same token', () => {
    expect(semanticNameTokens('10KΩ Resistor')).toEqual(
      semanticNameTokens('10K Ohm Resistor'),
    );
    expect(semanticNameTokens('10µF Capacitor')).toEqual(
      semanticNameTokens('10uF Capacitor'),
    );
    expect(semanticNameTokens('10Kohm Resistor')).toEqual(
      semanticNameTokens('10K Ohm Resistor'),
    );
  });

  it('1. gives equivalent formatted names identical significant tokens', () => {
    const first = profileOf('10KΩ SMD Thick Film Resistor 0805');
    const second = profileOf('10K Ohm 0805 SMD Thick Film Resistor');
    expect(
      jaccardSimilarity(significantTokens(first), significantTokens(second)),
    ).toBe(1);
  });

  it('5/6. separates different values by token and by magnitude', () => {
    const tenK = profileOf('10KΩ Resistor 0805');
    const hundredK = profileOf('100KΩ Resistor 0805');
    const comparison = compareValueTokens(tenK, hundredK);

    expect(comparison.conflicts).toHaveLength(1);
    expect(comparison.conflicts[0]!.unit).toBe('ohm');
    expect(comparison.agreements).toHaveLength(0);

    const oneUf = profileOf('1uF 25V Capacitor');
    const tenUf = profileOf('10uF 25V Capacitor');
    const capacitance = compareValueTokens(oneUf, tenUf);
    expect(capacitance.conflicts.map((conflict) => conflict.unit)).toEqual([
      'F',
    ]);
    expect(capacitance.agreements.map((agreement) => agreement.unit)).toEqual([
      'V',
    ]);
  });

  it('treats missing values as missing evidence, not conflict', () => {
    const withValue = profileOf('10KΩ Resistor 0805');
    const without = profileOf('Resistor 0805');
    expect(compareValueTokens(withValue, without).conflicts).toHaveLength(0);
    expect(compareValueTokens(without, withValue).conflicts).toHaveLength(0);
  });

  it('treats a different unit family as no conflict', () => {
    const resistor = profileOf('10KΩ 0805');
    const capacitor = profileOf('25V 0805');
    expect(compareValueTokens(resistor, capacitor).conflicts).toHaveLength(0);
  });
});

describe('semantic blocking tokens', () => {
  it('gives every spelling of a technical value the same block', () => {
    const symbol = semanticBlockingTokens('10KΩ Resistor', vocabulary);
    const merged = semanticBlockingTokens('10Kohm Resistor', vocabulary);
    const split = semanticBlockingTokens('10K Ohm Resistor', vocabulary);

    expect(symbol).toEqual(['10kohm']);
    expect(merged).toEqual(['10kohm']);
    expect(split).toEqual(['10kohm']);
  });

  it('never produces junk tokens from a value without a scale letter', () => {
    const tokens = semanticBlockingTokens('22Ω SMD Resistor', vocabulary);
    expect(tokens).toEqual(['22ohm']);
    expect(tokens).not.toContain('22o');
    expect(tokens).not.toContain('hm');
  });

  it('drops generic words and bare numbers but keeps package codes', () => {
    const tokens = semanticBlockingTokens(
      '10K Ohm SMD Resistor 0805',
      vocabulary,
    );
    expect(tokens).toEqual(['0805', '10kohm']);
  });

  it('keeps identifier-like tokens', () => {
    expect(semanticBlockingTokens('LM358DR SOIC-8', vocabulary)).toEqual([
      'lm358dr',
      'soic',
    ]);
  });
});

describe('semantic scoring - positive', () => {
  it('1/2. accepts equivalent names with the same manufacturer and values', () => {
    const result = score({
      memberName: '10KΩ SMD Thick Film Resistor 0805',
      canonicalName: '10K Ohm 0805 SMD Thick Film Resistor',
      matchingAttributes: [
        { code: 'resistance', label: 'Resistance', display: '10 kohm' },
        { code: 'package', label: 'Package', display: '0805' },
      ],
    });

    expect(result.accepted).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(SEMANTIC_MIN_SCORE);
    expect(result.nameSimilarity).toBe(1);
    expect(result.signals.map((signal) => signal.code)).toEqual(
      expect.arrayContaining([
        'MANUFACTURER_SAME',
        'CATEGORY_SAME',
        'NAME_SIMILARITY',
        'PACKAGE_AGREES',
        'ATTRIBUTES_AGREE',
      ]),
    );
    expect(result.penalties).toHaveLength(0);
  });

  it('2b. promotes a fully corroborated match to HIGH confidence', () => {
    const result = score({
      memberName: '10KΩ SMD Thick Film Resistor 0805',
      canonicalName: '10K Ohm 0805 SMD Thick Film Resistor',
      matchingAttributes: [
        { code: 'resistance', label: 'Resistance', display: '10 kohm' },
        { code: 'package', label: 'Package', display: '0805' },
      ],
    });

    expect(result.confidenceLevel).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(SEMANTIC_HIGH_SCORE);
    expect(result.strongSignalCount).toBeGreaterThanOrEqual(2);
  });

  it('3. accepts matching structured attributes with the same manufacturer', () => {
    const result = score({
      memberName: 'Chip Resistor 27 Ohm',
      canonicalName: '27Ω 0805 Thick Film Resistor',
      matchingAttributes: [
        { code: 'resistance', label: 'Resistance', display: '27 ohm' },
        { code: 'package', label: 'Package', display: '0805' },
      ],
    });

    expect(result.accepted).toBe(true);
    expect(result.signals.map((signal) => signal.code)).toContain(
      'ATTRIBUTES_AGREE',
    );
  });

  it('4. accepts MPN family similarity with matching physical values', () => {
    const result = score({
      memberName: 'Chip Resistor 27 Ohm 0805',
      canonicalName: 'Chip Resistor 27Ω 0805',
      memberMpn: 'RC0805FR0727RL',
      canonicalMpn: 'RC0805FR0727RLTR',
      matchingAttributes: [
        { code: 'resistance', label: 'Resistance', display: '27 ohm' },
      ],
    });

    expect(result.accepted).toBe(true);
    expect(result.signals.map((signal) => signal.code)).toContain('MPN_FAMILY');
  });

  it('accepts a cross-manufacturer match only with substantially stronger evidence', () => {
    const base = {
      memberName: '10KΩ SMD Thick Film Resistor 0805',
      canonicalName: '10K Ohm 0805 SMD Thick Film Resistor',
    };

    const weak = score({
      ...base,
      manufacturerRelation: 'CONFLICT',
      memberManufacturerName: 'Yageo',
      canonicalManufacturerName: 'Murata',
    });
    expect(weak.accepted).toBe(false);
    expect(weak.rejectionReason).toBe('BELOW_THRESHOLD');

    const strong = score({
      ...base,
      manufacturerRelation: 'CONFLICT',
      memberManufacturerName: 'Yageo',
      canonicalManufacturerName: 'Murata',
      matchingAttributes: [
        { code: 'resistance', label: 'Resistance', display: '10 kohm' },
        { code: 'package', label: 'Package', display: '0805' },
      ],
      memberMpn: 'RC0805FR0710KL',
      canonicalMpn: 'RC0805FR0710K',
    });
    expect(strong.accepted).toBe(true);
    expect(strong.score).toBeGreaterThanOrEqual(
      SEMANTIC_MIN_SCORE_MANUFACTURER_CONFLICT,
    );
    expect(strong.penalties.map((penalty) => penalty.code)).toContain(
      'MANUFACTURER_CONFLICT',
    );
    expect(strong.confidenceLevel).toBe('MEDIUM');
  });

  it('14. treats a missing manufacturer as missing evidence, not disagreement', () => {
    const result = score({
      memberName: '10KΩ SMD Thick Film Resistor 0805',
      canonicalName: '10K Ohm 0805 SMD Thick Film Resistor',
      manufacturerRelation: 'INDETERMINATE',
      memberManufacturerName: null,
      canonicalManufacturerName: null,
      matchingAttributes: [
        { code: 'resistance', label: 'Resistance', display: '10 kohm' },
        { code: 'package', label: 'Package', display: '0805' },
      ],
    });

    expect(result.accepted).toBe(true);
    expect(result.penalties).toHaveLength(0);
    expect(result.signals.map((signal) => signal.code)).not.toContain(
      'MANUFACTURER_SAME',
    );
  });

  it('15. treats missing attributes as missing evidence, not conflict', () => {
    const result = score({
      memberName: '10KΩ SMD Thick Film Resistor 0805',
      canonicalName: '10K Ohm 0805 SMD Thick Film Resistor',
      matchingAttributes: [
        { code: 'resistance', label: 'Resistance', display: '10 kohm' },
      ],
    });
    expect(result.accepted).toBe(true);
  });
});

describe('semantic scoring - negative guards', () => {
  it('5. rejects 10K vs 100K', () => {
    const result = score({
      memberName: '10KΩ Resistor 0805',
      canonicalName: '100KΩ Resistor 0805',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('TECHNICAL_VALUE_CONFLICT');
  });

  it('6. rejects 1uF vs 10uF', () => {
    const result = score({
      memberName: '1uF 25V X7R Capacitor 0805',
      canonicalName: '10uF 25V X7R Capacitor 0805',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('TECHNICAL_VALUE_CONFLICT');
  });

  it('7. rejects 0805 vs 0603 when the package attribute is identity-bearing', () => {
    const attributes = buildIdentityAttributeIndex([
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
    ]);

    const result = scoreSemanticCandidate(
      scoreInput({
        memberName: '10KΩ Resistor 0805',
        canonicalName: '10KΩ Resistor 0603',
        memberAttributes: attributes.get('a'),
        canonicalAttributes: attributes.get('b'),
      }),
    );

    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('ATTRIBUTE_CONFLICT');
  });

  it('7b. penalises a package token difference when no attribute contradicts', () => {
    const result = score({
      memberName: '10KΩ Resistor 0805',
      canonicalName: '10KΩ Resistor 0603',
    });
    // The names differ only in the footprint, so the candidate is rejected -
    // either by the package-only guard or by the score penalty.
    expect(result.accepted).toBe(false);
    expect(
      result.rejectionReason === 'PACKAGE_ONLY_OVERLAP' ||
        result.rejectionReason === 'BELOW_THRESHOLD',
    ).toBe(true);
  });

  it('8. rejects resistor vs microcontroller', () => {
    const result = score({
      memberName: '10KΩ Resistor 0805',
      canonicalName: 'ATmega328P Microcontroller',
      categoryRelation: 'INCOMPATIBLE',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('INCOMPATIBLE_CATEGORY');
  });

  it('9. rejects components that only share a generic name', () => {
    const result = score({
      memberName: 'Resistor',
      canonicalName: 'Resistor',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('GENERIC_NAME');
  });

  it('10. rejects components that only share a package', () => {
    const result = score({
      memberName: '0805',
      canonicalName: '0805',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('PACKAGE_ONLY_OVERLAP');
  });

  it('11. rejects components that only share a manufacturer', () => {
    const result = score({
      memberName: '10KΩ Resistor 0805',
      canonicalName: 'ATmega328P Microcontroller',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('NO_SHARED_IDENTITY_TOKEN');
  });

  it('12. rejects MPNs sharing only a prefix', () => {
    const result = score({
      memberName: 'Yageo Chip Resistor Alpha',
      canonicalName: 'Yageo Chip Resistor Beta',
      memberMpn: 'RC0805FR0727RL',
      canonicalMpn: 'RC0805FR0710RL',
      categoryRelation: 'UNKNOWN',
    });

    expect(result.accepted).toBe(false);
    // The shared MPN family is supporting evidence only: it can never carry the
    // pair on its own.
    expect(result.score).toBeLessThan(SEMANTIC_MIN_SCORE);
  });

  it('12a. rejects different electrical values even when the MPN family matches', () => {
    const result = score({
      memberName: 'Chip Resistor 27 Ohm',
      canonicalName: 'Chip Resistor 100 Ohm',
      memberMpn: 'RC0805FR0727RL',
      canonicalMpn: 'RC0805FR0710RL',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('TECHNICAL_VALUE_CONFLICT');
  });

  it('12b. never treats an MPN family alone as duplicate evidence', () => {
    // Identical MPNs would have been caught by Pass 5A; a shared family with
    // unrelated names must not score.
    const result = score({
      memberName: 'RC0805FR0727RL',
      canonicalName: 'RC0805FR0710RL',
      memberMpn: 'RC0805FR0727RL',
      canonicalMpn: 'RC0805FR0710RL',
    });
    expect(result.accepted).toBe(false);
  });

  it('13. rejects different manufacturers with generic name similarity', () => {
    const result = score({
      memberName: 'SMD Resistor 0805',
      canonicalName: 'SMD Resistor 0805',
      manufacturerRelation: 'CONFLICT',
      memberManufacturerName: 'Yageo',
      canonicalManufacturerName: 'Murata',
      categoryRelation: 'UNKNOWN',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('PACKAGE_ONLY_OVERLAP');
  });

  it('rejects a candidate whose only overlap is a generic descriptor', () => {
    const result = score({
      memberName: 'Thick Film Resistor',
      canonicalName: 'Thick Film Resistor',
    });
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('GENERIC_NAME');
  });

  it('rejects when the name similarity is too low and nothing corroborates', () => {
    const result = score({
      memberName: 'LM358DR Operational Amplifier',
      canonicalName: 'LM358DRT Operational Amplifier',
      categoryRelation: 'UNKNOWN',
    });
    // `lm358dr` and `lm358drt` are different tokens, so the only shared token is
    // the generic `operational`/`amplifier` vocabulary - not enough.
    expect(result.accepted).toBe(false);
  });

  it('requires the score threshold, not merely one weak signal', () => {
    const result = score({
      memberName: 'LM358DR',
      canonicalName: 'LM358DR',
      categoryRelation: 'UNKNOWN',
    });
    // Same identifier token, same manufacturer, but no category and no other
    // corroboration: name (0.3) + manufacturer (0.22) = 0.52 < 0.55.
    expect(result.score).toBeLessThan(SEMANTIC_MIN_SCORE);
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBe('BELOW_THRESHOLD');
  });
});

describe('semantic scoring - transparency', () => {
  it('documents its weights and keeps single supporting signals below threshold', () => {
    const supportingOnly = [
      SEMANTIC_SCORING_WEIGHTS.categorySame,
      SEMANTIC_SCORING_WEIGHTS.categoryRelated,
      SEMANTIC_SCORING_WEIGHTS.technicalValuesAgree,
      SEMANTIC_SCORING_WEIGHTS.packageAgrees,
      SEMANTIC_SCORING_WEIGHTS.attributesAgree,
      SEMANTIC_SCORING_WEIGHTS.mpnFamily,
      SEMANTIC_SCORING_WEIGHTS.manufacturerSame,
    ];
    for (const weight of supportingOnly) {
      expect(weight).toBeLessThan(SEMANTIC_MIN_SCORE);
    }

    // Name similarity plus manufacturer agreement is deliberately *below* the
    // threshold: a candidate must also agree on category, package, technical
    // values, structured attributes or MPN family.
    expect(
      SEMANTIC_SCORING_WEIGHTS.manufacturerSame +
        SEMANTIC_SCORING_WEIGHTS.nameSimilarity,
    ).toBeLessThan(SEMANTIC_MIN_SCORE);
    expect(
      SEMANTIC_SCORING_WEIGHTS.manufacturerSame +
        SEMANTIC_SCORING_WEIGHTS.nameSimilarity +
        SEMANTIC_SCORING_WEIGHTS.categorySame,
    ).toBeGreaterThanOrEqual(SEMANTIC_MIN_SCORE);
  });

  it('reports every applied signal with a weight and an explanation', () => {
    const result = score({
      memberName: '10KΩ SMD Thick Film Resistor 0805',
      canonicalName: '10K Ohm 0805 SMD Thick Film Resistor',
      matchingAttributes: [
        { code: 'resistance', label: 'Resistance', display: '10 kohm' },
      ],
    });

    expect(result.signals.length).toBeGreaterThan(0);
    for (const signal of result.signals) {
      expect(signal.weight).toBeGreaterThan(0);
      expect(signal.detail.length).toBeGreaterThan(0);
      expect(signal.evidenceSource).toMatch(/^analyzer:|^database:/);
      expect(signal.code).toMatch(/^[A-Z_]+$/);
    }
  });

  it('scores deterministically for identical inputs', () => {
    const input = scoreInput({
      memberName: '10KΩ SMD Thick Film Resistor 0805',
      canonicalName: '10K Ohm 0805 SMD Thick Film Resistor',
    });
    const first = scoreSemanticCandidate(input);
    const second = scoreSemanticCandidate(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('exposes a bounded penalty for manufacturer conflict', () => {
    expect(SEMANTIC_SCORING_PENALTIES.manufacturerConflict).toBeGreaterThan(0);
    expect(SEMANTIC_SCORING_PENALTIES.manufacturerConflict).toBeLessThan(
      SEMANTIC_MIN_SCORE_MANUFACTURER_CONFLICT -
        SEMANTIC_MIN_SCORE +
        SEMANTIC_SCORING_PENALTIES.manufacturerConflict,
    );
  });
});

describe('semantic helpers', () => {
  it('shares only package tokens detection', () => {
    const first = profileOf('0805');
    const second = profileOf('0805');
    expect(sharesOnlyPackageTokens(['0805'], first, second)).toBe(true);
    expect(sharesOnlyPackageTokens([], first, second)).toBe(false);

    const third = profileOf('10KΩ 0805');
    expect(sharesOnlyPackageTokens(['10kohm'], third, third)).toBe(false);
  });

  it('derives MPN families only for substantial part numbers', () => {
    expect(mpnFamilyKey('RC0805FR0727RL')).toBe('RC0805');
    expect(mpnFamilyKey('AB1')).toBeNull();
    expect(mpnFamilyKey(null)).toBeNull();
    expect(mpnFamilyKey('1234567890')).toBeNull();
  });

  it('computes Jaccard similarity safely for empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
    expect(jaccardSimilarity(new Set(['a']), new Set())).toBe(0);
    expect(jaccardSimilarity(new Set(['a']), new Set(['a']))).toBe(1);
    expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['b', 'c']))).toBe(
      1 / 3,
    );
  });

  it('sorts shared tokens deterministically', () => {
    const first = profileOf('LM358DR 0805 SOIC');
    const second = profileOf('0805 LM358DR SOIC');
    const shared = sharedSignificantTokens(first, second);
    expect(shared).toEqual([...shared].sort());
  });

  it('exposes finite, conservative bounds', () => {
    expect(MAX_SEMANTIC_CANDIDATES_PER_COMPONENT).toBeGreaterThan(0);
    expect(MAX_SEMANTIC_CANDIDATES_PER_COMPONENT).toBeLessThanOrEqual(100);
    expect(MAX_SEMANTIC_FINDINGS_PER_AUDIT).toBeGreaterThan(0);
    expect(MAX_SEMANTIC_TOKEN_FANOUT).toBeGreaterThan(0);
  });
});
