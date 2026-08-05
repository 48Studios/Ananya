import { apiClient } from "../api-client";

export interface RoleDto {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRolePayload {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
  permissions?: string[];
}

export const rolesApi = {
  getAll: (): Promise<RoleDto[]> => apiClient.get<RoleDto[]>("/roles"),

  getById: (id: string): Promise<RoleDto> =>
    apiClient.get<RoleDto>(`/roles/${id}`),

  create: (payload: CreateRolePayload): Promise<RoleDto> =>
    apiClient.post<RoleDto, CreateRolePayload>("/roles", payload),

  update: (id: string, payload: UpdateRolePayload): Promise<RoleDto> =>
    apiClient.put<RoleDto, UpdateRolePayload>(`/roles/${id}`, payload),

  delete: (id: string): Promise<{ success: boolean }> =>
    apiClient.delete<{ success: boolean }>(`/roles/${id}`),
};
