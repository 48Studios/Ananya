import { apiClient } from "../api-client";

export interface FinishedGoodDto {
  id: string;
  sku: string;
  name: string;
  category: string;
  quantityOnHand: number;
  unitOfMeasure: string;
  warehouseLocation: string;
  unitCost: number;
}

export const finishedGoodsApi = {
  getAll: async (): Promise<FinishedGoodDto[]> => {
    return apiClient.get<FinishedGoodDto[]>("/finished-goods");
  },
  create: async (data: {
    productionOrderId: string;
  }): Promise<FinishedGoodDto> => {
    return apiClient.post<FinishedGoodDto>("/finished-goods", data);
  },
  addLine: async (
    id: string,
    data: {
      componentId: string;
      locationId: string;
      quantityProduced: number;
      quantityScrapped?: number;
      batchNumber?: string;
    },
  ): Promise<unknown> => {
    return apiClient.post(`/finished-goods/${id}/lines`, data);
  },
  post: async (id: string): Promise<unknown> => {
    return apiClient.post(`/finished-goods/${id}/post`, {});
  },
};
