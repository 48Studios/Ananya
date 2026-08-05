import { apiClient } from "../api-client";

export interface CategoryDto {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryPayload {
  code: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
}

export interface UpdateCategoryPayload {
  code?: string;
  name?: string;
  description?: string | null;
  parentId?: string | null;
  isActive?: boolean;
}

export const categoriesApi = {
  getAll: (): Promise<CategoryDto[]> =>
    apiClient.get<CategoryDto[]>("/categories"),
  getById: (id: string): Promise<CategoryDto> =>
    apiClient.get<CategoryDto>(`/categories/${id}`),
  create: (payload: CreateCategoryPayload): Promise<CategoryDto> =>
    apiClient.post<CategoryDto, CreateCategoryPayload>("/categories", payload),
  update: (id: string, payload: UpdateCategoryPayload): Promise<CategoryDto> =>
    apiClient.put<CategoryDto, UpdateCategoryPayload>(
      `/categories/${id}`,
      payload,
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/categories/${id}`),
};
