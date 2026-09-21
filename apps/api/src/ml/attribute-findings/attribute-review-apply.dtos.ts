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

/** Mutations this pass can perform. */
export const ATTRIBUTE_APPLY_ACTIONS = [
  'ADD_BINDING',
  'REMOVE_BINDING',
] as const;

export type AttributeApplyAction = (typeof ATTRIBUTE_APPLY_ACTIONS)[number];

/**
 * Finding families that may be applied, and the single action each supports.
 *
 * A finding type absent from this table is review-only. `POSSIBLE_DUPLICATE` and
 * `UNUSED_ATTRIBUTE` are deliberately absent: merging two definitions and retiring
 * one are not implemented anywhere in the domain, so there is no authoritative
 * mutation for them to perform. Refusing them here is what keeps the queue from
 * pretending otherwise.
 */
export const ATTRIBUTE_APPLY_RULES: Partial<
  Record<
    AttributeReviewIssueType,
    { action: AttributeApplyAction; label: string }
  >
> = {
  MISSING_EXPECTED_ATTRIBUTE: {
    action: 'ADD_BINDING',
    label: 'Attribute Binding',
  },
  SUSPICIOUS_BINDING: {
    action: 'REMOVE_BINDING',
    label: 'Attribute Binding',
  },
};

export function resolveAttributeApplyRule(
  issueType: string,
): { action: AttributeApplyAction; label: string } | null {
  return ATTRIBUTE_APPLY_RULES[issueType as AttributeReviewIssueType] ?? null;
}

export function isApplicableAttributeFindingType(issueType: string): boolean {
  return resolveAttributeApplyRule(issueType) !== null;
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
}
