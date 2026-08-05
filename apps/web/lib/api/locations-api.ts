import { apiClient } from "../api-client";

export interface LocationDto {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationPayload {
  code: string;
  name: string;
  kind: string;
  parentId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateLocationPayload {
  code?: string;
  name?: string;
  kind?: string;
  parentId?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export const locationsApi = {
  getAll: (): Promise<LocationDto[]> =>
    apiClient.get<LocationDto[]>("/locations"),
  getById: (id: string): Promise<LocationDto> =>
    apiClient.get<LocationDto>(`/locations/${id}`),
  create: (payload: CreateLocationPayload): Promise<LocationDto> =>
    apiClient.post<LocationDto, CreateLocationPayload>("/locations", payload),
  update: (id: string, payload: UpdateLocationPayload): Promise<LocationDto> =>
    apiClient.put<LocationDto, UpdateLocationPayload>(
      `/locations/${id}`,
      payload,
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/locations/${id}`),
};
