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
  resolution: 'EXISTING' | 'NEW_CANDIDATE' | 'UNKNOWN' = 'UNKNOWN';
  categoryId?: string | null;
  categoryCode?: string;
  categoryName!: string;
  subcategoryId?: string | null;
  subcategoryCode?: string;
  subcategoryName?: string | null;
  categoryPath?: string[];
  parentCategoryId?: string | null;
  parentCategoryCode?: string | null;
  suggestedParent?: string | null;
  proposedDescription?: string | null;
  confidence!: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  evidence?: EvidenceItemDto[];
  candidates?: CategoryCandidateDto[];
}

export class CategoryCandidateDto {
  categoryId?: string | null;
  categoryName!: string;
  categoryCode?: string | null;
  categoryPath?: string[];
  confidence!: number;
  evidence?: EvidenceItemDto[];
}

export class ManufacturerSuggestionDto {
  resolution!: 'EXISTING' | 'NEW_CANDIDATE' | 'UNKNOWN';
  manufacturerId?: string | null;
  manufacturerCode?: string;
  manufacturerName!: string | null;
  confidence!: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
  matchType!: string;
  evidence?: EvidenceItemDto[];
  candidates?: ManufacturerCandidateDto[];
}

export class ManufacturerCandidateDto {
  manufacturerId?: string | null;
  name!: string;
  manufacturerCode?: string | null;
  confidence!: number;
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
  resolution: 'RESOLVED' | 'UNRESOLVED' = 'RESOLVED';
}

export class ComponentSuggestionResponseDto {
  query!: string;
  manufacturerPartNumber?: string;
  suggestedName?: string;
  suggestedDescription?: string;
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
  @IsIn([
    'CATEGORY',
    'MANUFACTURER',
    'ATTRIBUTE',
    'DUPLICATE',
    'MPN',
    'NAME',
    'DESCRIPTION',
    'ATTRIBUTE_BINDING',
    'SUGGESTED_BINDING',
    'CATEGORY_ATTRIBUTES',
    'ATTRIBUTE_CONFIG',
    'ATTRIBUTE_ALIAS',
    'ATTRIBUTE_DUPLICATE',
    'POSSIBLE_DUPLICATE',
    'SUSPICIOUS_BINDING',
    'UNUSED_ATTRIBUTE',
    'INCONSISTENT_CONFIG',
    'MISSING_EXPECTED_ATTRIBUTE',
    'DUPLICATE_ATTRIBUTE',
    'ENUM_VALUES',
    'ENUM_OPTION',
    'SUGGESTED_ENUM_VALUE',
    'SUGGESTED_ENUM_VALUES',
  ])
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
  @IsString()
  attributeDefinitionId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

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

// ---------------------------------------------------------
// Attribute Intelligence DTOs (RFC-0059)
// ---------------------------------------------------------

export class SuggestAttributeBindingsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  attributeName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  attributeCode?: string;

  @IsOptional()
  @IsString()
  attributeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  dataType?: string;

  @IsOptional()
  @IsString()
  unitCategory?: string;
}

export class AttributeBindingSuggestionDto {
  categoryId!: string;
  categoryCode!: string;
  categoryName!: string;
  confidence!: number;
  confidenceLevel!: 'HIGH' | 'MEDIUM' | 'LOW';
  reason!: string;
  evidence!: EvidenceItemDto[];
  modelVersion!: string;
}

export class SuggestAttributeBindingsResponseDto {
  suggestions!: AttributeBindingSuggestionDto[];
  isMlActive!: boolean;
  executionTimeMs!: number;
}

export class SuggestCategoryAttributesDto {
  @IsString()
  @IsNotEmpty()
  categoryId!: string;
}

export class CategoryAttributeSuggestionDto {
  attributeDefinitionId?: string | null;
  code!: string;
  name!: string;
  dataType!: string;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  groupName?: string | null;
  confidence!: number;
  confidenceLevel!: 'HIGH' | 'MEDIUM' | 'LOW';
  isAlreadyBound!: boolean;
  reason!: string;
  evidence!: EvidenceItemDto[];
}

export class SuggestCategoryAttributesResponseDto {
  categoryId!: string;
  categoryName!: string;
  suggestions!: CategoryAttributeSuggestionDto[];
  isMlActive!: boolean;
  executionTimeMs!: number;
}

