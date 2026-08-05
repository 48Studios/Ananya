import { apiClient } from "../api-client";

export interface OrganizationProfileDto {
  id: string;
  companyName: string;
  legalName: string;
  registrationNumber?: string | null;
  taxId: string;
  email: string;
  phone: string;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postalCode?: string | null;
  primaryTimezone?: string | null;
  logoUrl?: string | null;
  updatedAt: string;
}

export interface SystemSettingsDto {
  id: string;
  baseCurrency: string;
  supportedCurrencies: string[];
  defaultWarehouseId?: string | null;
  fiscalYearStartMonth: number;
  dateFormat: string;
  reorderDefaultsJson?: Record<string, number> | null;
  taxRatesJson?: Array<{ name: string; rate: number }> | null;
  updatedAt: string;
}

export interface NumberingSeriesDto {
  id: string;
  entityType: string;
  prefix: string;
  dateFormat?: string | null;
  nextSequenceNumber: number;
  zeroPadLength: number;
  updatedAt: string;
}

export interface FeatureFlagDto {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  category: string;
  isEnabled: boolean;
  updatedAt: string;
}

export const settingsApi = {
  getOrganizationProfile: (): Promise<OrganizationProfileDto> => {
    return apiClient.get<OrganizationProfileDto>("/settings/organization");
  },

  updateOrganizationProfile: (
    data: Partial<OrganizationProfileDto>,
  ): Promise<OrganizationProfileDto> => {
    return apiClient.put<OrganizationProfileDto>(
      "/settings/organization",
      data,
    );
  },

  getSystemSettings: (): Promise<SystemSettingsDto> => {
    return apiClient.get<SystemSettingsDto>("/settings/system");
  },

  updateSystemSettings: (
    data: Partial<SystemSettingsDto>,
  ): Promise<SystemSettingsDto> => {
    return apiClient.put<SystemSettingsDto>("/settings/system", data);
  },

  getNumberingSeries: (): Promise<NumberingSeriesDto[]> => {
    return apiClient.get<NumberingSeriesDto[]>("/settings/numbering");
  },

  updateNumberingSeries: (
    data: Partial<NumberingSeriesDto>,
  ): Promise<NumberingSeriesDto> => {
    return apiClient.put<NumberingSeriesDto>("/settings/numbering", data);
  },

  generateDocumentCode: (entityType: string): Promise<string> => {
    return apiClient.post<string>(
      `/settings/numbering/generate/${encodeURIComponent(entityType)}`,
      {},
    );
  },

  getFeatureFlags: (): Promise<FeatureFlagDto[]> => {
    return apiClient.get<FeatureFlagDto[]>("/settings/feature-flags");
  },

  toggleFeatureFlag: (
    key: string,
    isEnabled: boolean,
  ): Promise<FeatureFlagDto> => {
    return apiClient.post<FeatureFlagDto>("/settings/feature-flags", {
      key,
      isEnabled,
    });
  },

  resetOrganizationData: (data: {
    confirmText: string;
    passwordConfirm: string;
  }): Promise<{ success: boolean; message: string; resetAt: string }> => {
    return apiClient.post<{
      success: boolean;
      message: string;
      resetAt: string;
    }>("/settings/organization/reset", data);
  },
};
