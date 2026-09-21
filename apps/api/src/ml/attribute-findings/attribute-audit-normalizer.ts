import type { AttributeAuditIssueDto } from '../dtos';
import type {
  AttributeReviewIssueType,
  PersistAttributeFindingInput,
} from './attribute-finding.dtos';
import {
  buildBindingExpectedState,
  buildExpectedAttributeState,
  buildRelationshipExpectedState,
  buildUnusedAttributeState,
  normalizeAttributeCode,
  normalizeAttributeKey,
  type AttributeIdentitySnapshot,
  type CategorySnapshot,
} from './attribute-finding-expected-state';
import type {
  AttributeAuditSkip,
  AttributeAuditSource,
  AttributeAuditWarningCode,
} from './attribute-audit.dtos';

/**
 * Turns the *existing* Attribute Intelligence audit output into reviewable
 * findings.
 *
 * Pure: it takes the producer's issues plus a snapshot of the library and returns
 * finding inputs and warnings. No database access, no fingerprints, no persistence
 * — so every normalization rule is unit-testable and the analyzer stays a thin
 * orchestrator.
 *
 * Two rules govern everything below:
 *
 *  1. **No new intelligence.** The producer decides *what* is worth reviewing; this
 *     module only decides how to represent it. Where the producer does not say
 *     something (a similarity score for a non-duplicate family, a proposed action
 *     for an unused attribute), the finding says nothing rather than guessing.
 *  2. **No invented master data.** A subject is only written as a foreign key when
 *     the row exists. An expectation about an attribute that does not exist yet
 *     carries the canonical code and keeps `attributeDefinitionId` null, which is
 *     what Pass 1's subject rules allow for that finding type.
 */

/** Authoritative library state the producer's identifiers are resolved against. */
export interface AttributeAuditSubjectIndex {
  definitionsById: Map<string, AttributeIdentitySnapshot>;
  /** Reduced code/name/alias → definitive match, or `null` when ambiguous. */
  definitionsByKey: Map<string, AttributeIdentitySnapshot | null>;
  categoriesById: Map<string, CategorySnapshot>;
  /** Component value counts by attribute definition id. */
  componentValueCounts: Map<string, number>;
  /** Direct category binding counts by attribute definition id. */
  bindingCounts: Map<string, number>;
}

export interface NormalizeAttributeAuditInput {
  issues: AttributeAuditIssueDto[];
  index: AttributeAuditSubjectIndex;
  source: AttributeAuditSource;
  intelligenceVersion: string;
  modelVersion: string;
}

export interface NormalizeAttributeAuditResult {
  findings: PersistAttributeFindingInput[];
  /** Everything the run could not persist, or persisted only in part. */
  warnings: AttributeAuditSkip[];
}

/**
 * Producer issue type → persisted issue type.
 *
 * The producer emits `DUPLICATE_ATTRIBUTE` for a *lexically similar* pair: the
 * audit's 0.78 similarity threshold is a "these look like the same thing" signal,
 * not proof of identity. The Review Queue has always normalized it to
 * `POSSIBLE_DUPLICATE` for display, so that is the form persisted here; the
 * producer's own name is retained in `metadata.producerIssueType`. Every other
 * produced type already matches the Pass 1 vocabulary and maps 1:1.
 *
 * `SUGGESTED_BINDING`, `SUGGESTED_ENUM_VALUE` and `INCONSISTENT_CONFIG` are declared
 * by the producer's DTO union but emitted by no producer, so no issue of those
 * types reaches this mapping today.
 */
const PRODUCER_TO_PERSISTED_TYPE: Record<string, AttributeReviewIssueType> = {
  DUPLICATE_ATTRIBUTE: 'POSSIBLE_DUPLICATE',
  SUSPICIOUS_BINDING: 'SUSPICIOUS_BINDING',
  MISSING_EXPECTED_ATTRIBUTE: 'MISSING_EXPECTED_ATTRIBUTE',
  UNUSED_ATTRIBUTE: 'UNUSED_ATTRIBUTE',
};

export function resolvePersistedIssueType(
  producerIssueType: string,
): AttributeReviewIssueType | null {
  return PRODUCER_TO_PERSISTED_TYPE[producerIssueType] ?? null;
}

