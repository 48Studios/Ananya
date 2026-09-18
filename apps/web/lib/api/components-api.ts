import { apiClient } from "../api-client";
import type {
  PopulatedComponentAttributeDto,
  SetComponentAttributeItem,
} from "./attributes-api";

export interface ComponentDto {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit: string;
  isActive: boolean;
  attributes?: Record<string, PopulatedComponentAttributeDto>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateComponentPayload {
  sku: string;
  name: string;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit: string;
  attributes?: Record<string, unknown> | SetComponentAttributeItem[];
}

export interface UpdateComponentPayload {
  sku?: string;
  name?: string;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit?: string;
  isActive?: boolean;
  attributes?: Record<string, unknown> | SetComponentAttributeItem[];
}

import type { ComponentSuggestionResponseDto } from "./ml-api";

export const componentsApi = {
  getAll: (): Promise<ComponentDto[]> =>
    apiClient.get<ComponentDto[]>("/components"),
  getById: (id: string): Promise<ComponentDto> =>
    apiClient.get<ComponentDto>(`/components/${id}`),
  create: (payload: CreateComponentPayload): Promise<ComponentDto> =>
    apiClient.post<ComponentDto, CreateComponentPayload>(
      "/components",
      payload,
    ),
  update: (
    id: string,
    payload: UpdateComponentPayload,
  ): Promise<ComponentDto> =>
    apiClient.put<ComponentDto, UpdateComponentPayload>(
      `/components/${id}`,
      payload,
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/components/${id}`),
  suggest: (payload: { query: string; partNumber?: string; description?: string; datasheetText?: string }): Promise<ComponentSuggestionResponseDto> =>
    apiClient.post<ComponentSuggestionResponseDto, typeof payload>("/components/suggest", payload),
};


