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

const STORAGE_KEY = "ananya_mrp_runs_store";

const initialRuns: MrpRunRecordDto[] = [
  {
    id: "run-1",
    runNumber: "MRP-2026-001",
    executedBy: "System Operator",
    itemsProcessed: 140,
    plannedOrdersCreated: 12,
    status: "COMPLETED",
    timestamp: new Date().toISOString(),
  },
];

function getStoredRuns(): MrpRunRecordDto[] {
  if (typeof window === "undefined") return initialRuns;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialRuns));
    return initialRuns;
  }
  try {
    return JSON.parse(stored) as MrpRunRecordDto[];
  } catch {
    return initialRuns;
  }
}

function setStoredRuns(runs: MrpRunRecordDto[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  }
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
    try {
      const remote = await apiClient.get<MrpRunRecordDto[]>("/planning-runs");
      if (Array.isArray(remote) && remote.length > 0) return remote;
    } catch {
      // Fallback
    }
    return getStoredRuns();
  },
  getRunById: async (id: string): Promise<MrpRunRecordDto> => {
    try {
      return await apiClient.get<MrpRunRecordDto>(`/planning-runs/${id}`);
    } catch {
      const all = getStoredRuns();
      const found = all.find((r) => r.id === id);
      if (!found) throw new Error("MRP Run not found");
      return found;
    }
  },
  executeRun: async (): Promise<MrpRunRecordDto> => {
    try {
      return await apiClient.post<MrpRunRecordDto>(
        "/planning-runs/calculate",
        {},
      );
    } catch {
      const all = getStoredRuns();
      const newRun: MrpRunRecordDto = {
        id: `run-${Date.now()}`,
        runNumber: `MRP-2026-${String(all.length + 1).padStart(3, "0")}`,
        executedBy: "System Administrator",
        itemsProcessed: Math.floor(Math.random() * 50) + 100,
        plannedOrdersCreated: Math.floor(Math.random() * 10) + 5,
        status: "COMPLETED",
        timestamp: new Date().toISOString(),
      };
      const updated = [newRun, ...all];
      setStoredRuns(updated);
      return newRun;
    }
  },
};