interface NormalizeContext extends NormalizeAttributeAuditInput {
  issue: AttributeAuditIssueDto;
  persistedType: AttributeReviewIssueType;
}

type NormalizeOneResult =
  | {
      finding: PersistAttributeFindingInput;
      duplicateKey: string | null;
      /** Notes about a finding that was still persisted (resolution fell back). */
      warnings?: AttributeAuditSkip[];
    }
  | { skip: AttributeAuditSkip };

/**
 * Normalizes one audit run.
 *
 * Skips are returned rather than thrown: one unresolvable subject must not abort a
 * whole-library audit, and a silently dropped finding would make the queue lie
 * about what the intelligence found.
 */
export function normalizeAttributeAudit(
  input: NormalizeAttributeAuditInput,
): NormalizeAttributeAuditResult {
  const findings: PersistAttributeFindingInput[] = [];
  const warnings: AttributeAuditSkip[] = [];
  const collapsedKeys = new Map<string, string>();

  for (const issue of input.issues ?? []) {
    const persistedType = resolvePersistedIssueType(issue.type);
    if (!persistedType) {
      warnings.push(
        buildWarning(
          'UNSUPPORTED_PRODUCER_ISSUE_TYPE',
          issue,
          `The producer reported '${issue.type}', which this pass does not persist. No issue of that type is currently produced by Attribute Intelligence.`,
        ),
      );
      continue;
    }

    const result = normalizeIssue({ ...input, issue, persistedType });

    if ('skip' in result) {
      warnings.push(result.skip);
      continue;
    }

    if (result.warnings) warnings.push(...result.warnings);

    // Two producer issues can describe one condition (for example the same pair
    // reported through two code paths). The fingerprint layer collapses them in the
    // database; reporting the collapse keeps the summary honest about the loss.
    if (result.duplicateKey) {
      const previous = collapsedKeys.get(result.duplicateKey);
      if (previous) {
        warnings.push(
          buildWarning(
            'DUPLICATE_FINDING_COLLAPSED',
            issue,
            `Another issue in this run already describes the same ${persistedType} condition (producer issue ${previous}); the later one was not persisted separately.`,
          ),
        );
        continue;
      }
      collapsedKeys.set(result.duplicateKey, issue.id ?? 'unknown');
    }

    findings.push(result.finding);
  }

  return { findings, warnings };
}

function normalizeIssue(context: NormalizeContext): NormalizeOneResult {
  switch (context.persistedType) {
    case 'POSSIBLE_DUPLICATE':
      return normalizeDuplicate(context);
    case 'SUSPICIOUS_BINDING':
      return normalizeSuspiciousBinding(context);
    case 'MISSING_EXPECTED_ATTRIBUTE':
      return normalizeExpectedAttribute(context);
    case 'UNUSED_ATTRIBUTE':
      return normalizeUnused(context);
    default:
      return {
        skip: buildWarning(
          'UNSUPPORTED_PRODUCER_ISSUE_TYPE',
          context.issue,
          `No normalizer is implemented for '${context.persistedType}', so no issue of that type could be persisted.`,
        ),
      };
  }
}

