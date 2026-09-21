import { apiClient } from "../api-client";

export interface AttributeOptionDto {
  id: string;
  attributeDefinitionId: string;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface AttributeDefinitionDto {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  dataType:
    | "TEXT"
    | "NUMBER"
    | "INTEGER"
    | "BOOLEAN"
    | "SELECT"
    | "MULTI_SELECT"
    | "QUANTITY"
    | "DATE";
  unitCategory?: string | null;
  defaultUnit?: string | null;
  isFilterable: boolean;
  sortOrder: number;
  options?: AttributeOptionDto[];
  isActive: boolean;
  aliases?: string[];
  groupName?: string | null;
  categoryBindings?: CategoryBindingSummary[];
}

export interface CategoryBindingSummary {
  id: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  isRequired: boolean;
  sortOrder: number;
}

export interface AttributeCategoryBindingDto {
  id: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  isRequired: boolean;
  sortOrder: number;
  defaultValue?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface BindCategoryToAttributePayload {
  categoryId: string;
  isRequired?: boolean;
  sortOrder?: number;
  defaultValue?: Record<string, unknown> | null;
}

export interface UpdateCategoryBindingPayload {
  isRequired?: boolean;
  sortOrder?: number;
  defaultValue?: Record<string, unknown> | null;
}

export interface ResolvedCategoryAttributeDto {
  attributeDefinition: AttributeDefinitionDto;
  options: AttributeOptionDto[];
  isRequired: boolean;
  sortOrder: number;
  defaultValue?: Record<string, unknown> | null;
  inheritedFromCategoryId?: string | null;
}

export interface PopulatedComponentAttributeDto {
  definitionId: string;
  code: string;
  name: string;
  dataType: string;
  value: unknown;
  unit: string | null;
  normalizedValue: number | null;
  optionId: string | null;
  optionCode: string | null;
  optionLabel: string | null;
  displayValue: string;
}

export interface SetComponentAttributeItem {
  code: string;
  value?: unknown;
  unit?: string;
  optionId?: string;
  selectedOptionIds?: string[];
}

export interface AssignCategoryAttributePayload {
  attributeDefinitionId: string;
  isRequired?: boolean;
  sortOrder?: number;
  defaultValue?: Record<string, unknown> | null;
}

export interface CreateAttributeDefinitionPayload {
  code: string;
  name: string;
  description?: string;
  dataType:
    | "TEXT"
    | "NUMBER"
    | "INTEGER"
    | "BOOLEAN"
    | "SELECT"
    | "MULTI_SELECT"
    | "QUANTITY"
    | "DATE";
  unitCategory?: string;
  defaultUnit?: string;
  isFilterable?: boolean;
  isRequired?: boolean;
  sortOrder?: number;
  aliases?: string[];
  groupName?: string;
  options?: Array<{ code: string; label: string; sortOrder?: number }>;
  categoryBindings?: Array<{
    categoryId: string;
    isRequired?: boolean;
    sortOrder?: number;
    defaultValue?: Record<string, unknown>;
  }>;
}

export interface CreateAttributeOptionPayload {
  code: string;
  label: string;
  sortOrder?: number;
}

export interface UpdateAttributeDefinitionPayload {
  name?: string;
  description?: string;
  dataType?:
    | "TEXT"
    | "NUMBER"
    | "INTEGER"
    | "BOOLEAN"
    | "SELECT"
    | "MULTI_SELECT"
    | "QUANTITY"
    | "DATE";
  unitCategory?: string;
  defaultUnit?: string;
  isFilterable?: boolean;
  sortOrder?: number;
  aliases?: string[];
  groupName?: string;
  validationRules?: Record<string, unknown>;
  isActive?: boolean;
}

export interface SuggestedCategoryBindingDto {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence: Array<{
    type: string;
    description: string;
    weight: number;
    source?: string;
  }>;
  reason: string;
  suggestedRequired?: boolean;
}

export interface SuspiciousBindingDto {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence: Array<{
    type: string;
    description: string;
    weight: number;
    source?: string;
  }>;
  reason: string;
}

export interface AttributeBindingSuggestionsResponseDto {
  attributeCode?: string;
  attributeName?: string;
  suggestions: SuggestedCategoryBindingDto[];
  suspiciousExistingBindings: SuspiciousBindingDto[];
  isMlActive: boolean;
  executionTimeMs: number;
}

export interface SuggestedCategoryAttributeItemDto {
  attributeDefinitionId?: string;
  attributeCode: string;
  attributeName: string;
  dataType: string;
  unitCategory?: string;
  defaultUnit?: string;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  isExisting: boolean;
  isRequired?: boolean;
  groupName?: string;
  evidence: Array<{
    type: string;
    description: string;
    weight: number;
    source?: string;
  }>;
  reason: string;
}

export interface CategoryAttributeSuggestionsResponseDto {
  categoryId: string;
  categoryName?: string;
  suggestions: SuggestedCategoryAttributeItemDto[];
  missingExpectedAttributes: SuggestedCategoryAttributeItemDto[];
  isMlActive: boolean;
  executionTimeMs: number;
}

/**
 * A category-attribute suggestion exactly as the ML service returns it.
 *
 * The service names the identity fields `code` and `name` (and the bound flag
 * `isAlreadyBound`), while the panel consumes `attributeCode`, `attributeName`
 * and `isExisting`. Reading the DTO names straight off the response left every
 * suggestion without a code or a name, so the panel rendered nameless cards and
 * could not key, select or dismiss them. The two shapes are reconciled in one
 * place — here — rather than in the component.
 */
export interface RawSuggestedCategoryAttributeItem {
  attributeDefinitionId?: string;
  /** Preferred field; tolerated for callers that already receive the DTO shape. */
  attributeCode?: string;
  attributeName?: string;
  code?: string;
  name?: string;
  dataType?: string;
  unitCategory?: string;
  defaultUnit?: string;
  confidence?: number;
  confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
  isExisting?: boolean;
  isAlreadyBound?: boolean;
  isRequired?: boolean;
  groupName?: string;
  evidence?: Array<{
    type: string;
    description: string;
    weight: number;
    source?: string;
  }>;
  reason?: string;
}

/**
 * Reconciles one suggestion payload with the panel's contract.
 *
 * Falls back to the definition id when the service omits every code, so a
 * suggestion always has a stable identity to key and toggle on.
 */
export function normalizeSuggestedCategoryAttributeItem(
  raw: RawSuggestedCategoryAttributeItem,
): SuggestedCategoryAttributeItemDto {
  return {
    attributeDefinitionId: raw.attributeDefinitionId,
    attributeCode:
      raw.attributeCode ?? raw.code ?? raw.attributeDefinitionId ?? "",
    attributeName: raw.attributeName ?? raw.name ?? "",
    dataType: raw.dataType ?? "TEXT",
    unitCategory: raw.unitCategory,
    defaultUnit: raw.defaultUnit,
    confidence: raw.confidence ?? 0,
    confidenceLevel: raw.confidenceLevel ?? "LOW",
    isExisting: raw.isExisting ?? raw.isAlreadyBound ?? false,
    isRequired: raw.isRequired,
    groupName: raw.groupName,
    evidence: raw.evidence ?? [],
    reason: raw.reason ?? "",
  };
}

export interface AttributeConfigSuggestionDto {
  name: string;
  suggestedCode: string;
  suggestedDataType: string;
  unitCategory?: string;
  defaultUnit?: string;
  displayUnits?: string[];
  suggestedGroupName?: string;
  suggestedAliases?: string[];
  suggestedValidationRules?: Record<string, unknown>;
  suggestedEnumValues?: string[];
  likelyCategoryNames?: string[];
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence: Array<{
    type: string;
    description: string;
    weight: number;
    source?: string;
  }>;
}

export interface AttributeConfigSuggestionsResponseDto {
  suggestion: AttributeConfigSuggestionDto;
  isMlActive: boolean;
  executionTimeMs: number;
}

export interface DuplicateAttributeMatchDto {
  id?: string;
  code: string;
  name: string;
  similarity: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  matchType: string;
  existingBindingsCount: number;
  aliases: string[];
  evidence: Array<{
    type: string;
    description: string;
    weight: number;
    source?: string;
  }>;
}

export interface AttributeDuplicateDetectionResponseDto {
  isDuplicate: boolean;
  matches: DuplicateAttributeMatchDto[];
  suggestedAliases: string[];
  executionTimeMs: number;
}

export interface EnumOptionSuggestionDto {
  code: string;
  label: string;
  provenance?: string;
  source?: string;
  confidence: number;
  confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
}

export interface EnumSuggestionsResponseDto {
  attributeCode?: string;
  suggestedOptions: EnumOptionSuggestionDto[];
  isMlActive?: boolean;
  executionTimeMs: number;
}

export const attributesApi = {
  getAll: (): Promise<AttributeDefinitionDto[]> =>
    apiClient.get<AttributeDefinitionDto[]>("/attributes"),
  getById: (id: string): Promise<AttributeDefinitionDto> =>
    apiClient.get<AttributeDefinitionDto>(`/attributes/${id}`),
  createDefinition: (
    dto: CreateAttributeDefinitionPayload,
  ): Promise<AttributeDefinitionDto> =>
    apiClient.post<AttributeDefinitionDto>("/attributes", dto),
  updateDefinition: (
    id: string,
    dto: UpdateAttributeDefinitionPayload,
  ): Promise<AttributeDefinitionDto> =>
    apiClient.put<AttributeDefinitionDto>(`/attributes/${id}`, dto),
  deleteDefinition: (id: string): Promise<void> =>
    apiClient.delete<void>(`/attributes/${id}`),
  addOption: (
    id: string,
    dto: CreateAttributeOptionPayload,
  ): Promise<AttributeOptionDto> =>
    apiClient.post<AttributeOptionDto>(`/attributes/${id}/options`, dto),
  deleteOption: (optionId: string): Promise<void> =>
    apiClient.delete<void>(`/attributes/options/${optionId}`),
  getAttributeCategories: (
    attributeDefinitionId: string,
  ): Promise<AttributeCategoryBindingDto[]> =>
    apiClient.get<AttributeCategoryBindingDto[]>(
      `/attributes/${encodeURIComponent(attributeDefinitionId)}/categories`,
    ),
  bindCategory: (
    attributeDefinitionId: string,
    payload: BindCategoryToAttributePayload,
  ): Promise<AttributeCategoryBindingDto> =>
    apiClient.post<AttributeCategoryBindingDto>(
      `/attributes/${encodeURIComponent(attributeDefinitionId)}/categories`,
      payload,
    ),
  updateCategoryBinding: (
    attributeDefinitionId: string,
    categoryId: string,
    payload: UpdateCategoryBindingPayload,
  ): Promise<AttributeCategoryBindingDto> =>
    apiClient.put<AttributeCategoryBindingDto>(
      `/attributes/${encodeURIComponent(attributeDefinitionId)}/categories/${encodeURIComponent(categoryId)}`,
      payload,
    ),
  unbindCategory: (
    attributeDefinitionId: string,
    categoryId: string,
  ): Promise<void> =>
    apiClient.delete<void>(
      `/attributes/${encodeURIComponent(attributeDefinitionId)}/categories/${encodeURIComponent(categoryId)}`,
    ),
  getByCategory: (
    categoryId: string,
  ): Promise<ResolvedCategoryAttributeDto[]> =>
    apiClient.get<ResolvedCategoryAttributeDto[]>(
      `/categories/${encodeURIComponent(categoryId)}/attributes`,
    ),
  assignCategoryAttribute: (
    categoryId: string,
    payload: AssignCategoryAttributePayload,
  ): Promise<unknown> =>
    apiClient.post(
      `/categories/${encodeURIComponent(categoryId)}/attributes`,
      payload,
    ),
  unassignCategoryAttribute: (
    categoryId: string,
    attributeDefinitionId: string,
  ): Promise<void> =>
    apiClient.delete<void>(
      `/categories/${encodeURIComponent(categoryId)}/attributes/${encodeURIComponent(attributeDefinitionId)}`,
    ),
  getComponentAttributes: (
    componentId: string,
  ): Promise<Record<string, PopulatedComponentAttributeDto>> =>
    apiClient.get<Record<string, PopulatedComponentAttributeDto>>(
      `/components/${encodeURIComponent(componentId)}/attributes`,
    ),
  saveComponentAttributes: (
    componentId: string,
    attributes: SetComponentAttributeItem[],
  ): Promise<unknown> =>
    apiClient.post(
      `/components/${encodeURIComponent(componentId)}/attributes`,
      {
        attributes,
      },
    ),
  deleteComponentAttribute: (
    componentId: string,
    attributeDefinitionId: string,
  ): Promise<void> =>
    apiClient.delete<void>(
      `/components/${encodeURIComponent(componentId)}/attributes/${encodeURIComponent(attributeDefinitionId)}`,
    ),

  // Attribute Intelligence v1
  suggestBindings: (payload: {
    attributeId?: string;
    attributeCode?: string;
    attributeName?: string;
    dataType?: string;
    unitCategory?: string;
    limit?: number;
  }): Promise<AttributeBindingSuggestionsResponseDto> =>
    apiClient.post<AttributeBindingSuggestionsResponseDto>(
      "/ml/attributes/suggest-bindings",
      payload,
    ),

  suggestCategoryAttributes: async (
    categoryId: string,
    limit?: number,
  ): Promise<CategoryAttributeSuggestionsResponseDto> => {
    const response = await apiClient.post<
      Omit<
        CategoryAttributeSuggestionsResponseDto,
        "suggestions" | "missingExpectedAttributes"
      > & {
        suggestions?: RawSuggestedCategoryAttributeItem[];
        missingExpectedAttributes?: RawSuggestedCategoryAttributeItem[];
      }
    >("/ml/attributes/suggest-category-attributes", { categoryId, limit });

    return {
      ...response,
      suggestions: (response.suggestions ?? []).map(
        normalizeSuggestedCategoryAttributeItem,
      ),
      missingExpectedAttributes: (response.missingExpectedAttributes ?? []).map(
        normalizeSuggestedCategoryAttributeItem,
      ),
    };
  },

  suggestConfig: (payload: {
    name: string;
    description?: string;
  }): Promise<AttributeConfigSuggestionsResponseDto> =>
    apiClient.post<AttributeConfigSuggestionsResponseDto>(
      "/ml/attributes/suggest-config",
      payload,
    ),

  detectDuplicates: (payload: {
    name: string;
    code?: string;
    excludeId?: string;
  }): Promise<AttributeDuplicateDetectionResponseDto> =>
    apiClient.post<AttributeDuplicateDetectionResponseDto>(
      "/ml/attributes/detect-duplicates",
      payload,
    ),

  suggestEnumValues: (payload: {
    attributeId?: string;
    attributeCode: string;
    attributeName?: string;
    existingOptions?: string[];
  }): Promise<EnumSuggestionsResponseDto> =>
    apiClient.post<EnumSuggestionsResponseDto>(
      "/ml/attributes/suggest-enum-values",
      payload,
    ),


  /**
   * NOTE: the review queue is no longer served from this module.
   *
   * `GET /ml/attributes/review-queue` used to recompute the entire library audit on
   * every call and return items with regenerated ids. It was replaced by the
   * persisted queue in `attribute-review-queue-api.ts`
   * (`/ml/attributes/review-queue`, backed by `attribute_intelligence_findings`),
   * which supports server-side filtering, pagination, counts and a real lifecycle.
   *
   * `applyBindings` below still targets a legacy endpoint. It MUTATES
   * `category_attributes` and is now behind the `Inventory.Update` permission.
   */

  applyBindings: (payload: {
    attributeId: string;
    bindings: Array<{
      categoryId: string;
      isRequired?: boolean;
      sortOrder?: number;
    }>;
  }): Promise<{ success: boolean; appliedCount: number }> =>
    apiClient.post<{ success: boolean; appliedCount: number }>(
      "/ml/attributes/apply-bindings",
      payload,
    ),

  recordFeedback: (payload: {
    attributeDefinitionId?: string;
    categoryId?: string;
    items: Array<{
      suggestionType: string;
      field: string;
      predictedValue?: unknown;
      confidence?: number;
      confidenceLevel?: string;
      userAction: "ACCEPTED" | "REJECTED" | "EDITED";
      finalValue?: unknown;
    }>;
  }): Promise<{ success: boolean; recordedCount: number }> =>
    apiClient.post<{ success: boolean; recordedCount: number }>(
      "/ml/attributes/feedback",
      payload,
    ),
};
