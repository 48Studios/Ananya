import { apiClient } from "../api-client";
import { UserProfileDto } from "./auth-api";

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  department?: string;
  roleId?: string;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  department?: string;
  roleId?: string;
}

export interface FindUsersOptions {
  search?: string;
  roleId?: string;
  status?: string;
}

export const usersApi = {
  getAll: (options?: FindUsersOptions): Promise<UserProfileDto[]> => {
    const params = new URLSearchParams();
    if (options?.search) params.append("search", options.search);
    if (options?.roleId) params.append("roleId", options.roleId);
    if (options?.status) params.append("status", options.status);

    const qs = params.toString();
    const url = qs ? `/users?${qs}` : "/users";
    return apiClient.get<UserProfileDto[]>(url);
  },

  getById: (id: string): Promise<UserProfileDto> =>
    apiClient.get<UserProfileDto>(`/users/${id}`),

  create: (payload: CreateUserPayload): Promise<UserProfileDto> =>
    apiClient.post<UserProfileDto, CreateUserPayload>("/users", payload),

  update: (id: string, payload: UpdateUserPayload): Promise<UserProfileDto> =>
    apiClient.put<UserProfileDto, UpdateUserPayload>(`/users/${id}`, payload),

  disable: (id: string): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }, Record<string, never>>(
      `/users/${id}/disable`,
      {},
    ),

  activate: (id: string): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }, Record<string, never>>(
      `/users/${id}/activate`,
      {},
    ),

  adminResetPassword: (
    id: string,
    newPassword: string,
  ): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }, { newPassword: string }>(
      `/users/${id}/reset-password`,
      { newPassword },
    ),
};
