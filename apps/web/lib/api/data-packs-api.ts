import { apiClient } from "../api-client";

export interface DataPackCatalogDto {
  id: string;
  name: string;
  category: "Core Lookup" | "Infrastructure" | "Demo Data" | "Domain Specifications" | string;
  description: string;
  entityType: string;
  recordCount: number;
  isInstalled?: boolean;
  installedAt?: string | null;
}

export interface DataPackInstallResultDto {
  success: boolean;
  packId: string;
  packName: string;
  processedRecords: number;
  jobId: string;
}

export interface DataPackDetailDto extends DataPackCatalogDto {
  rows?: Array<Record<string, unknown>>;
  units?: Array<{
    name: string;
    category: string;
    isBaseUnit?: boolean;
    conversionFactor: string;
    precision: string;
  }>;
  categories?: Array<{
    code: string;
    name: string;
    description: string;
    parentCode: string | null;
  }>;
  attributeDefinitions?: Array<{
    code: string;
    name: string;
    description?: string;
    dataType: string;
    unitCategory?: string;
    defaultUnit?: string;
    isFilterable?: boolean;
    options?: Array<{ code: string; label: string; sortOrder?: number }>;
  }>;
  categoryMappings?: Array<{
    categoryCode: string;
    attributeCode: string;
    isRequired: boolean;
    sortOrder: number;
  }>;
  categoryBindings?: Array<{
    categoryCode: string;
    attributeCode: string;
    isRequired: boolean;
    sortOrder: number;
  }>;
}

export const dataPacksApi = {
  getCatalog: (): Promise<DataPackCatalogDto[]> => {
    return apiClient.get<DataPackCatalogDto[]>("/data-packs");
  },

  getPackById: (id: string): Promise<DataPackDetailDto> => {
    return apiClient.get<DataPackDetailDto>(
      `/data-packs/${encodeURIComponent(id)}`,
    );
  },

  installPack: (id: string): Promise<DataPackInstallResultDto> => {
    return apiClient.post<DataPackInstallResultDto>(
      `/data-packs/${encodeURIComponent(id)}/install`,
      {},
    );
  },
};
