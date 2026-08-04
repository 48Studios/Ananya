import { apiClient } from '../api-client';

export interface UserProfileDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string | null;
  status: string;
  roleId?: string | null;
  roleName?: string;
  permissions?: string[];
  secondaryRoleIds?: string[];
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface PermissionGroup {
  category: string;
  module?: string;
  permissions: Array<{ code: string; name: string; description: string }>;
}

export interface SessionDto {
  id: string;
  deviceInfo?: string | null;
  ipAddress?: string | null;
  lastActiveAt?: string | null;
  expiresAt?: string | null;
  isCurrent?: boolean;
}

export interface LoginPayload {
  token: string;
  user: UserProfileDto;
  permissions?: string[];
  permissionGroups?: PermissionGroup[];
}

export interface SetupStatusDto {
  isCompleted: boolean;
  completedAt?: string | null;
}

export interface UserInvitationDto {
  id: string;
  email: string;
  roleId?: string | null;
  department?: string | null;
  token: string;
  expiresAt: string;
  status: string;
}

export const authApi = {
  login: (email: string, password: string): Promise<LoginPayload> => {
    return apiClient.post<LoginPayload>('/auth/login', { email, password });
  },

  logout: (): Promise<{ success: boolean }> => {
    return apiClient.post<{ success: boolean }>('/auth/logout', {});
  },

  getMe: (): Promise<LoginPayload> => {
    return apiClient.get<LoginPayload>('/auth/me');
  },

  changePassword: (data: { currentPassword?: string; newPassword?: string }): Promise<{ success: boolean }> => {
    return apiClient.post<{ success: boolean }>('/auth/change-password', data);
  },

  getSessions: (): Promise<SessionDto[]> => {
    return apiClient.get<SessionDto[]>('/auth/sessions');
  },

  revokeSession: (id: string): Promise<{ success: boolean }> => {
    return apiClient.post<{ success: boolean }>(`/auth/sessions/${id}/revoke`, {});
  },

  revokeOtherSessions: (): Promise<{ success: boolean }> => {
    return apiClient.post<{ success: boolean }>('/auth/revoke-sessions', {});
  },

  getSetupStatus: (): Promise<SetupStatusDto> => {
    return apiClient.get<SetupStatusDto>('/auth/setup-status');
  },

  setupOrganization: (data: {
    companyName: string;
    legalName: string;
    taxId: string;
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName: string;
    baseCurrency?: string;
    primaryTimezone?: string;
  }): Promise<{ success: boolean }> => {
    return apiClient.post<{ success: boolean }>('/auth/setup-organization', data);
  },

  verifyInvitation: (token: string): Promise<UserInvitationDto> => {
    return apiClient.get<UserInvitationDto>(`/auth/invitations/verify/${encodeURIComponent(token)}`);
  },

  acceptInvitation: (data: {
    token: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<{ id: string; email: string }> => {
    return apiClient.post<{ id: string; email: string }>('/auth/invitations/accept', data);
  },

  createInvitation: (data: { email: string; roleId?: string; department?: string }): Promise<UserInvitationDto> => {
    return apiClient.post<UserInvitationDto>('/auth/invitations', data);
  },
};
