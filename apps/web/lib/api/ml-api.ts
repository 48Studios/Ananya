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
  formatted: string;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence?: EvidenceItemDto[];
  resolution?: "RESOLVED" | "UNRESOLVED";
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
