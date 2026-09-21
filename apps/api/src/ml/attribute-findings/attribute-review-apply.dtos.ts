import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AttributeReviewIssueType } from './attribute-finding.dtos';

/**
 * Attribute Intelligence Review — application contract (Pass 4).
 *
 * The backend decides *what* each supported finding applies and *how*; the client
 * only says which action it intends and proves it reviewed the current revision.
 * There is no attribute id, category id, sort order or default value in any request
 * DTO, so the apply route cannot be turned into a general write API for the
 * attribute library — the same boundary the component apply contract enforces.
 *
 * The action is REQUIRED and explicit. Inferring a mutation from
 * `decision = ACCEPTED` is exactly what this pass exists to prevent: acceptance is
 * a review act, application is a mutation, and the two must never be conflated.
 */

/**
 * Mutations this pass can perform.
 *
 * `CREATE_DEFINITION` was added in Pass 7. It is the only action that ADDS to the
 * library rather than editing a row that already exists, and it is reachable from
 * exactly one finding family in exactly one state — see
 * {@link resolveAttributeApplyAction}. Nothing else may create an attribute.
 */
export const ATTRIBUTE_APPLY_ACTIONS = [
  'ADD_BINDING',
  'REMOVE_BINDING',
  'CREATE_DEFINITION',
] as const;

export type AttributeApplyAction = (typeof ATTRIBUTE_APPLY_ACTIONS)[number];

/**
 * Finding families that may be applied, and the actions each can perform.
 *
 * A finding type absent from this table is review-only. `POSSIBLE_DUPLICATE` and
 * `UNUSED_ATTRIBUTE` are deliberately absent: merging two definitions and retiring
 * one are not implemented anywhere in the domain, so there is no authoritative
 * mutation for them to perform. Refusing them here is what keeps the queue from
 * pretending otherwise.
 *
 * `actions[0]` is the family's primary action — the one a finding applies when the
 * definition it names already exists. `MISSING_EXPECTED_ATTRIBUTE` is the one
 * family with a second action, because the same expectation can be settled two
 * ways: bind a definition that exists, or create the one that does not. Which one
 * applies is a property of the specific finding, not of the family, so it is
 * decided by {@link resolveAttributeApplyAction} against persisted state.
 */
export const ATTRIBUTE_APPLY_RULES: Partial<
  Record<
    AttributeReviewIssueType,
    { actions: readonly AttributeApplyAction[]; label: string }
  >
> = {
  MISSING_EXPECTED_ATTRIBUTE: {
    actions: ['ADD_BINDING', 'CREATE_DEFINITION'],
    label: 'Attribute Binding',
  },
  SUSPICIOUS_BINDING: {
    actions: ['REMOVE_BINDING'],
    label: 'Attribute Binding',
  },
};

export function resolveAttributeApplyRule(
  issueType: string,
): { actions: readonly AttributeApplyAction[]; label: string } | null {
  return ATTRIBUTE_APPLY_RULES[issueType as AttributeReviewIssueType] ?? null;
}

export function isApplicableAttributeFindingType(issueType: string): boolean {
  return resolveAttributeApplyRule(issueType) !== null;
}

/**
 * The action a specific finding applies, or `null` when none can be justified.
 *
 * This is the single place the create-versus-bind decision is made, and it reads
 * only persisted state:
 *
 *  - a `MISSING_EXPECTED_ATTRIBUTE` whose attribute resolved to a definition is an
 *    `ADD_BINDING`, exactly as before Pass 7;
 *  - the same family with **no** definition and the producer's own
 *    `isExisting: false` is a `CREATE_DEFINITION` — the expectation names an
 *    attribute the library does not have;
 *  - a finding that names no definition while the producer claimed one exists is
 *    neither: it is the audit's `AMBIGUOUS_SUBJECT` case, where the attribute
 *    supposedly exists but could not be pinned. Creating a second definition from
 *    it would be guessing, so the caller refuses it (`UNSUPPORTED_TARGET`), which
 *    is the behaviour it had before this pass.
 *
 * The `isExisting` flag is read from the persisted `suggestedValue`, which the
 * fingerprint hashes — so the create decision is revision-locked: a producer that
 * changes its answer produces a new finding rather than silently re-targeting an
 * approved one.
 */
export function resolveAttributeApplyAction(finding: {
  issueType: string;
  attributeDefinitionId: string | null;
  suggestedValue: Record<string, unknown> | null;
}): AttributeApplyAction | null {
  const rule = resolveAttributeApplyRule(finding.issueType);
  if (!rule) return null;

  if (finding.issueType === 'MISSING_EXPECTED_ATTRIBUTE') {
    if (finding.attributeDefinitionId) return 'ADD_BINDING';
    const isExisting = finding.suggestedValue?.isExisting;
    return isExisting === false ? 'CREATE_DEFINITION' : null;
  }

  return rule.actions[0] ?? null;
}

