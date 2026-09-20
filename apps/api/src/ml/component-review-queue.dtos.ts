import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Canonical Component Intelligence Review Queue contracts.
 *
 * These values are persisted as varchar columns on
 * `component_intelligence_findings` and mirrored in API payloads.
 */

export const COMPONENT_REVIEW_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'DISMISSED',
  'STALE',
] as const;

export type ComponentReviewStatus = (typeof COMPONENT_REVIEW_STATUSES)[number];

export const COMPONENT_REVIEW_DECISIONS = [
  'ACCEPTED',
  'REJECTED',
  'DISMISSED',
] as const;

export type ComponentReviewDecision =
  (typeof COMPONENT_REVIEW_DECISIONS)[number];

/**
 * Finding taxonomy used by the Component queue. The Attribute queue keeps its
 * own taxonomy; these categories describe component-level problems only.
 */
export const COMPONENT_REVIEW_ISSUE_CATEGORIES = [
  'IDENTITY',
  'CLASSIFICATION',
  'DUPLICATE',
  'DATA_QUALITY',
] as const;

export type ComponentReviewIssueCategory =
  (typeof COMPONENT_REVIEW_ISSUE_CATEGORIES)[number];

/**
 * Canonical issue-type taxonomy for the Component Review Queue.
 *
 * This is the single source of truth consumed by the analyzer, the audit
 * response, and tests. Adding a rule requires adding its type here so the
 * contract cannot drift.
 */
export type ComponentReviewIssueType =
  | 'MPN_MISSING'
  | 'MPN_CONFLICT'
  | 'MANUFACTURER_UNRESOLVED'
  | 'MANUFACTURER_CONFLICT'
  | 'CATEGORY_UNRESOLVED'
  | 'CATEGORY_CONFLICT'
  | 'EXACT_DUPLICATE'
  | 'POTENTIAL_DUPLICATE';

export const COMPONENT_REVIEW_ISSUE_TYPES: Record<
  ComponentReviewIssueCategory,
  readonly ComponentReviewIssueType[]
> = {
  IDENTITY: [
    'MPN_MISSING',
    'MPN_CONFLICT',
    'MANUFACTURER_UNRESOLVED',
    'MANUFACTURER_CONFLICT',
  ],
  CLASSIFICATION: ['CATEGORY_UNRESOLVED', 'CATEGORY_CONFLICT'],
  DUPLICATE: ['EXACT_DUPLICATE', 'POTENTIAL_DUPLICATE'],
  DATA_QUALITY: [],
};

/** Flat, ordered view of {@link COMPONENT_REVIEW_ISSUE_TYPES}. */
export const COMPONENT_REVIEW_ISSUE_TYPE_VALUES: readonly ComponentReviewIssueType[] =
  COMPONENT_REVIEW_ISSUE_CATEGORIES.flatMap(
    (category) => COMPONENT_REVIEW_ISSUE_TYPES[category],
  );

export const CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const COMPONENT_REVIEW_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'confidence',
] as const;

export type ComponentReviewSortField =
  (typeof COMPONENT_REVIEW_SORT_FIELDS)[number];

/** Analysis scopes accepted by the component review audit endpoint. */
export const COMPONENT_REVIEW_AUDIT_SCOPES = [
  'SELECTED',
  'RECENTLY_UPDATED',
  'ALL',
] as const;

export type ComponentReviewAuditScope =
  (typeof COMPONENT_REVIEW_AUDIT_SCOPES)[number];

/**
 * Audits are bounded because every analyzed component performs a full
 * intelligence lookup. Full-catalog sweeps run as repeated bounded audits.
 */
export const DEFAULT_COMPONENT_AUDIT_LIMIT = 25;
export const MAX_COMPONENT_AUDIT_LIMIT = 100;
export const MAX_COMPONENT_AUDIT_WINDOW_DAYS = 365;

export class PersistComponentFindingItemDto {
  @IsUUID()
  componentId!: string;

  @IsOptional()
  @IsUUID()
  relatedComponentId?: string;

  @IsIn([...COMPONENT_REVIEW_ISSUE_TYPE_VALUES])
  issueType!: ComponentReviewIssueType;

  @IsIn([...COMPONENT_REVIEW_ISSUE_CATEGORIES])
  issueCategory!: ComponentReviewIssueCategory;

  /** Reviewed component field (e.g. `manufacturer`, `attributes.voltage_rating`). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  field?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  currentValue?: Record<string, unknown> | null;

  @IsOptional()
  suggestedValue?: Record<string, unknown> | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsIn([...CONFIDENCE_LEVELS])
  confidenceLevel?: ConfidenceLevel;

  @IsOptional()
  @IsArray()
  evidence?: Array<Record<string, unknown>>;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  source!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  modelVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  intelligenceVersion?: string;

  /**
   * Snapshot of the component's `updatedAt` at analysis time. Used to refuse
   * reviewer decisions once the component has changed underneath the finding.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  componentUpdatedAt?: string;

  @IsOptional()
  metadata?: Record<string, unknown> | null;
}

export class PersistComponentFindingsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PersistComponentFindingItemDto)
  findings!: PersistComponentFindingItemDto[];
}

export class ListComponentFindingsQueryDto {
  /** Comma-separated statuses, e.g. `PENDING,STALE`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  status?: string;

  @IsOptional()
  @IsIn([...COMPONENT_REVIEW_ISSUE_CATEGORIES])
  issueCategory?: ComponentReviewIssueCategory;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  issueType?: string;

  @IsOptional()
  @IsUUID()
  componentId?: string;

  @IsOptional()
  @IsIn([...CONFIDENCE_LEVELS])
  confidenceLevel?: ConfidenceLevel;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn([...COMPONENT_REVIEW_SORT_FIELDS])
  sortBy?: ComponentReviewSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}

export class RecordComponentFindingDecisionDto {
  @IsIn([...COMPONENT_REVIEW_DECISIONS])
  decision!: ComponentReviewDecision;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNotes?: string;

  /** Optimistic concurrency token; rejected with 409 when it no longer matches. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  expectedFingerprint?: string;

  @IsOptional()
  finalValue?: unknown;
}

export class MarkComponentFindingsStaleDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  ids?: string[];

  @IsOptional()
  @IsUUID()
  componentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RunComponentAuditDto {
  /** Defaults to `SELECTED`, which requires at least one component id. */
  @IsOptional()
  @IsIn([...COMPONENT_REVIEW_AUDIT_SCOPES])
  scope?: ComponentReviewAuditScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_COMPONENT_AUDIT_LIMIT)
  @IsUUID(undefined, { each: true })
  componentIds?: string[];

  /** Lookback window for the `RECENTLY_UPDATED` scope (default 30 days). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_COMPONENT_AUDIT_WINDOW_DAYS)
  sinceDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_COMPONENT_AUDIT_LIMIT)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}
