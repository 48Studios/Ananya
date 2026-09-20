import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { ConsolidationConflictDto } from '../component-consolidation.dtos';

/**
 * Consolidation execution contracts (Pass 6B).
 *
 * Shape and basic constraints only. Everything that needs domain knowledge —
 * which component may be canonical, whether a resolution actually applies to the
 * attribute it names, whether the fingerprint still matches — is decided by the
 * backend inside the consolidation transaction. The request body is a
 * *suggestion*; the backend recomputes the truth.
 */

export const ATTRIBUTE_RESOLUTION_STRATEGIES = [
  'KEEP_CANONICAL_VALUE',
  'KEEP_SOURCE_VALUE',
  'DISCARD_SOURCE_VALUE',
  'EXPLICIT_VALUE',
] as const;

export const BOM_SCRAP_FACTOR_STRATEGIES = [
  'USE_CANONICAL',
  'USE_SOURCE',
  'EXPLICIT',
] as const;

export class AttributeResolutionDto {
  @IsUUID()
  attributeDefinitionId!: string;

  @IsEnum(ATTRIBUTE_RESOLUTION_STRATEGIES)
  strategy!: (typeof ATTRIBUTE_RESOLUTION_STRATEGIES)[number];

  /** Required when `strategy` is `EXPLICIT_VALUE`. */
  @IsOptional()
  value?: string | number | boolean | null;
}

export class BomScrapFactorResolutionDto {
  @IsEnum(BOM_SCRAP_FACTOR_STRATEGIES)
  strategy!: (typeof BOM_SCRAP_FACTOR_STRATEGIES)[number];

  /** Required when `strategy` is `EXPLICIT`. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;
}

export class BomLineResolutionDto {
  @IsUUID()
  bomId!: string;

  @IsIn(['COMBINE'])
  resolution!: 'COMBINE';

  @ValidateNested()
  @Type(() => BomScrapFactorResolutionDto)
  scrapFactorResolution!: BomScrapFactorResolutionDto;
}

/**
 * The execution request.
 *
 * Note there is deliberately no generic `dependencyResolutions` field. A
 * dependency is either migrated by a dedicated adapter, preserved as history, or
 * blocked because the domain has no safe semantics — in which case the answer is
 * an out-of-band business decision (close the order, fix the duplicate batch
 * code), not a field the caller can assert. Accepting such a field and ignoring
 * it would let a client believe it had unblocked something it had not.
 */
export class ConsolidationExecutionRequestDto {
  /** The preview fingerprint the reviewer approved. */
  @IsString()
  @MaxLength(128)
  expectedPreviewFingerprint!: string;

  /** Optional override of the deterministic canonical suggestion. */
  @IsOptional()
  @IsUUID()
  canonicalComponentId?: string;

  /** Sources to retire. Defaults to the finding's other component. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @IsUUID(undefined, { each: true })
  sourceComponentIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BomLineResolutionDto)
  bomResolutions?: BomLineResolutionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttributeResolutionDto)
  attributeResolutions?: AttributeResolutionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNotes?: string;

  /**
   * Must be exactly `true`. A single accidental click must never be able to
   * retire a component.
   */
  @IsBoolean()
  confirmation!: boolean;
}

export interface ConsolidationAdapterReportDto {
  adapterId: string;
  label: string;
  entity: string;
  action: string;
  migratedCount: number;
  details: Record<string, unknown>;
  warnings: string[];
}

/** Result of a committed consolidation. */
export interface ConsolidationResultDto {
  consolidationId: string;
  status: 'COMPLETED';
  /** True when this response is a replay of an already-committed operation. */
  idempotentReplay: boolean;
  findingId: string;
  canonical: {
    id: string;
    sku: string;
    name: string;
    isActive: boolean;
  };
  sources: Array<{
    id: string;
    sku: string;
    name: string;
    isActive: boolean;
    consolidatedIntoComponentId: string;
    consolidatedAt: string;
  }>;
  previewFingerprint: string;
  adapters: ConsolidationAdapterReportDto[];
  warnings: string[];
  completedAt: string;
}

/** Returned when the request is refused. Mirrors the preview's conflicts. */
export interface ConsolidationRefusalDto {
  status: 'REFUSED';
  reason: string;
  message: string;
  conflicts: Array<
    Pick<ConsolidationConflictDto, 'code' | 'title' | 'description'>
  >;
}
