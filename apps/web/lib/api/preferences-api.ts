import { apiClient } from '../api-client';

export interface DashboardWidgetConfig {
  id: string;
  title: string;
  enabled: boolean;
  width: 'full' | 'half';
}

export interface DashboardLayoutDto {
  id: string;
  userId: string;
  widgetsJson: DashboardWidgetConfig[];
  updatedAt: string;
}

export interface SavedViewDto {
  id: string;
  userId: string;
  module: string;
  name: string;
  filtersJson?: Record<string, unknown> | null;
  sortJson?: { field: string; direction: 'asc' | 'desc' } | null;
  columnsJson?: string[] | null;
  isDefault: boolean;
  createdAt: string;
}

export interface FavoriteDto {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  title: string;
  href: string;
  createdAt: string;
}

export interface WorkspacePreferenceDto {
  id: string;
  userId: string;
  defaultLandingPage: string;
  tableDensity: string;
  themePreference: string;
  updatedAt: string;
}

export const preferencesApi = {
  getDashboardLayout: (userId?: string): Promise<DashboardLayoutDto> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiClient.get<DashboardLayoutDto>(`/preferences/dashboard${query}`);
  },

  updateDashboardLayout: (widgetsJson: DashboardWidgetConfig[], userId?: string): Promise<DashboardLayoutDto> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiClient.put<DashboardLayoutDto>(`/preferences/dashboard${query}`, { widgetsJson });
  },

  getSavedViews: (module?: string, userId?: string): Promise<SavedViewDto[]> => {
    const params = new URLSearchParams();
    if (userId) params.append('userId', userId);
    if (module) params.append('module', module);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<SavedViewDto[]>(`/preferences/saved-views${query}`);
  },

  createSavedView: (data: {
    module: string;
    name: string;
    filtersJson?: Record<string, unknown>;
    sortJson?: { field: string; direction: 'asc' | 'desc' };
    columnsJson?: string[];
    isDefault?: boolean;
  }, userId?: string): Promise<SavedViewDto> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiClient.post<SavedViewDto>(`/preferences/saved-views${query}`, data);
  },

  getFavorites: (userId?: string): Promise<FavoriteDto[]> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiClient.get<FavoriteDto[]>(`/preferences/favorites${query}`);
  },

  addFavorite: (data: { entityType: string; entityId: string; title: string; href: string }, userId?: string): Promise<FavoriteDto> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiClient.post<FavoriteDto>(`/preferences/favorites${query}`, data);
  },

  removeFavorite: (id: string, userId?: string): Promise<{ success: boolean }> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiClient.delete<{ success: boolean }>(`/preferences/favorites/${id}${query}`);
  },

  getWorkspacePreferences: (userId?: string): Promise<WorkspacePreferenceDto> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiClient.get<WorkspacePreferenceDto>(`/preferences/workspace${query}`);
  },

  updateWorkspacePreferences: (data: Partial<WorkspacePreferenceDto>, userId?: string): Promise<WorkspacePreferenceDto> => {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return apiClient.put<WorkspacePreferenceDto>(`/preferences/workspace${query}`, data);
  },
};
