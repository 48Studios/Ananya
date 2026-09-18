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
  evidence: Array<{ type: string; description: string; weight: number; source?: string }>;
  reason: string;
  suggestedRequired?: boolean;
}

export interface SuspiciousBindingDto {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  confidence: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence: Array<{ type: string; description: string; weight: number; source?: string }>;
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
  evidence: Array<{ type: string; description: string; weight: number; source?: string }>;
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
  evidence: Array<{ type: string; description: string; weight: number; source?: string }>;
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
  evidence: Array<{ type: string; description: string; weight: number; source?: string }>;
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

export interface AttributeAuditIssueDto {
  type:
    | "DUPLICATE"
    | "SUSPICIOUS_BINDING"
    | "MISSING_COMMON_ATTRIBUTE"
    | "UNUSED_ATTRIBUTE"
    | "TYPE_INCONSISTENCY"
    | "ENUM_INCONSISTENCY";
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  attributeId?: string;
  attributeCode?: string;
  attributeName?: string;
  categoryId?: string;
  categoryName?: string;
  suggestedAction: string;
  evidence: Array<{ type: string; description: string; weight: number; source?: string }>;
}

export interface AttributeLibraryAuditResponseDto {
  summary: {
    totalAttributes: number;
    totalBindings: number;
    issuesCount: number;
    potentialDuplicatesCount: number;
    suspiciousBindingsCount: number;
    missingBindingsCount: number;
  };
  issues: AttributeAuditIssueDto[];
  executionTimeMs: number;
}

export interface ReviewQueueSummaryDto {
  total: number;
  suggestedBindings: number;
  possibleDuplicates: number;
  suspiciousBindings: number;
  unusedAttributes?: number;
  suggestedEnumValues?: number;
  totalPending?: number;
  duplicateWarnings?: number;
  missingExpected?: number;
}

export interface ReviewQueueItemDto {
  id: string;
  type:
    | "SUGGESTED_BINDING"
    | "POSSIBLE_DUPLICATE"
    | "SUSPICIOUS_BINDING"
    | "SUGGESTED_ENUM_VALUE"
    | "MISSING_ATTRIBUTE"
    | "MISSING_EXPECTED_ATTRIBUTE"
    | "DUPLICATE_ATTRIBUTE"
    | "UNUSED_ATTRIBUTE"
    | string;
  title?: string;
  subtitle?: string;
  confidence?: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  reason?: string;
  attributeId?: string;
  attributeCode?: string;
  attributeName?: string;
  categoryId?: string;
  categoryName?: string;
  payload?: Record<string, unknown>;
  evidence: Array<{ type: string; description: string; weight: number; source?: string }>;
}

export interface AttributeReviewQueueResponseDto {
  summary: ReviewQueueSummaryDto;
  items: ReviewQueueItemDto[];
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
    apiClient.post(`/components/${encodeURIComponent(componentId)}/attributes`, {
      attributes,
    }),
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

  suggestCategoryAttributes: (
    categoryId: string,
    limit?: number,
  ): Promise<CategoryAttributeSuggestionsResponseDto> =>
    apiClient.post<CategoryAttributeSuggestionsResponseDto>(
      "/ml/attributes/suggest-category-attributes",
      { categoryId, limit },
    ),

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

  auditLibrary: (): Promise<AttributeLibraryAuditResponseDto> =>
    apiClient.post<AttributeLibraryAuditResponseDto>("/ml/attributes/audit", {}),

  getReviewQueue: (): Promise<AttributeReviewQueueResponseDto> =>
    apiClient.get<AttributeReviewQueueResponseDto>("/ml/attributes/review-queue"),

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
