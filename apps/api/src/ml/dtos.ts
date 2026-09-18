import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EvidenceItemDto {
  type!: string;
  description!: string;
  weight!: number;
  source?: string;
}

export class SuggestComponentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  partNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  datasheetText?: string;

  @IsOptional()
  @IsString()
  datasheetPdfBase64?: string;
}

export class CategorySuggestionDto {
  categoryId?: string | null;
  categoryCode?: string;
  categoryName!: string;
  subcategoryId?: string | null;
  subcategoryCode?: string;
  subcategoryName?: string | null;
  confidence!: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  evidence?: EvidenceItemDto[];
}

export class ManufacturerSuggestionDto {
  manufacturerId?: string | null;
  manufacturerCode?: string;
  manufacturerName!: string;
  confidence!: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  matchType!: string;
  evidence?: EvidenceItemDto[];
}

export class DuplicateWarningDto {
  id!: string;
  sku!: string;
  name?: string;
  similarity!: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  matchType!: string;
  reason!: string;
  evidence?: EvidenceItemDto[];
}

export class ExtractedAttributeDto {
  code!: string;
  attributeDefinitionId?: string | null;
  value!: string | number | boolean | null;
  unit?: string | null;
  formatted!: string;
  confidence!: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  evidence?: EvidenceItemDto[];
}

export class ComponentSuggestionResponseDto {
  query!: string;
  suggestedName?: string;
  suggestedSku?: string;
  suggestedUnit?: string;
  category?: CategorySuggestionDto | null;
  alternativeCategories!: CategorySuggestionDto[];
  manufacturer?: ManufacturerSuggestionDto | null;
  isDuplicate!: boolean;
  duplicateWarnings!: DuplicateWarningDto[];
  attributes!: Record<string, ExtractedAttributeDto>;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  overallEvidence?: EvidenceItemDto[];
  isMlActive!: boolean;
  executionTimeMs!: number;
}

export class FeedbackItemDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['CATEGORY', 'MANUFACTURER', 'ATTRIBUTE', 'DUPLICATE'])
  suggestionType!: string;

  @IsString()
  @IsNotEmpty()
  field!: string;

  @IsOptional()
  predictedValue?: unknown;

  @IsOptional()
  @IsNumber()
  confidence?: number;

  @IsOptional()
  @IsString()
  @IsIn(['HIGH', 'MEDIUM', 'LOW'])
  confidenceLevel?: string;

  @IsOptional()
  @IsArray()
  evidence?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  modelVersion?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['ACCEPTED', 'REJECTED', 'EDITED'])
  userAction!: string;

  @IsOptional()
  finalValue?: unknown;
}

export class CreateMlFeedbackDto {
  @IsOptional()
  @IsString()
  componentId?: string;

  @IsOptional()
  creationContext?: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeedbackItemDto)
  items!: FeedbackItemDto[];
}

export class ExportFeedbackQueryDto {
  @IsOptional()
  @IsString()
  suggestionType?: string;

  @IsOptional()
  @IsString()
  userAction?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class ReviewQuarantineRecordDto {
  @IsIn(['VERIFIED', 'REJECTED', 'NEEDS_REVIEW'])
  status!: 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW';

  @IsOptional()
  @IsString()
  reviewerNotes?: string;

  @IsOptional()
  @IsString()
  resolvedCategory?: string;

  @IsOptional()
  @IsString()
  resolvedManufacturer?: string;
}

export class QuarantineFilterQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  quarantineType?: string;
}
