import { apiClient } from "../api-client";

export interface EvidenceItemDto {
  type:
    | "mpn_pattern"
    | "keyword"
    | "existing_data"
    | "data_pack_rule"
    | "datasheet_param"
    | "classifier"
    | string;
  description: string;
  weight: number;
  source?: string;
}

export interface CategorySuggestionDto {
  resolution: "EXISTING" | "NEW_CANDIDATE" | "UNKNOWN";
  categoryId?: string | null;
  categoryCode?: string;
  categoryName: string;
  subcategoryId?: string | null;
  subcategoryCode?: string;
  subcategoryName?: string | null;
  parentCategoryId?: string | null;
  parentCategoryCode?: string | null;
  suggestedParent?: string | null;
  proposedDescription?: string | null;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence?: EvidenceItemDto[];
}

export interface ManufacturerSuggestionDto {
  resolution: "EXISTING" | "NEW_CANDIDATE" | "UNKNOWN";
  manufacturerId?: string | null;
  manufacturerCode?: string;
  manufacturerName: string;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  matchType: string;
  evidence?: EvidenceItemDto[];
}

export interface DuplicateWarningDto {
  id: string;
  sku: string;
  name?: string;
  similarity: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  matchType: string;
  reason: string;
  evidence?: EvidenceItemDto[];
}

export interface ExtractedAttributeDto {
  code: string;
  attributeDefinitionId?: string | null;
  value: unknown;
  unit?: string | null;
  /**
   * The quantity as the document stated it (`100` with `kΩ`), when the extractor
   * reported one. `value`/`unit` are canonical for the attribute's unit model.
   */
  sourceValue?: number | null;
  sourceUnit?: string | null;
  formatted: string;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence?: EvidenceItemDto[];
  resolution?: "RESOLVED" | "UNRESOLVED";
}

/** Why an attribute is considered relevant, or why a value is suggested. */
export interface AttributeRelevanceEvidenceDto {
  type: string;
  description: string;
  source?: string;
  weight: number;
  categoryId?: string | null;
  categoryName?: string | null;
}

/** A suggested value in the shape the manual attribute editor writes. */
export interface AttributeSuggestedValueDto {
  /** A MULTI_SELECT value is the list of chosen option codes. */
  value: string | number | boolean | string[] | null;
  unit?: string | null;
  optionCode?: string;
  optionLabel?: string;
  selectedOptionCodes?: string[];
  formatted: string;
}

/** A recorded value that genuinely disagrees with the suggestion. */
export interface AttributeSuggestionConflictDto {
  existingDisplay: string;
  suggestedDisplay: string;
}

/**
 * One relevant attribute for this part.
 *
 * Relevance and value are separate: `suggestedValue: null` means the attribute
 * matters but no value could be determined, which must not be rendered like a
 * prediction.
 */
export interface AttributeSuggestionDto {
  attributeDefinitionId: string;
  code: string;
  name: string;
  dataType: string;
  unitCategory?: string | null;
  defaultUnit?: string | null;
  isRequired: boolean;
  /** The considered categories that establish relevance for this attribute. */
  categoryIds: string[];
  /** Every category considered, so what did *not* establish it stays visible. */
  consideredCategoryIds: string[];
  relevance: AttributeRelevanceEvidenceDto[];
  valueEvidence: AttributeRelevanceEvidenceDto[];
  suggestedValue: AttributeSuggestedValueDto | null;
  confidence: number | null;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW" | null;
  existingDisplay: string | null;
  /**
   * Whether the recorded value was positively established as equivalent.
   * `null` when nothing is recorded; `false` means the comparison was
   * inconclusive, which is not a conflict and must not be shown as agreement.
   */
  existingMatches: boolean | null;
  conflict: AttributeSuggestionConflictDto | null;
  /**
   * Why a value the evidence determined could not be recorded for this
   * attribute, or null.
   *
   * A withheld value is not a missing one: a quantity was read but cannot be
   * expressed faithfully in the attribute's own unit model. The row shows the
   * reason and offers no apply action.
   */
  valueWithheldReason?: string | null;
}

