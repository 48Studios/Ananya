import {
  INTELLIGENCE_FINDING_STATUSES,
  canDecide,
  decidableStatusesFor,
  mapDecisionToFeedbackAction,
  stableStringify,
} from '../intelligence-findings';
import {
  ATTRIBUTE_FINDING_SUBJECT_RULES,
  ATTRIBUTE_REVIEW_ISSUE_CATEGORIES,
  ATTRIBUTE_REVIEW_ISSUE_TYPES,
  ATTRIBUTE_REVIEW_ISSUE_TYPE_VALUES,
  isAttributeReviewIssueType,
  resolveAttributeIssueCategory,
  validateAttributeFindingSubject,
  type AttributeFindingSubject,
  type AttributeReviewIssueType,
} from './attribute-finding.dtos';

/**
 * Taxonomy and subject rules.
 *
 * The taxonomy is a persisted vocabulary: a type that is not listed here cannot
 * be stored, and a category that no longer lists a type makes existing rows
 * unreadable by any consumer that groups by category. These tests pin the
 * invariants that keep the vocabulary self-consistent.
 */
describe('Attribute review taxonomy', () => {
  it('gives every issue type exactly one category', () => {
    for (const issueType of ATTRIBUTE_REVIEW_ISSUE_TYPE_VALUES) {
      const category = resolveAttributeIssueCategory(issueType);
      expect(category).not.toBeNull();
      expect(ATTRIBUTE_REVIEW_ISSUE_CATEGORIES).toContain(category);
    }
  });

  it('lists each issue type at most once across categories', () => {
    const flat = ATTRIBUTE_REVIEW_ISSUE_CATEGORIES.flatMap(
      (category) => ATTRIBUTE_REVIEW_ISSUE_TYPES[category],
    );
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('reserves ATTRIBUTE_QUALITY without assigning a type to it', () => {
    // Deliberate: the category exists so a future quality rule has a home, and is
    // empty so nothing can be persisted under a category that has no semantics.
    expect(ATTRIBUTE_REVIEW_ISSUE_TYPES.ATTRIBUTE_QUALITY).toEqual([]);
  });

  it('recognises the types the existing audit implementation already emits', () => {
    // These four are produced today by the Python `audit_library` rule set and by
    // `MlService.auditAttributeLibraryFallback`. Pass 1 adds no detection rules,
    // so the persistence vocabulary must accept them unchanged.
    for (const emitted of [
      'DUPLICATE_ATTRIBUTE',
      'SUSPICIOUS_BINDING',
      'MISSING_EXPECTED_ATTRIBUTE',
      'UNUSED_ATTRIBUTE',
    ]) {
      expect(isAttributeReviewIssueType(emitted)).toBe(true);
    }
  });

  it('rejects unknown types', () => {
    expect(isAttributeReviewIssueType('NOT_A_REAL_TYPE')).toBe(false);
    expect(resolveAttributeIssueCategory('NOT_A_REAL_TYPE')).toBeNull();
  });

  it('defines a subject rule for every issue type', () => {
    for (const issueType of ATTRIBUTE_REVIEW_ISSUE_TYPE_VALUES) {
      expect(ATTRIBUTE_FINDING_SUBJECT_RULES[issueType]).toBeDefined();
    }
  });
});

describe('Attribute finding subject validation', () => {
  it('accepts a single-attribute finding', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'UNUSED_ATTRIBUTE',
        subject: { attributeDefinitionId: 'attr-1' },
      }),
    ).toBeNull();
  });

  it('accepts a relationship finding with both sides identified', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'POSSIBLE_DUPLICATE',
        subject: {
          attributeDefinitionId: 'attr-1',
          relatedAttributeDefinitionId: 'attr-2',
        },
      }),
    ).toBeNull();
  });

  it('accepts an attribute/category binding subject', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'SUSPICIOUS_BINDING',
        subject: { attributeDefinitionId: 'attr-1', categoryId: 'cat-1' },
      }),
    ).toBeNull();
  });

  it('accepts a category-first suggestion whose attribute is undefined', () => {
    // The whole-library audit emits this shape: a category is missing a standard
    // attribute that the library does not define at all. The code travels in the
    // subject; no definition is invented.
    expect(
      validateAttributeFindingSubject({
        issueType: 'MISSING_EXPECTED_ATTRIBUTE',
        subject: { categoryId: 'cat-1', attributeCode: 'dielectric' },
      }),
    ).toBeNull();
  });

  it('requires both sides of a relationship', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'POSSIBLE_DUPLICATE',
        subject: { attributeDefinitionId: 'attr-1' },
      }),
    ).toMatch(/relatedAttributeDefinitionId/);
  });

  it('requires a category for a binding suggestion', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'SUGGESTED_BINDING',
        subject: { attributeDefinitionId: 'attr-1' },
      }),
    ).toMatch(/categoryId/);
  });

  it('requires some attribute identity for a binding suggestion', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'SUGGESTED_BINDING',
        subject: { categoryId: 'cat-1' },
      }),
    ).toMatch(/attribute definition/i);
  });

  it('accepts a binding suggestion identified only by canonical code', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'SUGGESTED_BINDING',
        subject: { categoryId: 'cat-1', attributeCode: 'voltage_rating' },
      }),
    ).toBeNull();
  });

  it('refuses an attribute related to itself', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'POSSIBLE_DUPLICATE',
        subject: {
          attributeDefinitionId: 'attr-1',
          relatedAttributeDefinitionId: 'attr-1',
        },
      }),
    ).toMatch(/itself/);
  });

  it('refuses an unknown issue type before reaching the database', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'SOMETHING_ELSE',
        subject: { attributeDefinitionId: 'attr-1' },
      }),
    ).toMatch(/Unknown attribute review issue type/);
  });

  it('treats a blank subject id as absent', () => {
    expect(
      validateAttributeFindingSubject({
        issueType: 'UNUSED_ATTRIBUTE',
        subject: { attributeDefinitionId: '   ' },
      }),
    ).toMatch(/attributeDefinitionId/);
  });

  it('covers every issue type with a positive case', () => {
    const validSubjects: Record<
      AttributeReviewIssueType,
      AttributeFindingSubject
    > = {
      DUPLICATE_ATTRIBUTE: {
        attributeDefinitionId: 'a',
        relatedAttributeDefinitionId: 'b',
      },
      POSSIBLE_DUPLICATE: {
        attributeDefinitionId: 'a',
        relatedAttributeDefinitionId: 'b',
      },
      SUGGESTED_BINDING: { categoryId: 'c', attributeCode: 'voltage' },
      MISSING_EXPECTED_ATTRIBUTE: { categoryId: 'c' },
      SUSPICIOUS_BINDING: { attributeDefinitionId: 'a', categoryId: 'c' },
      SUGGESTED_ENUM_VALUE: { attributeDefinitionId: 'a' },
      INCONSISTENT_CONFIG: { attributeDefinitionId: 'a' },
      UNUSED_ATTRIBUTE: { attributeDefinitionId: 'a' },
    };

    for (const issueType of ATTRIBUTE_REVIEW_ISSUE_TYPE_VALUES) {
      expect(
        validateAttributeFindingSubject({
          issueType,
          subject: validSubjects[issueType],
        }),
      ).toBeNull();
    }
  });
});

