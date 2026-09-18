import { apiClient } from "../api-client";

export interface CategorySuggestionDto {
  categoryId?: string | null;
  categoryCode?: string;
  categoryName: string;
  subcategoryId?: string | null;
  subcategoryCode?: string;
  subcategoryName?: string | null;
  confidence: number;
}

export interface ManufacturerSuggestionDto {
  manufacturerId?: string | null;
  manufacturerCode?: string;
  manufacturerName: string;
  confidence: number;
  matchType: string;
}

export interface DuplicateWarningDto {
  id: string;
  sku: string;
  name?: string;
  similarity: number;
  matchType: string;
  reason: string;
}

export interface ExtractedAttributeDto {
  code: string;
  attributeDefinitionId?: string | null;
  value: unknown;
  unit?: string | null;
  formatted: string;
  confidence: number;
}

export interface ComponentSuggestionResponseDto {
  query: string;
  suggestedName?: string;
  suggestedSku?: string;
  suggestedUnit?: string;
  category?: CategorySuggestionDto | null;
  alternativeCategories: CategorySuggestionDto[];
  manufacturer?: ManufacturerSuggestionDto | null;
  isDuplicate: boolean;
  duplicateWarnings: DuplicateWarningDto[];
  attributes: Record<string, ExtractedAttributeDto>;
  isMlActive: boolean;
  executionTimeMs: number;
}

export interface SuggestComponentPayload {
  query: string;
  partNumber?: string;
  description?: string;
  datasheetText?: string;
  datasheetPdfBase64?: string;
}

export const mlApi = {
  suggest: (payload: SuggestComponentPayload): Promise<ComponentSuggestionResponseDto> =>
    apiClient.post<ComponentSuggestionResponseDto, SuggestComponentPayload>(
      "/components/suggest",
      payload
    ),

  health: (): Promise<{ status: string; mlServiceEnabled: boolean; mlServiceReachable: boolean }> =>
    apiClient.get<{ status: string; mlServiceEnabled: boolean; mlServiceReachable: boolean }>(
      "/ml/health"
    ),
};