export class SuggestAttributeConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class AttributeConfigSuggestionDto {
  suggestedCode!: string;
  suggestedDataType!: string;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  displayUnits!: string[];
  groupName?: string | null;
  suggestedAliases!: string[];
  suggestedOptions!: string[];
  validationRules?: Record<string, unknown> | null;
  canonicalMatch?: {
    id: string;
    name: string;
    code?: string;
    similarity: number;
  } | null;
  confidence!: number;
  confidenceLevel!: 'HIGH' | 'MEDIUM' | 'LOW';
  reason!: string;
  evidence!: EvidenceItemDto[];
}

export class SuggestAttributeConfigResponseDto {
  suggestion!: AttributeConfigSuggestionDto;
  isMlActive!: boolean;
  executionTimeMs!: number;
}

export class DetectAttributeDuplicatesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsNumber()
  threshold?: number;
}

export class AttributeDuplicateMatchDto {
  attributeId!: string;
  code!: string;
  name!: string;
  similarity!: number;
  confidenceLevel!: 'HIGH' | 'MEDIUM' | 'LOW';
  matchType!: string;
  usageCount!: number;
  boundCategories!: string[];
  aliases!: string[];
  reason!: string;
  evidence!: EvidenceItemDto[];
}

export class DetectAttributeDuplicatesResponseDto {
  isDuplicate!: boolean;
  matches!: AttributeDuplicateMatchDto[];
  suggestedAliases!: string[];
  isMlActive!: boolean;
  executionTimeMs!: number;
}

export class SuggestEnumValuesDto {
  @IsOptional()
  @IsString()
  attributeId?: string;

  @IsString()
  @IsNotEmpty()
  attributeCode!: string;

  @IsString()
  @IsNotEmpty()
  attributeName!: string;

  @IsOptional()
  @IsArray()
  existingOptions?: string[];
}

export class EnumOptionSuggestionDto {
  code!: string;
  label!: string;
  source!: string;
  provenance?: string;
  confidence!: number;
  confidenceLevel!: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class SuggestEnumValuesResponseDto {
  suggestedOptions!: EnumOptionSuggestionDto[];
  isMlActive!: boolean;
  executionTimeMs!: number;
}

export class AttributeAuditIssueDto {
  id!: string;
  type!:
    | 'DUPLICATE_ATTRIBUTE'
    | 'SUSPICIOUS_BINDING'
    | 'MISSING_EXPECTED_ATTRIBUTE'
    | 'UNUSED_ATTRIBUTE'
    | 'INCONSISTENT_CONFIG'
    | 'SUGGESTED_BINDING'
    | 'POSSIBLE_DUPLICATE'
    | 'SUGGESTED_ENUM_VALUE';
  severity!: 'WARNING' | 'INFO' | 'CRITICAL';
  title?: string;
  subtitle?: string;
  attributeId?: string | null;
  attributeCode?: string | null;
  attributeName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  confidence!: number;
  confidenceLevel!: 'HIGH' | 'MEDIUM' | 'LOW';
  reason!: string;
  payload?: Record<string, unknown>;
  evidence!: EvidenceItemDto[];
}

export class ReviewQueueSummaryDto {
  total!: number;
  suggestedBindings!: number;
  possibleDuplicates!: number;
  suspiciousBindings!: number;
  unusedAttributes!: number;
  suggestedEnumValues!: number;
  totalPending?: number;
  duplicateWarnings?: number;
  missingExpected?: number;
}

export class ReviewQueueResponseDto {
  summary!: ReviewQueueSummaryDto;
  items!: AttributeAuditIssueDto[];
}

export class AuditAttributeLibraryResponseDto {
  summary!: {
    totalAttributes: number;
    possibleDuplicates: number;
    suspiciousBindings: number;
    missingExpectedAttributes: number;
    unusedAttributes: number;
    issuesCount?: number;
  };
  issues!: AttributeAuditIssueDto[];
  isMlActive!: boolean;
  executionTimeMs!: number;
}

export class ApplySuggestedBindingDto {
  @IsString()
  @IsNotEmpty()
  attributeId!: string;

  @IsArray()
  @IsString({ each: true })
  categoryIds!: string[];

  @IsOptional()
  isRequired?: boolean;
}
