import { apiClient } from "../api-client";

export interface ActivityEventDto {
  id: string;
  eventType: string;
  module: string;
  entityType: string;
  entityId: string;
  entityTitle?: string | null;
  description: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  status: string;
  severity: string;
  href?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SecurityAuditLogDto {
  id: string;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  category: string;
  ipAddress?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export const activityApi = {
  getFeed: (params?: {
    module?: string;
    eventType?: string;
    entityType?: string;
    severity?: string;
    search?: string;
    limit?: number;
  }): Promise<ActivityEventDto[]> => {
    const searchParams = new URLSearchParams();
    if (params?.module) searchParams.append("module", params.module);
    if (params?.eventType) searchParams.append("eventType", params.eventType);
    if (params?.entityType)
      searchParams.append("entityType", params.entityType);
    if (params?.severity) searchParams.append("severity", params.severity);
    if (params?.search) searchParams.append("search", params.search);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return apiClient.get<ActivityEventDto[]>(
      `/activity${query ? `?${query}` : ""}`,
    );
  },

  getEntityEvents: (
    entityType: string,
    entityId: string,
  ): Promise<ActivityEventDto[]> => {
    return apiClient.get<ActivityEventDto[]>(
      `/activity/entity/${entityType}/${entityId}`,
    );
  },

  getUserEvents: (userId: string): Promise<ActivityEventDto[]> => {
    return apiClient.get<ActivityEventDto[]>(`/activity/user/${userId}`);
  },

  getAuditTrail: (params?: {
    module?: string;
    userId?: string;
    search?: string;
    limit?: number;
  }): Promise<SecurityAuditLogDto[]> => {
    const searchParams = new URLSearchParams();
    if (params?.module) searchParams.append("module", params.module);
    if (params?.userId) searchParams.append("userId", params.userId);
    if (params?.search) searchParams.append("search", params.search);
    if (params?.limit) searchParams.append("limit", params.limit.toString());
    const query = searchParams.toString();
    return apiClient.get<SecurityAuditLogDto[]>(
      `/activity/audit${query ? `?${query}` : ""}`,
    );
  },

  createEvent: (dto: Partial<ActivityEventDto>): Promise<ActivityEventDto> => {
    return apiClient.post<ActivityEventDto>("/activity", dto);
  },
};