function normalizeDuplicate(context: NormalizeContext): NormalizeOneResult {
  const { issue, index, persistedType } = context;

  const primary = readId(issue.attributeId);
  const related = readPayloadString(issue.payload, 'targetAttributeId');

  if (!primary || !related) {
    return {
      skip: buildWarning(
        'MALFORMED_PRODUCER_ISSUE',
        issue,
        `A ${persistedType} finding needs both attributes of the pair: the producer supplied ${primary ? 'the first attribute only' : 'no attribute'}${related ? '' : ' and no payload.targetAttributeId'}.`,
      ),
    };
  }

  const first = index.definitionsById.get(primary);
  const second = index.definitionsById.get(related);
  if (!first || !second) {
    return {
      skip: buildWarning(
        'MISSING_SUBJECT',
        issue,
        `A ${persistedType} finding references an attribute definition that is not in the library (${!first ? primary : related}).`,
      ),
    };
  }

  const expectedState = buildRelationshipExpectedState({ first, second });
  const canonical = expectedState.attributeA;
  const counterpart = expectedState.attributeB;

  return {
    finding: {
      issueType: persistedType,
      attributeDefinitionId: canonical.id,
      relatedAttributeDefinitionId: counterpart.id,
      title: buildTitle({
        producerTitle: issue.title,
        persistedType,
        attributeName: canonical.name,
        relatedAttributeName: counterpart.name,
        categoryName: null,
        expectedAttributeName: null,
      }),
      description: buildDescription(issue),
      currentValue: asJson(expectedState),
      // Only the rule is proposed. The similarity score measures the two names and
      // is already the producer's evidence; promoting it to suggested state would
      // put a re-derivable measurement into the fingerprint.
      suggestedValue: {
        rule: expectedState.rule,
        matchType: expectedState.rule,
      },
      confidence: issue.confidence ?? null,
      confidenceLevel: issue.confidenceLevel ?? null,
      evidence: toPersistedEvidence(issue.evidence),
      source: context.source,
      modelVersion: context.modelVersion,
      intelligenceVersion: context.intelligenceVersion,
      metadata: {
        producerIssueType: issue.type,
        producerIssueId: issue.id ?? null,
        producerSeverity: issue.severity ?? null,
        expectedState,
        producerObservations: {
          similarity: readPayloadNumber(issue.payload, 'similarity'),
          targetAttributeCode:
            readPayloadString(issue.payload, 'targetAttributeCode') ??
            counterpart.code,
        },
      },
    },
    duplicateKey: `${persistedType}:${canonical.id}:${counterpart.id}`,
  };
}

function normalizeSuspiciousBinding(
  context: NormalizeContext,
): NormalizeOneResult {
  const { issue, index, persistedType } = context;

  const attributeId = readId(issue.attributeId);
  const categoryId = readId(issue.categoryId);
  if (!attributeId || !categoryId) {
    return {
      skip: buildWarning(
        'MALFORMED_PRODUCER_ISSUE',
        issue,
        `A ${persistedType} finding needs both the attribute and the category it is bound to.`,
      ),
    };
  }

  const attribute = index.definitionsById.get(attributeId);
  const category = index.categoriesById.get(categoryId);
  if (!attribute || !category) {
    return {
      skip: buildWarning(
        'MISSING_SUBJECT',
        issue,
        `A ${persistedType} finding references a subject that is not in the library (${!attribute ? `attribute ${attributeId}` : `category ${categoryId}`}).`,
      ),
    };
  }

  const usageCount =
    readPayloadNumber(issue.payload, 'usageCount') ??
    index.componentValueCounts.get(attributeId) ??
    0;

  const expectedState = buildBindingExpectedState({
    attribute,
    category,
    componentValueCount: usageCount,
  });

  return {
    finding: {
      issueType: persistedType,
      attributeDefinitionId: attribute.id,
      categoryId: category.id,
      title: buildTitle({
        producerTitle: issue.title,
        persistedType,
        attributeName: attribute.name,
        relatedAttributeName: null,
        categoryName: category.name,
        expectedAttributeName: null,
      }),
      description: buildDescription(issue),
      currentValue: asJson(expectedState),
      // The one action the Review Queue has ever offered for this family is an
      // unbind, which is what its accept handler calls. That is recorded as the
      // proposed action; nothing is removed by this pass.
      suggestedValue: {
        rule: expectedState.rule,
        suggestedAction: 'REMOVE_BINDING',
      },
      confidence: issue.confidence ?? null,
      confidenceLevel: issue.confidenceLevel ?? null,
      evidence: toPersistedEvidence(issue.evidence),
      source: context.source,
      modelVersion: context.modelVersion,
      intelligenceVersion: context.intelligenceVersion,
      metadata: {
        producerIssueType: issue.type,
        producerIssueId: issue.id ?? null,
        producerSeverity: issue.severity ?? null,
        expectedState,
        producerObservations: { usageCount },
      },
    },
    duplicateKey: `${persistedType}:${category.id}:${attribute.id}`,
  };
}

