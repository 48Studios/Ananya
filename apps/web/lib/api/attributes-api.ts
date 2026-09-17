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
  validationRules?: Record<string, unknown>;
  isActive?: boolean;
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
};