export interface ComponentSuggestionResponseDto {
  query: string;
  manufacturerPartNumber?: string;
  suggestedName?: string;
  suggestedDescription?: string;
  suggestedUnit?: string;
  category?: CategorySuggestionDto | null;
  alternativeCategories: CategorySuggestionDto[];
  manufacturer?: ManufacturerSuggestionDto | null;
  isDuplicate: boolean;
  duplicateWarnings: DuplicateWarningDto[];
  attributes: Record<string, ExtractedAttributeDto>;
  /**
   * Relevant attributes, bound to this part's category or discovered from other
   * evidence, with a canonical value only where the evidence supports one.
   */
  attributeSuggestions: AttributeSuggestionDto[];
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  overallEvidence?: EvidenceItemDto[];
  isMlActive: boolean;
  executionTimeMs: number;
}

export interface SuggestComponentPayload {
  query: string;
  partNumber?: string;
  description?: string;
  datasheetText?: string;
  datasheetPdfBase64?: string;
  /**
   * The component being edited, so it is never offered as its own duplicate.
   * Omitted when creating a new component.
   */
  componentId?: string;
  /**
   * A category the reviewer selected by hand. Attribute relevance is conditioned
   * on it instead of on the predicted category.
   */
  categoryId?: string;
}

export interface FeedbackItemPayload {
  suggestionType:
    | "CATEGORY"
    | "MANUFACTURER"
    | "ATTRIBUTE"
    | "DUPLICATE"
    | "MPN"
    | "NAME"
    | "DESCRIPTION";
  field: string;
  predictedValue?: unknown;
  confidence?: number;
  confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
  evidence?: EvidenceItemDto[];
  modelVersion?: string;
  userAction: "ACCEPTED" | "REJECTED" | "EDITED";
  finalValue?: unknown;
}

export interface CreateMlFeedbackPayload {
  componentId?: string;
  creationContext?: Record<string, unknown>;
  items: FeedbackItemPayload[];
}

export const mlApi = {
  suggest: (payload: SuggestComponentPayload): Promise<ComponentSuggestionResponseDto> =>
    apiClient.post<ComponentSuggestionResponseDto, SuggestComponentPayload>(
      "/components/suggest",
      payload
    ),

  recordFeedback: (payload: CreateMlFeedbackPayload): Promise<{ success: boolean; recordedCount: number }> =>
    apiClient.post<{ success: boolean; recordedCount: number }, CreateMlFeedbackPayload>(
      "/components/suggest/feedback",
      payload
    ),

  exportFeedback: (params?: Record<string, string>): Promise<unknown> => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiClient.get(`/ml/feedback/export${qs}`);
  },

  health: (): Promise<{ status: string; mlServiceEnabled: boolean; mlServiceReachable: boolean }> =>
    apiClient.get<{ status: string; mlServiceEnabled: boolean; mlServiceReachable: boolean }>(
      "/ml/health"
    ),

  getQuarantineRecords: (params?: Record<string, string>): Promise<{
    items: Array<{
      id: string;
      record: Record<string, unknown>;
      rejectionReasons: string[];
      quarantineType: string;
      status: string;
      reviewerNotes?: string;
    }>;
    total: number;
  }> => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
    return apiClient.get(`/ml/training/quarantine${qs}`);
  },

  reviewQuarantineRecord: (
    id: string,
    payload: {
      status: "VERIFIED" | "REJECTED" | "NEEDS_REVIEW";
      reviewerNotes?: string;
      resolvedCategory?: string;
      resolvedManufacturer?: string;
    }
  ): Promise<{ success: boolean; message: string }> =>
    apiClient.post(`/ml/training/quarantine/${id}/review`, payload),
};
