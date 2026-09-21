import {
  buildAttributeFindingFingerprint,
  normalizeAttributeFindingSubject,
} from './attribute-finding.fingerprint';

/**
 * Fingerprint contract.
 *
 * The fingerprint is the identity of a *condition*, and the queue's idempotency
 * depends on it being reproducible from the condition alone. These tests pin the
 * two failure modes that would break that:
 *
 *  - churn: something volatile getting into the payload, so re-running the same
 *    analysis creates a new finding every time;
 *  - collision: a material state change not getting into the payload, so a
 *    decision recorded against one revision silently covers a different one.
 */
describe('Attribute finding fingerprints', () => {
  const subject = {
    attributeDefinitionId: 'attr-voltage',
    categoryId: 'cat-capacitors',
  };

  const baseInput = {
    issueType: 'SUGGESTED_BINDING',
    subject,
    currentState: { bound: false },
    suggestedState: { isRequired: false },
    intelligenceVersion: 'attribute-library-v1',
  };

  it('is deterministic for the same input', () => {
    expect(buildAttributeFindingFingerprint(baseInput)).toBe(
      buildAttributeFindingFingerprint(baseInput),
    );
  });

  it('produces a 64-character sha256 hex digest', () => {
    expect(buildAttributeFindingFingerprint(baseInput)).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('does not depend on object key ordering', () => {
    const first = buildAttributeFindingFingerprint({
      ...baseInput,
      currentState: { bound: false, usageCount: 4, categoryOrder: ['a', 'b'] },
    });
    const second = buildAttributeFindingFingerprint({
      ...baseInput,
      currentState: { categoryOrder: ['a', 'b'], usageCount: 4, bound: false },
    });

    expect(first).toBe(second);
  });

  it('preserves array order, because order can be meaningful', () => {
    const ascending = buildAttributeFindingFingerprint({
      ...baseInput,
      currentState: { aliases: ['rated_voltage', 'working_voltage'] },
    });
    const descending = buildAttributeFindingFingerprint({
      ...baseInput,
      currentState: { aliases: ['working_voltage', 'rated_voltage'] },
    });

    expect(ascending).not.toBe(descending);
  });

  it('changes when the observed state changes', () => {
    expect(
      buildAttributeFindingFingerprint({
        ...baseInput,
        currentState: { bound: true },
      }),
    ).not.toBe(buildAttributeFindingFingerprint(baseInput));
  });

  it('changes when the suggestion changes', () => {
    expect(
      buildAttributeFindingFingerprint({
        ...baseInput,
        suggestedState: { isRequired: true },
      }),
    ).not.toBe(buildAttributeFindingFingerprint(baseInput));
  });

  it('changes when the subject changes', () => {
    expect(
      buildAttributeFindingFingerprint({
        ...baseInput,
        subject: { ...subject, categoryId: 'cat-resistors' },
      }),
    ).not.toBe(buildAttributeFindingFingerprint(baseInput));
  });

  it('changes with the intelligence version, so old findings are re-derived', () => {
    expect(
      buildAttributeFindingFingerprint({
        ...baseInput,
        intelligenceVersion: 'attribute-library-v2',
      }),
    ).not.toBe(buildAttributeFindingFingerprint(baseInput));
  });

  it('changes with the issue type', () => {
    expect(
      buildAttributeFindingFingerprint({
        ...baseInput,
        issueType: 'SUSPICIOUS_BINDING',
      }),
    ).not.toBe(buildAttributeFindingFingerprint(baseInput));
  });

  it('hashes only the declared subject identity keys', () => {
    // The normalized subject is what actually enters the hash. If it ever grew a
    // key fed from a live row (a timestamp, a reviewer, a usage counter), the
    // fingerprint would churn on every re-analysis.
    expect(
      Object.keys(normalizeAttributeFindingSubject(subject)).sort(),
    ).toEqual([
      'attributeCode',
      'attributeDefinitionId',
      'categoryCode',
      'categoryId',
      'optionCode',
      'optionId',
      'relatedAttributeDefinitionId',
    ]);
  });

  describe('relationship pair normalization', () => {
    const first = { attributeDefinitionId: 'aaa-attribute' };
    const second = { attributeDefinitionId: 'bbb-attribute' };

    it('produces one fingerprint for both orderings of a pair', () => {
      const forward = buildAttributeFindingFingerprint({
        issueType: 'POSSIBLE_DUPLICATE',
        subject: {
          attributeDefinitionId: first.attributeDefinitionId,
          relatedAttributeDefinitionId: second.attributeDefinitionId,
        },
        suggestedState: { canonicalSide: 'aaa-attribute' },
      });
      const reversed = buildAttributeFindingFingerprint({
        issueType: 'POSSIBLE_DUPLICATE',
        subject: {
          attributeDefinitionId: second.attributeDefinitionId,
          relatedAttributeDefinitionId: first.attributeDefinitionId,
        },
        suggestedState: { canonicalSide: 'aaa-attribute' },
      });

      // A mirrored finding must not be created merely because the analyzer
      // walked the pair in the other direction.
      expect(forward).toBe(reversed);
    });

    it('orders the pair by id regardless of input order', () => {
      expect(
        normalizeAttributeFindingSubject({
          attributeDefinitionId: 'bbb-attribute',
          relatedAttributeDefinitionId: 'aaa-attribute',
        }),
      ).toMatchObject({
        attributeDefinitionId: 'aaa-attribute',
        relatedAttributeDefinitionId: 'bbb-attribute',
      });
    });

    it('keeps the canonical side in the suggested state, not the subject', () => {
      const canonicalIsFirst = buildAttributeFindingFingerprint({
        issueType: 'POSSIBLE_DUPLICATE',
        subject: {
          attributeDefinitionId: 'aaa-attribute',
          relatedAttributeDefinitionId: 'bbb-attribute',
        },
        suggestedState: { canonicalSide: 'aaa-attribute' },
      });
      const canonicalIsSecond = buildAttributeFindingFingerprint({
        issueType: 'POSSIBLE_DUPLICATE',
        subject: {
          attributeDefinitionId: 'aaa-attribute',
          relatedAttributeDefinitionId: 'bbb-attribute',
        },
        suggestedState: { canonicalSide: 'bbb-attribute' },
      });

      // Choosing a different canonical side IS a different proposal, so it must
      // not be swallowed by pair normalization.
      expect(canonicalIsFirst).not.toBe(canonicalIsSecond);
    });
  });

  describe('not-yet-defined subjects', () => {
    it('normalizes a display name to a canonical code', () => {
      const fromName = buildAttributeFindingFingerprint({
        issueType: 'MISSING_EXPECTED_ATTRIBUTE',
        subject: { attributeCode: 'Voltage Rating', categoryId: 'cat' },
        suggestedState: { isExisting: false },
      });
      const fromCode = buildAttributeFindingFingerprint({
        issueType: 'MISSING_EXPECTED_ATTRIBUTE',
        subject: { attributeCode: 'voltage_rating', categoryId: 'cat' },
        suggestedState: { isExisting: false },
      });

      expect(fromName).toBe(fromCode);
    });

    it('distinguishes an existing definition from an undefined one', () => {
      const existing = buildAttributeFindingFingerprint({
        issueType: 'SUGGESTED_BINDING',
        subject: {
          attributeDefinitionId: 'attr-voltage',
          attributeCode: 'voltage_rating',
          categoryId: 'cat',
        },
        suggestedState: { isExisting: true },
      });
      const undefinedAttribute = buildAttributeFindingFingerprint({
        issueType: 'SUGGESTED_BINDING',
        subject: { attributeCode: 'voltage_rating', categoryId: 'cat' },
        suggestedState: { isExisting: false },
      });

      expect(existing).not.toBe(undefinedAttribute);
    });
  });

  it('separates findings that differ only by field', () => {
    const unitCategory = buildAttributeFindingFingerprint({
      issueType: 'INCONSISTENT_CONFIG',
      subject: { attributeDefinitionId: 'attr-voltage' },
      field: 'unit_category',
      suggestedState: { unitCategory: 'Voltage' },
    });
    const defaultUnit = buildAttributeFindingFingerprint({
      issueType: 'INCONSISTENT_CONFIG',
      subject: { attributeDefinitionId: 'attr-voltage' },
      field: 'default_unit',
      suggestedState: { unitCategory: 'Voltage' },
    });

    // One command can disagree with its parent unit while declaring the parent
    // correctly; those are two findings, not one.
    expect(unitCategory).not.toBe(defaultUnit);
  });
});