/**
 * Machine-readable reasons an application request is refused.
 *
 * Returned in the 409 body alongside a human message so a client can react without
 * parsing prose. Every one of these leaves the attribute library untouched; a
 * refusal is never a partial application.
 */
export const ATTRIBUTE_APPLY_CONFLICT_REASONS = [
  /** The finding family has no implemented mutation (duplicates, unused). */
  'UNSUPPORTED_FINDING_TYPE',
  /** The request's action is not the one this finding family supports. */
  'UNSUPPORTED_ACTION',
  /** The finding is not ACCEPTED: apply requires a recorded approval first. */
  'FINDING_NOT_ACCEPTED',
  /** The finding is already applied; applying twice is impossible. */
  'ALREADY_APPLIED',
  /** The finding's expected state no longer holds. */
  'FINDING_STALE',
  /** The finding does not identify a usable target (missing ids, or no definition). */
  'UNSUPPORTED_TARGET',
  /** The target attribute or category does not exist. */
  'TARGET_NOT_FOUND',
  /** The target attribute or category is deactivated. */
  'TARGET_INACTIVE',
  /** ADD_BINDING found the binding already present. */
  'TARGET_ALREADY_EXISTS',
  /** Another apply won the race. */
  'CONCURRENT_APPLICATION',
  /** The mutation was refused by the domain. */
  'DOMAIN_REFUSED',
  /**
   * The persisted proposal failed attribute-definition validation (unknown data
   * type, a unit category the data type cannot carry, a default unit from another
   * dimension, malformed or duplicate options, an unusable code or name). Nothing
   * was created, and the finding is still reviewable: the producer proposed
   * something the library cannot represent, which is a defect to report rather than
   * a transient conflict.
   */
  'INVALID_PROPOSAL',
  /**
   * The transaction exceeded its configured lock or statement bound and was
   * cancelled. The library was not changed and retrying is safe — the only
   * refusal on this route that is worth retrying without a review.
   */
  'APPLY_TIMEOUT',
] as const;

export type AttributeApplyConflictReason =
  (typeof ATTRIBUTE_APPLY_CONFLICT_REASONS)[number];

export class ApplyAttributeFindingDto {
  /**
   * The mutation the reviewer intends. Required, because the whole point of the
   * apply route is that a mutation is an explicit act rather than a side effect of
   * a decision.
   */
  @IsIn([...ATTRIBUTE_APPLY_ACTIONS])
  action!: AttributeApplyAction;

  /**
   * Revision proof. Required: applying without it could mutate the library based on
   * a finding revision the reviewer never saw.
   *
   * This is the finding's OWN persisted fingerprint, sent back so the server can
   * prove the client read the current revision. There is deliberately no way to
   * override the expected state itself — the server always re-derives it from live
   * rows and refuses if it moved.
   */
  @IsString()
  @MaxLength(128)
  expectedFingerprint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNotes?: string;
}

/**
 * What an application did, in enough detail for the queue to update in place.
 *
 * `previousState`/`appliedState` are human-readable descriptions of the binding
 * before and after, so a reviewer can see what changed without a second request.
 */
export interface ApplyAttributeFindingResult {
  findingId: string;
  issueType: string;
  action: AttributeApplyAction;
  applicationResult: 'APPLIED';
  /** The review status is unchanged by applying: it stays ACCEPTED. */
  status: 'ACCEPTED';
  attributeDefinitionId: string;
  attributeCode: string;
  attributeName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  previousState: string;
  appliedState: string;
  fingerprint: string;
  appliedAt: string;
  /** Actor who applied, taken from the authenticated session. */
  appliedById: string | null;
  appliedByEmail: string | null;
  /** The `ai_suggestion_feedback` row recording this application. */
  feedbackId: string | null;
  /** PENDING sibling findings retired because the binding set changed. */
  staledFindingCount: number;
  /**
   * The category/attribute binding this application created, when it created one.
   *
   * Pass 7. Additive and nullable so the existing binding actions keep their
   * existing payload; a `CREATE_DEFINITION` always has one, because creating an
   * expected attribute without binding it would leave the finding's premise
   * unresolved.
   */
  bindingId: string | null;
  /**
   * Identity of the attribute definition this application created, or `null` when
   * it applied to a definition that already existed.
   *
   * Present so the queue can say "created" rather than "bound" and link the
   * reviewer to the new record without inferring it from the action.
   */
  createdDefinition: {
    id: string;
    code: string;
    name: string;
    dataType: string;
    unitCategory: string | null;
    defaultUnit: string | null;
    optionCount: number;
  } | null;
}
