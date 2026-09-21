import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ATTRIBUTE_REVIEW_DECISIONS,
  ATTRIBUTE_REVIEW_ISSUE_CATEGORIES,
  ATTRIBUTE_REVIEW_SORT_FIELDS,
  CONFIDENCE_LEVELS,
  MAX_ATTRIBUTE_QUEUE_PAGE_SIZE,
  type AttributeFindingDto,
} from './attribute-finding.dtos';

/**
 * HTTP contracts for the Attribute Intelligence review queue.
 *
 * Deliberately transport-only: the request DTOs carry *which* finding to act on
 * and *what* the reviewer decided, never attribute data. There is no field, no
 * binding target and no value in any of them, so the queue cannot be used as a
 * generic write API for the attribute library — the same boundary the component
 * queue's apply contract enforces.
 *
 * Reviewer identity is not accepted anywhere. The global `ValidationPipe` runs
 * with `whitelist: true, forbidNonWhitelisted: true`, so a body containing
 * `reviewerId`/`reviewerEmail`/`reviewerName` is rejected with 400 rather than
 * silently ignored, and the identity used is always the authenticated principal.
 */

export class ListAttributeFindingsQueryDto {
  /** Comma-separated statuses, e.g. `PENDING,STALE`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  status?: string;

  /** Comma-separated issue types, e.g. `UNUSED_ATTRIBUTE,POSSIBLE_DUPLICATE`. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  issueType?: string;

  /** Comma-separated issue categories. */
  @IsOptional()
  @IsString()
  @MaxLength(400)
  issueCategory?: string;

  @IsOptional()
  @IsIn([...CONFIDENCE_LEVELS])
  confidenceLevel?: (typeof CONFIDENCE_LEVELS)[number];

  @IsOptional()
  @IsUUID()
  attributeDefinitionId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  relatedAttributeDefinitionId?: string;

  /** Producer tag, e.g. `audit:attribute-library:ml`. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  source?: string;

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
  @Max(MAX_ATTRIBUTE_QUEUE_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @IsIn([...ATTRIBUTE_REVIEW_SORT_FIELDS])
  sortBy?: (typeof ATTRIBUTE_REVIEW_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDirection?: 'asc' | 'desc';
}

export class RecordAttributeFindingDecisionDto {
  /**
   * `ACCEPTED` records that a human approved the *finding* for review purposes.
   * It does not apply anything: no binding is created or removed, no definition,
   * option or component value is touched. Applying a finding is a later pass.
   */
  @IsIn([...ATTRIBUTE_REVIEW_DECISIONS])
  decision!: (typeof ATTRIBUTE_REVIEW_DECISIONS)[number];

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

export class MarkAttributeFindingsStaleDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  ids?: string[];

  @IsOptional()
  @IsUUID()
  attributeDefinitionId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Audit request.
 *
 * Deliberately carries no parameters: the existing audit is whole-library, so a
 * caller cannot redirect it at a subset of the library. The (empty) DTO exists so
 * the route validates its body — `forbidNonWhitelisted` then rejects any field a
 * caller might pass in the belief that they scoped the run.
 */
export class RunAttributeAuditDto {}

/** Lifecycle counts for the queue tabs, all read from persisted findings. */
export interface AttributeReviewQueueCounts {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  dismissed: number;
  stale: number;
  /** Counts per issue category, as persisted on the finding. */
  byCategory: Record<string, number>;
  /** Counts per issue type, for the queue's family tabs. */
  byIssueType: Record<string, number>;
}

export interface AttributeReviewQueuePageDto {
  items: AttributeFindingDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: AttributeReviewQueueCounts;
}

export { ATTRIBUTE_REVIEW_ISSUE_CATEGORIES };