/**
 * Lifecycle rules are shared with the Component queue. These tests assert the
 * shared module's contract directly, so a change to it fails here as well as in
 * the component suite.
 */
describe('Shared intelligence lifecycle', () => {
  it('permits all three decisions from PENDING', () => {
    expect(canDecide('PENDING', 'ACCEPTED')).toBe(true);
    expect(canDecide('PENDING', 'REJECTED')).toBe(true);
    expect(canDecide('PENDING', 'DISMISSED')).toBe(true);
  });

  it('never permits acceptance of a stale finding', () => {
    expect(canDecide('STALE', 'ACCEPTED')).toBe(false);
    expect(canDecide('STALE', 'REJECTED')).toBe(true);
    expect(canDecide('STALE', 'DISMISSED')).toBe(true);
  });

  it('treats every decision as terminal', () => {
    for (const status of ['ACCEPTED', 'REJECTED', 'DISMISSED'] as const) {
      expect(canDecide(status, 'ACCEPTED')).toBe(false);
      expect(canDecide(status, 'REJECTED')).toBe(false);
      expect(canDecide(status, 'DISMISSED')).toBe(false);
    }
  });

  it('derives the guarded-update status set per decision', () => {
    expect(decidableStatusesFor('ACCEPTED')).toEqual(['PENDING']);
    expect(decidableStatusesFor('REJECTED')).toEqual(['PENDING', 'STALE']);
    expect(decidableStatusesFor('DISMISSED')).toEqual(['PENDING', 'STALE']);
  });

  it('leaves no decision available on any terminal status', () => {
    const terminal = INTELLIGENCE_FINDING_STATUSES.filter(
      (status) => status !== 'PENDING' && status !== 'STALE',
    );

    expect(terminal).toEqual(['ACCEPTED', 'REJECTED', 'DISMISSED']);
    for (const status of terminal) {
      for (const decision of ['ACCEPTED', 'REJECTED', 'DISMISSED'] as const) {
        expect(canDecide(status, decision)).toBe(false);
      }
    }
  });

  it('maps decisions onto the feedback ledger vocabulary', () => {
    expect(mapDecisionToFeedbackAction('ACCEPTED', false)).toBe('ACCEPTED');
    expect(mapDecisionToFeedbackAction('ACCEPTED', true)).toBe('EDITED');
    expect(mapDecisionToFeedbackAction('REJECTED', false)).toBe('REJECTED');
    expect(mapDecisionToFeedbackAction('DISMISSED', false)).toBe('REJECTED');
    expect(mapDecisionToFeedbackAction('DISMISSED', true)).toBe('REJECTED');
  });

  it('keeps canonical serialization subject-neutral', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(
      stableStringify({ a: 2, b: 1 }),
    );
    expect(stableStringify(undefined)).toBe('null');
    expect(stableStringify(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"');
    expect(stableStringify(Number.NaN)).toBe('null');
  });
});
