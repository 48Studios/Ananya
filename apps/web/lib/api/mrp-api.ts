import { apiClient } from "../api-client";

export interface MrpRequirementDto {
  id: string;
  sku: string;
  componentName: string;
  grossDemand: number;
  availableStock: number;
  shortageQuantity: number;
  recommendedAction: "RELEASE_PO" | "RELEASE_WO" | "NONE";
}

export interface MaterialShortageDto {
  id: string;
  sku: string;
  componentName: string;
  requiredByDate: string;
  leadTimeDays: number;
  suggestedPoQuantity: number;
}

export interface PlannedProductionOrderDto {
  id: string;
  plannedOrderNumber: string;
  assemblySku: string;
  assemblyName: string;
  suggestedQuantity: number;
  scheduledStartDate: string;
}

export interface PlannedPurchaseOrderDto {
  id: string;
  plannedPoNumber: string;
  supplierName: string;
  componentSku: string;
  componentName: string;
  quantityToOrder: number;
  releaseDate: string;
}

export interface WorkCenterCapacityDto {
  id: string;
  workCenterCode: string;
  name: string;
  availableHoursWeekly: number;
  allocatedHoursWeekly: number;
  utilizationPercentage: number;
}

export interface MrpRunRecordDto {
  id: string;
  runNumber: string;
  executedBy: string;
  itemsProcessed: number;
  plannedOrdersCreated: number;
  status: "COMPLETED" | "IN_PROGRESS";
  timestamp: string;
}

export const mrpApi = {
  getGrossRequirements: async (): Promise<MrpRequirementDto[]> => {
    return apiClient.get<MrpRequirementDto[]>("/material-requirements");
  },
  getShortages: async (): Promise<MaterialShortageDto[]> => {
    return apiClient.get<MaterialShortageDto[]>(
      "/material-requirements/shortages",
    );
  },
  getProductionRecommendations: async (): Promise<
    PlannedProductionOrderDto[]
  > => {
    return apiClient.get<PlannedProductionOrderDto[]>(
      "/production-recommendations",
    );
  },
  getPurchaseRecommendations: async (): Promise<PlannedPurchaseOrderDto[]> => {
    return apiClient.get<PlannedPurchaseOrderDto[]>(
      "/purchase-recommendations",
    );
  },
  getCapacityPlans: async (): Promise<WorkCenterCapacityDto[]> => {
    return apiClient.get<WorkCenterCapacityDto[]>("/capacity-plans");
  },
  getRuns: async (): Promise<MrpRunRecordDto[]> => {
    return apiClient.get<MrpRunRecordDto[]>("/planning-runs");
  },
  getRunById: async (id: string): Promise<MrpRunRecordDto> => {
    return apiClient.get<MrpRunRecordDto>(`/planning-runs/${id}`);
  },
};
