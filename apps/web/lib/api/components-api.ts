import { apiClient } from "../api-client";

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
}

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
};
