import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

/**
 * Component Intelligence Review — application contract (Pass 4).
 *
 * The backend decides which component field each finding type may write. The
 * client never sends a field path or an arbitrary value: it only identifies the
 * finding (by id) and proves it reviewed the current revision (by fingerprint).
 * This keeps the review queue from becoming a generic write API.
 */

/**
 * Finding types whose accepted suggestion may be written to the component.
 *
 * Duplicate findings are deliberately absent: merging or deleting components is
 * not implemented, so those findings remain review-only.
 */
export const APPLICABLE_FINDING_TYPES = [
  'MPN_MISSING',
  'MPN_CONFLICT',
  'MANUFACTURER_UNRESOLVED',
  'MANUFACTURER_CONFLICT',
  'CATEGORY_UNRESOLVED',
  'CATEGORY_CONFLICT',
  'ATTRIBUTE_VALUE_SUGGESTION',
] as const;

export type ApplicableFindingType = (typeof APPLICABLE_FINDING_TYPES)[number];

/** Component fields the queue is allowed to write, one per finding type. */
export type ApplicableComponentField =
  'manufacturerPartNumber' | 'manufacturerId' | 'categoryId' | 'attributes';

/**
 * How an application reaches the component.
 *
 *  - `mpn`       normalizes and guards a part number, then patches the field
 *  - `entity`    resolves an active ERP row (manufacturer / category)
 *  - `attribute` writes a component attribute VALUE through the existing
 *                attribute use case; `field` is only a label for this kind and
 *                never a component column
 */
export interface ComponentApplyRule {
  field: ApplicableComponentField;
  kind: 'mpn' | 'entity' | 'attribute';
  entity?: 'manufacturer' | 'category';
  /** Human label used in confirmation copy and audit details. */
  label: string;
}

/**
 * Explicit finding type → component field mapping.
 *
 * Anything not listed here is rejected with `UNSUPPORTED_FINDING_TYPE`, so a
 * new finding type cannot silently gain write access.
 */
export const COMPONENT_APPLY_RULES: Record<
  ApplicableFindingType,
  ComponentApplyRule
> = {
  MPN_MISSING: {
    field: 'manufacturerPartNumber',
    kind: 'mpn',
    label: 'Manufacturer Part Number',
  },
  MPN_CONFLICT: {
    field: 'manufacturerPartNumber',
    kind: 'mpn',
    label: 'Manufacturer Part Number',
  },
  MANUFACTURER_UNRESOLVED: {
    field: 'manufacturerId',
    kind: 'entity',
    entity: 'manufacturer',
    label: 'Manufacturer',
  },
  MANUFACTURER_CONFLICT: {
    field: 'manufacturerId',
    kind: 'entity',
    entity: 'manufacturer',
    label: 'Manufacturer',
  },
  CATEGORY_UNRESOLVED: {
    field: 'categoryId',
    kind: 'entity',
    entity: 'category',
    label: 'Category',
  },
  CATEGORY_CONFLICT: {
    field: 'categoryId',
    kind: 'entity',
    entity: 'category',
    label: 'Category',
  },
  /**
   * A specification extracted from a datasheet, applied to the component's
   * attribute values. The attribute definition and the value both come from the
   * finding, never from the request, and the write goes through the existing
   * `SaveComponentAttributes` use case inside the apply transaction.
   */
  ATTRIBUTE_VALUE_SUGGESTION: {
    field: 'attributes',
    kind: 'attribute',
    label: 'Attribute Value',
  },
};

export function resolveApplyRule(issueType: string): ComponentApplyRule | null {
  return COMPONENT_APPLY_RULES[issueType as ApplicableFindingType] ?? null;
}

export function isApplicableFindingType(
  issueType: string,
): issueType is ApplicableFindingType {
  return resolveApplyRule(issueType) !== null;
}

/**
 * Machine-readable reasons an application request is refused.
 *
 * Returned in the 409 body alongside a human message so clients can react
 * without parsing prose.
 */
export const APPLY_CONFLICT_REASONS = [
  /** The finding type has no defined field mutation (e.g. duplicates). */
  'UNSUPPORTED_FINDING_TYPE',
  /** The finding is not PENDING (already decided, or stale). */
  'FINDING_NOT_PENDING',
  /** The reviewer's loaded revision no longer matches the stored finding. */
  'FINGERPRINT_MISMATCH',
  /** The component changed after the finding was generated. */
  'COMPONENT_CHANGED',
  /** The suggested manufacturer/category no longer exists. */
  'SUGGESTED_ENTITY_NOT_FOUND',
  /** The suggested manufacturer/category is deactivated. */
  'SUGGESTED_ENTITY_INACTIVE',
  /** The suggested value failed validation for its field. */
  'INVALID_SUGGESTED_VALUE',
  /** The component was consolidated/retired and may no longer be written to. */
  'COMPONENT_RETIRED',
  /** The component's attribute value changed after the finding was generated. */
  'ATTRIBUTE_VALUE_CHANGED',
] as const;

export type ApplyConflictReason = (typeof APPLY_CONFLICT_REASONS)[number];

export class ApplyComponentFindingDto {
  /**
   * Revision proof. Required: applying without it could overwrite a decision
   * made against a newer revision of the finding.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  expectedFingerprint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNotes?: string;
}

export interface AppliedComponentSummary {
  id: string;
  sku: string;
  name: string;
  manufacturerPartNumber: string | null;
  manufacturerId: string | null;
  categoryId: string | null;
  updatedAt: string;
}

export interface ApplyComponentFindingResult {
  findingId: string;
  componentId: string;
  issueType: string;
  /** Component field that was written. */
  field: ApplicableComponentField;
  /** Field label for display (e.g. "Manufacturer Part Number"). */
  fieldLabel: string;
  previousValue: string | null;
  appliedValue: string | null;
  /** Display name of the applied entity, when the field is a reference. */
  appliedValueLabel: string | null;
  fingerprint: string;
  appliedAt: string;
  reviewerId: string | null;
  reviewerEmail: string | null;
  component: AppliedComponentSummary;
  /** Findings of the same component moved to STALE because it changed. */
  staledFindingCount: number;
}
