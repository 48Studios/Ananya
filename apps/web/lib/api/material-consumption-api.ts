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
};
