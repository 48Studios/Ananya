import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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

  /**
   * The component the reviewer is editing.
   *
   * Duplicate detection compares the request against every stored component, so
   * without this the record being edited is offered as a duplicate of itself:
   * its own name and specifications are the closest text to the query, which
   * made the semantic tier flag it at high similarity. Excluded from the
   * candidate set, never used to look anything up.
   */
  @IsOptional()
  @IsUUID()
  componentId?: string;

  /**
   * The category the reviewer selected by hand.
   *
   * Attribute relevance is conditioned on it instead of on the predicted
   * category, which is what lets the form show the selected category's
   * specifications the moment it is chosen — without a second endpoint and
   * without one request per attribute. It never changes the category the model
   * suggests; it only decides which bindings the attribute intelligence reads.
   */
  @IsOptional()
  @IsUUID()
  categoryId?: string;
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

/**
 * Why an attribute is considered relevant, or why a value is suggested.
 *
 * Structured rather than prose: the reviewer filters and reads by source, and the
 * same vocabulary is what the review queue stores as evidence.
 */
export class AttributeRelevanceEvidenceDto {
  type!: string;
  description!: string;
  source?: string;
  weight!: number;
  categoryId?: string | null;
  categoryName?: string | null;
}

/** A suggested value in the shape the manual attribute editor writes. */
export class AttributeSuggestedValueDto {
  /** A MULTI_SELECT value is the list of chosen option codes. */
  value!: string | number | boolean | string[] | null;
  unit?: string | null;
  optionCode?: string;
  optionLabel?: string;
  selectedOptionCodes?: string[];
  formatted!: string;
}

/**
 * A recorded value that genuinely disagrees with the suggestion.
 *
 * Reported, never applied: the reviewer keeps the current value, or decides to
 * replace it. An inconclusive comparison is deliberately not a conflict.
 */
export class AttributeSuggestionConflictDto {
  existingDisplay!: string;
  suggestedDisplay!: string;
}

/**
 * One attribute the Component Intelligence considers relevant for this part.
 *
 * Relevance and value are separate fields because they are separate facts: an
 * attribute can be relevant with `suggestedValue: null` (the UI's "relevant,
 * value not determined"), which is a different statement from a predicted value
 * and must not be rendered like one.
 */
export class AttributeSuggestionDto {
  attributeDefinitionId!: string;
  code!: string;
  name!: string;
  dataType!: string;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  isRequired!: boolean;
  /** The considered categories that establish relevance for this attribute. */
  categoryIds!: string[];
  /** Every category considered, so the UI can show what did not establish it. */
  consideredCategoryIds!: string[];
  relevance!: AttributeRelevanceEvidenceDto[];
  valueEvidence!: AttributeRelevanceEvidenceDto[];
  suggestedValue!: AttributeSuggestedValueDto | null;
  confidence!: number | null;
  confidenceLevel!: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  existingDisplay!: string | null;
  /**
   * Whether the recorded value was positively established as equivalent.
   *
   * `null` when nothing is recorded. `false` means the comparison was
   * inconclusive — the two values were not shown to agree, which is not the same
   * statement as a conflict and must not be presented as one.
   */
  existingMatches!: boolean | null;
  conflict!: AttributeSuggestionConflictDto | null;
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
  /**
   * Relevant attributes, bound to this part's category or discovered from other
   * evidence, with a canonical value only where the evidence supports one.
   */
  attributeSuggestions!: AttributeSuggestionDto[];
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
