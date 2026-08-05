import { apiClient } from "../api-client";

export interface DataPackCatalogDto {
  id: string;
  name: string;
  category: "Core Lookup" | "Infrastructure" | "Demo Data";
  description: string;
  entityType: string;
  recordCount: number;
}

export interface DataPackInstallResultDto {
  success: boolean;
  packId: string;
  packName: string;
  processedRecords: number;
  jobId: string;
}

export const dataPacksApi = {
  getCatalog: (): Promise<DataPackCatalogDto[]> => {
    return apiClient.get<DataPackCatalogDto[]>("/data-packs");
  },

  installPack: (id: string): Promise<DataPackInstallResultDto> => {
    return apiClient.post<DataPackInstallResultDto>(
      `/data-packs/${encodeURIComponent(id)}/install`,
      {},
    );
  },
};
