import { apiClient } from '../api-client';

export interface UserProfileDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string | null;
  status: 'ACTIVE' | 'DISABLED';
  roleId?: string | null;
  roleName: string;
  permissions: string[];
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionDefinition {
  code: string;
  name: string;
  category: string;
  description: string;
}

export interface PermissionGroup {
  category: string;
  permissions: PermissionDefinition[];
}

export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginResponseDto {
  token: string;
  user: UserProfileDto;
  permissions: string[];
  permissionGroups: PermissionGroup[];
}

export interface MeResponseDto {
  user: UserProfileDto;
  permissions: string[];
  permissionGroups: PermissionGroup[];
  currentSessionId: string;
}

export interface SessionDto {
  id: string;
  userId: string;
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
  expiresAt: string;
  isRevoked: boolean;
  createdAt: string;
  updatedAt: string;
}

export const authApi = {
  login: (payload: LoginPayload): Promise<LoginResponseDto> =>
    apiClient.post<LoginResponseDto, LoginPayload>('/auth/login', payload),

  logout: (): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }, Record<string, never>>('/auth/logout', {}),

  getMe: (): Promise<MeResponseDto> =>
    apiClient.get<MeResponseDto>('/auth/me'),

  changePassword: (payload: { currentPassword: string; newPassword: string }): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }, { currentPassword: string; newPassword: string }>(
      '/auth/change-password',
      payload,
    ),

  requestPasswordReset: (email: string): Promise<{ message: string }> =>
    apiClient.post<{ message: string }, { email: string }>('/auth/reset-password-request', { email }),

  resetPassword: (payload: { token: string; newPassword: string }): Promise<{ success: boolean }> =>
    apiClient.post<{ success: boolean }, { token: string; newPassword: string }>('/auth/reset-password', payload),

  getSessions: (): Promise<SessionDto[]> =>
    apiClient.get<SessionDto[]>('/auth/sessions'),

  revokeSession: (id: string): Promise<{ success: boolean }> =>
    apiClient.delete<{ success: boolean }>(`/auth/sessions/${id}`),

  revokeOtherSessions: (): Promise<{ success: boolean }> =>
    apiClient.delete<{ success: boolean }>('/auth/sessions-revoke-others'),
};
