import { apiClient } from "../api-client";

export interface NotificationDto {
  id: string;
  userId?: string | null;
  module: string;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  priority: string;
  isRead: boolean;
  isArchived: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationPreferenceDto {
  id: string;
  userId: string;
  categoriesJson: Record<string, boolean>;
  priorityThreshold: string;
  emailEnabled: boolean;
  desktopEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  updatedAt: string;
}

export interface WorkflowRuleDto {
  id: string;
  name: string;
  description?: string | null;
  triggerType: string;
  conditionsJson: Array<{ field: string; operator: string; value: unknown }>;
  actionsJson: Array<{ actionType: string; payload: Record<string, unknown> }>;
  isActive: boolean;
  createdAt: string;
}

export const notificationsApi = {
  getUserNotifications: (userId?: string): Promise<NotificationDto[]> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return apiClient.get<NotificationDto[]>(`/notifications${query}`);
  },

  getUnreadCount: (userId?: string): Promise<{ unread: number }> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return apiClient.get<{ unread: number }>(
      `/notifications/unread-count${query}`,
    );
  },

  markAsRead: (id: string): Promise<NotificationDto> => {
    return apiClient.post<NotificationDto>(`/notifications/${id}/read`, {});
  },

  markAllAsRead: (userId?: string): Promise<{ success: boolean }> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    return apiClient.post<{ success: boolean }>(
      `/notifications/read-all${query}`,
      {},
    );
  },

  getPreferences: (userId: string): Promise<NotificationPreferenceDto> => {
    return apiClient.get<NotificationPreferenceDto>(
      `/notifications/preferences?userId=${encodeURIComponent(userId)}`,
    );
  },

  updatePreferences: (
    userId: string,
    data: Partial<NotificationPreferenceDto>,
  ): Promise<NotificationPreferenceDto> => {
    return apiClient.put<NotificationPreferenceDto>(
      `/notifications/preferences?userId=${encodeURIComponent(userId)}`,
      data,
    );
  },

  getWorkflows: (): Promise<WorkflowRuleDto[]> => {
    return apiClient.get<WorkflowRuleDto[]>("/workflows");
  },

  createWorkflow: (data: {
    name: string;
    description?: string;
    triggerType: string;
    conditionsJson: Array<{ field: string; operator: string; value: unknown }>;
    actionsJson: Array<{
      actionType: string;
      payload: Record<string, unknown>;
    }>;
    isActive?: boolean;
  }): Promise<WorkflowRuleDto> => {
    return apiClient.post<WorkflowRuleDto>("/workflows", data);
  },

  evaluateTriggers: (
    triggerType: string,
    contextData: Record<string, unknown>,
  ): Promise<{ evaluatedRulesCount: number }> => {
    return apiClient.post<{ evaluatedRulesCount: number }>(
      "/workflows/evaluate",
      { triggerType, contextData },
    );
  },
};