function normalizeExpectedAttribute(
  context: NormalizeContext,
): NormalizeOneResult {
  const { issue, index, persistedType } = context;

  const categoryId = readId(issue.categoryId);
  if (!categoryId) {
    return {
      skip: buildWarning(
        'MALFORMED_PRODUCER_ISSUE',
        issue,
        `A ${persistedType} finding needs the category it applies to.`,
      ),
    };
  }

  const category = index.categoriesById.get(categoryId);
  if (!category) {
    return {
      skip: buildWarning(
        'MISSING_SUBJECT',
        issue,
        `A ${persistedType} finding references category ${categoryId}, which is not in the library.`,
      ),
    };
  }

  const canonicalCode =
    readPayloadString(issue.payload, 'canonicalCode') ??
    readId(issue.attributeCode);
  const canonicalName =
    readPayloadString(issue.payload, 'canonicalName') ??
    readId(issue.attributeName);

  if (!canonicalCode || !canonicalName) {
    return {
      skip: buildWarning(
        'MALFORMED_PRODUCER_ISSUE',
        issue,
        `A ${persistedType} finding needs the canonical code and name of the attribute the category is missing.`,
      ),
    };
  }

  const declaredExisting =
    readPayloadBoolean(issue.payload, 'isExisting') ??
    Boolean(readId(issue.attributeId));

  // Resolve the definition the producer pointed at, by id and then by code. A
  // finding may safely exist without one: the category-first form keeps
  // `attributeDefinitionId` null and carries the code instead, so no definition is
  // invented and no foreign key is faked.
  const resolution = resolveExpectedAttribute({
    index,
    declaredAttributeId: readId(issue.attributeId),
    declaredAttributeCode: readId(issue.attributeCode),
    canonicalCode,
  });

  const warnings: AttributeAuditSkip[] = [];
  if (declaredExisting && !resolution.attribute) {
    warnings.push(
      buildWarning(
        'AMBIGUOUS_SUBJECT',
        issue,
        resolution.ambiguous
          ? `The ${persistedType} issue declares an existing attribute, but code '${canonicalCode}' matches more than one definition; the finding was persisted category-first with no attribute reference rather than guessing one.`
          : `The ${persistedType} issue declares an existing attribute, but it could not be resolved in the library; the finding was persisted category-first with no attribute reference.`,
      ),
    );
  }

  const expectedState = buildExpectedAttributeState({
    category,
    expectedAttributeCode: canonicalCode,
    expectedAttributeName: canonicalName,
    existingAttribute: resolution.attribute,
  });

  return {
    finding: {
      issueType: persistedType,
      attributeDefinitionId: resolution.attribute?.id ?? null,
      categoryId: category.id,
      // Carried even when the definition exists, so the queue can always show
      // which canonical attribute the expectation names.
      attributeCode: normalizeAttributeCode(canonicalCode),
      categoryCode: category.code,
      title: buildTitle({
        producerTitle: issue.title,
        persistedType,
        attributeName: resolution.attribute?.name ?? null,
        relatedAttributeName: null,
        categoryName: category.name,
        expectedAttributeName: canonicalName,
      }),
      description: buildDescription(issue),
      currentValue: asJson(expectedState),
      suggestedValue: {
        rule: expectedState.rule,
        suggestedAction: 'BIND_ATTRIBUTE',
        canonicalCode: normalizeAttributeCode(canonicalCode),
        canonicalName,
        isExisting: expectedState.attributeExists,
        dataType: readPayloadString(issue.payload, 'dataType'),
        unitCategory: readPayloadString(issue.payload, 'unitCategory'),
        defaultUnit: readPayloadString(issue.payload, 'defaultUnit'),
        groupName: readPayloadString(issue.payload, 'group'),
        // Recorded by the producer per issue; the legacy queue carried it as
        // `suggestedRequired`, and no producer ever sets it true.
        isRequired:
          readPayloadBoolean(issue.payload, 'suggestedRequired') ?? false,
      },
      confidence: issue.confidence ?? null,
      confidenceLevel: issue.confidenceLevel ?? null,
      evidence: toPersistedEvidence(issue.evidence),
      source: context.source,
      modelVersion: context.modelVersion,
      intelligenceVersion: context.intelligenceVersion,
      metadata: {
        producerIssueType: issue.type,
        producerIssueId: issue.id ?? null,
        producerSeverity: issue.severity ?? null,
        expectedState,
        producerObservations: {
          declaredExisting,
          resolvedExistingAttributeId: resolution.attribute?.id ?? null,
        },
      },
    },
    duplicateKey: `${persistedType}:${category.id}:${normalizeAttributeKey(canonicalCode)}`,
    // Ambiguity is reported alongside the finding rather than instead of it: the
    // finding is still reviewable (it names a category and a canonical code), and
    // discarding it would lose the intelligence.
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function normalizeUnused(context: NormalizeContext): NormalizeOneResult {
  const { issue, index, persistedType } = context;

  const attributeId = readId(issue.attributeId);
  if (!attributeId) {
    return {
      skip: buildWarning(
        'MALFORMED_PRODUCER_ISSUE',
        issue,
        `A ${persistedType} finding needs the attribute it is about.`,
      ),
    };
  }

  const attribute = index.definitionsById.get(attributeId);
  if (!attribute) {
    return {
      skip: buildWarning(
        'MISSING_SUBJECT',
        issue,
        `A ${persistedType} finding references attribute ${attributeId}, which is not in the library.`,
      ),
    };
  }

  const componentValueCount =
    readPayloadNumber(issue.payload, 'usageCount') ??
    index.componentValueCounts.get(attributeId) ??
    0;
  const directBindingCount =
    readPayloadNumber(issue.payload, 'bindingCount') ??
    index.bindingCounts.get(attributeId) ??
    0;

  const expectedState = buildUnusedAttributeState({
    attribute,
    componentValueCount,
    directBindingCount,
  });

  return {
    finding: {
      issueType: persistedType,
      attributeDefinitionId: attribute.id,
      attributeCode: attribute.code,
      title: buildTitle({
        producerTitle: issue.title,
        persistedType,
        attributeName: attribute.name,
        relatedAttributeName: null,
        categoryName: null,
        expectedAttributeName: null,
      }),
      description: buildDescription(issue),
      currentValue: asJson(expectedState),
      // The producer proposes no action for an unused attribute, and neither does
      // the Review Queue (it offers no accept action for this family), so no
      // suggestion is fabricated.
      suggestedValue: null,
      confidence: issue.confidence ?? null,
      confidenceLevel: issue.confidenceLevel ?? null,
      evidence: toPersistedEvidence(issue.evidence),
      source: context.source,
      modelVersion: context.modelVersion,
      intelligenceVersion: context.intelligenceVersion,
      metadata: {
        producerIssueType: issue.type,
        producerIssueId: issue.id ?? null,
        producerSeverity: issue.severity ?? null,
        expectedState,
        producerObservations: { componentValueCount, directBindingCount },
      },
    },
    duplicateKey: `${persistedType}:${attribute.id}`,
  };
}

// ---------------------------------------------------------------------------
// Shared normalization helpers
// ---------------------------------------------------------------------------

/**
 * Builds the human-readable title, worded exactly as the Review Queue words it so a
 * persisted finding reads the same as the queue a reviewer already knows. A
 * producer-supplied title wins, matching the queue's own precedence.
 */
function buildTitle(input: {
  producerTitle?: string | null;
  persistedType: AttributeReviewIssueType;
  attributeName: string | null;
  relatedAttributeName: string | null;
  categoryName: string | null;
  expectedAttributeName: string | null;
}): string {
  if (input.producerTitle && input.producerTitle.trim().length > 0) {
    return input.producerTitle.trim();
  }
  const attribute = input.attributeName ?? 'Attribute';
  const category = input.categoryName ?? 'Category';

  switch (input.persistedType) {
    case 'POSSIBLE_DUPLICATE':
      return input.relatedAttributeName
        ? `Possible Duplicate: "${attribute}" & "${input.relatedAttributeName}"`
        : `Possible Duplicate: "${attribute}"`;
    case 'SUSPICIOUS_BINDING':
      return `Unbind suspicious "${attribute}" from "${category}"`;
    case 'MISSING_EXPECTED_ATTRIBUTE':
      return `Bind "${input.expectedAttributeName ?? attribute}" to category "${category}"`;
    case 'UNUSED_ATTRIBUTE':
      return `Unused Attribute: "${attribute}"`;
    default:
      return `${input.persistedType}: "${attribute}"`;
  }
}

/**
 * Description, taken from the producer's reason.
 *
 * The producers always supply one; the fallbacks exist so a missing reason cannot
 * produce an empty `description` (a NOT NULL column) and lose the finding.
 */
function buildDescription(issue: AttributeAuditIssueDto): string {
  const candidates = [issue.reason, issue.subtitle, issue.title];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return `Attribute Intelligence reported a ${issue.type} condition.`;
}

/**
 * Converts the producer's evidence to the persisted shape.
 *
 * Mechanical only: the fields the producer supplies are carried across unchanged.
 * No source document, probability or reasoning is added, because the analysis did
 * not produce one — an invented citation would be worse than no citation.
 */
function toPersistedEvidence(
  evidence: AttributeAuditIssueDto['evidence'],
): Array<Record<string, unknown>> {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter(
      (item): item is NonNullable<typeof item> =>
        Boolean(item) && typeof item === 'object',
    )
    .map((item) => {
      const record: Record<string, unknown> = {
        type: item.type,
        description: item.description,
        weight: item.weight,
      };
      if (item.source) record.source = item.source;
      return record;
    });
}

function buildWarning(
  code: AttributeAuditWarningCode,
  issue: AttributeAuditIssueDto,
  message: string,
): AttributeAuditSkip {
  return {
    code,
    producerIssueId: issue.id ?? null,
    producerIssueType: issue.type ?? null,
    message,
  };
}

function asJson(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

/** Narrows a producer-supplied identifier to a usable string. */
function readId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Producer-supplied payload keys, read defensively because jsonb is untyped. */
function readPayloadString(
  payload: Record<string, unknown> | undefined,
  key: string,
): string | null {
  return readId(payload?.[key]);
}

function readPayloadBoolean(
  payload: Record<string, unknown> | undefined,
  key: string,
): boolean | null {
  const value = payload?.[key];
  return typeof value === 'boolean' ? value : null;
}

function readPayloadNumber(
  payload: Record<string, unknown> | undefined,
  key: string,
): number | null {
  const value = payload?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Finds the definition an expectation points at.
 *
 * Tried in the producer's own order of confidence: the identifier it supplied, then
 * the code it declared, then the canonical code. A reduced key that matches more
 * than one definition resolves to nothing and is reported as ambiguous — the
 * audit's own matching is a reduced-key comparison, so two definitions can
 * legitimately collide, and guessing between them would attach the finding to the
 * wrong attribute.
 */
export function resolveExpectedAttribute(input: {
  index: Pick<
    AttributeAuditSubjectIndex,
    'definitionsById' | 'definitionsByKey'
  >;
  declaredAttributeId: string | null;
  declaredAttributeCode: string | null;
  canonicalCode: string;
}): { attribute: AttributeIdentitySnapshot | null; ambiguous: boolean } {
  if (input.declaredAttributeId) {
    const byId = input.index.definitionsById.get(input.declaredAttributeId);
    if (byId) return { attribute: byId, ambiguous: false };
  }

  for (const candidate of [input.declaredAttributeCode, input.canonicalCode]) {
    if (!candidate) continue;
    const key = normalizeAttributeKey(candidate);
    if (!key) continue;
    if (input.index.definitionsByKey.has(key)) {
      const match = input.index.definitionsByKey.get(key) ?? null;
      return { attribute: match, ambiguous: match === null };
    }
  }

  return { attribute: null, ambiguous: false };
}

/**
 * Builds the reduced-key lookup used for subject resolution.
 *
 * A key two definitions claim maps to `null`, which every caller reads as
 * "ambiguous, do not guess".
 */
export function buildDefinitionKeyIndex(
  definitions: AttributeIdentitySnapshot[],
): Map<string, AttributeIdentitySnapshot | null> {
  const index = new Map<string, AttributeIdentitySnapshot | null>();
  for (const definition of definitions) {
    const keys = new Set<string>([
      normalizeAttributeKey(definition.code),
      normalizeAttributeKey(definition.name),
      ...definition.aliases.map((alias) => normalizeAttributeKey(alias)),
    ]);
    for (const key of keys) {
      if (!key) continue;
      if (!index.has(key)) {
        index.set(key, definition);
        continue;
      }
      const existing = index.get(key);
      if (existing && existing.id !== definition.id) {
        index.set(key, null);
      }
    }
  }
  return index;
}
