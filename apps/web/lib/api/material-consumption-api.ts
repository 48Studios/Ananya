import { apiClient } from "../api-client";

/**
 * Mirrors the `MaterialConsumption` aggregate in `@ananya/manufacturing`. The
 * consumed components live on `lines`; the header itself has no SKU, quantity,
 * unit or operator.
 */
export type ConsumptionStatus = "DRAFT" | "POSTED";

export interface MaterialConsumptionLineDto {
  id: string;
  consumptionId: string;
  componentId: string;
  locationId: string;
  quantityPlanned: number;
  quantityConsumed: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
  consumedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialConsumptionDto {
  id: string;
  consumptionNumber: string;
  productionOrderId: string;
  status: ConsumptionStatus;
  postedAt: string | null;
  lines: MaterialConsumptionLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AddConsumptionLinePayload {
  componentId: string;
  locationId: string;
  quantityConsumed: number;
  quantityPlanned?: number;
  batchNumber?: string;
}

export const materialConsumptionApi = {
  getAll: async (): Promise<MaterialConsumptionDto[]> => {
    return apiClient.get<MaterialConsumptionDto[]>("/material-consumptions");
  },
  create: async (data: {
    productionOrderId: string;
  }): Promise<MaterialConsumptionDto> => {
    return apiClient.post<MaterialConsumptionDto>(
      "/material-consumptions",
      data,
    );
  },
  addLine: async (
    id: string,
    data: AddConsumptionLinePayload,
  ): Promise<unknown> => {
    return apiClient.post(`/material-consumptions/${id}/lines`, data);
  },
  post: async (id: string): Promise<unknown> => {
    return apiClient.post(`/material-consumptions/${id}/post`, {});
  },
};
