import { apiClient } from "../api-client";

export interface MaterialConsumptionDto {
  id: string;
  workOrderNumber: string;
  componentSku: string;
  componentName: string;
  quantityConsumed: number;
  unitOfMeasure: string;
  consumedBy: string;
  consumedAt: string;
}

export const materialConsumptionApi = {
  getAll: async (): Promise<MaterialConsumptionDto[]> => {
    return apiClient.get<MaterialConsumptionDto[]>("/material-consumptions");
  },
  create: async (data: { productionOrderId: string }): Promise<MaterialConsumptionDto> => {
    return apiClient.post<MaterialConsumptionDto>("/material-consumptions", data);
  },
  addLine: async (
    id: string,
    data: {
      componentId: string;
      locationId: string;
      quantityConsumed: number;
      quantityPlanned?: number;
      batchNumber?: string;
    },
  ): Promise<unknown> => {
    return apiClient.post(`/material-consumptions/${id}/lines`, data);
  },
  post: async (id: string): Promise<unknown> => {
    return apiClient.post(`/material-consumptions/${id}/post`, {});
  },
};

