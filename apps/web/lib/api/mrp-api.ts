import { apiClient } from "../api-client";
import { componentsApi } from "./components-api";
import { suppliersApi } from "./suppliers-api";

export interface MrpRequirementDto {
  id: string;
  planningRunId: string;
  componentId: string;
  sku: string;
  componentName: string;
  grossDemand: number;
  availableStock: number;
  reservedStock: number;
  shortageQuantity: number;
  requiredDate: string;
  recommendedAction: "RELEASE_PO" | "RELEASE_WO" | "NONE";
}

export interface MaterialShortageDto {
  id: string;
  sku: string;
  componentName: string;
  requiredByDate: string;
  suggestedPoQuantity: number;
}

export interface PlannedProductionOrderDto {
  id: string;
  planningRunId: string;
  plannedOrderNumber: string;
  assemblySku: string;
  assemblyName: string;
  suggestedQuantity: number;
  scheduledStartDate: string;
  scheduledCompletionDate: string;
  status: string;
}

export interface PlannedPurchaseOrderDto {
  id: string;
  planningRunId: string;
  plannedPoNumber: string;
  supplierName: string | null;
  componentSku: string;
  componentName: string;
  quantityToOrder: number;
  releaseDate: string;
  status: string;
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
  startedBy: string;
  horizonDays: number;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

interface MaterialRequirementRecord {
  id: string;
  planningRunId: string;
  componentId: string;
  requiredQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  shortageQuantity: number;
  requiredDate: string;
}

interface ProductionRecommendationRecord {
  id: string;
  planningRunId: string;
  productId: string;
  suggestedQuantity: number;
  suggestedStart: string;
  suggestedCompletion: string;
  status: string;
}

interface PurchaseRecommendationRecord {
  id: string;
  planningRunId: string;
  componentId: string;
  supplierId?: string | null;
  suggestedQuantity: number;
  requiredDate: string;
  status: string;
}

function buildQuery(path: string, params?: Record<string, string | undefined>) {
  if (!params) return path;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export const mrpApi = {
  async getGrossRequirements(planningRunId?: string): Promise<MrpRequirementDto[]> {
    const [requirements, components] = await Promise.all([
      apiClient.get<MaterialRequirementRecord[]>(
        buildQuery("/material-requirements", { planningRunId }),
      ),
      componentsApi.getAll(),
    ]);

    const componentById = new Map(components.map((component) => [component.id, component]));

    return requirements.map((requirement) => {
      const component = componentById.get(requirement.componentId);
      const shortageQuantity = Number(requirement.shortageQuantity ?? 0);

      return {
        id: requirement.id,
        planningRunId: requirement.planningRunId,
        componentId: requirement.componentId,
        sku: component?.sku ?? requirement.componentId,
        componentName: component?.name ?? "Unknown component",
        grossDemand: Number(requirement.requiredQuantity ?? 0),
        availableStock: Number(requirement.availableQuantity ?? 0),
        reservedStock: Number(requirement.reservedQuantity ?? 0),
        shortageQuantity,
        requiredDate: requirement.requiredDate,
        recommendedAction: shortageQuantity <= 0 ? "NONE" : "RELEASE_PO",
      };
    });
  },

  async getShortages(planningRunId?: string): Promise<MaterialShortageDto[]> {
    const requirements = await mrpApi.getGrossRequirements(planningRunId);

    return requirements
      .filter((requirement) => requirement.shortageQuantity > 0)
      .map((requirement) => ({
        id: requirement.id,
        sku: requirement.sku,
        componentName: requirement.componentName,
        requiredByDate: requirement.requiredDate,
        suggestedPoQuantity: requirement.shortageQuantity,
      }));
  },

  async getProductionRecommendations(
    planningRunId?: string,
  ): Promise<PlannedProductionOrderDto[]> {
    const [recommendations, components] = await Promise.all([
      apiClient.get<ProductionRecommendationRecord[]>(
        buildQuery("/production-recommendations", { planningRunId }),
      ),
      componentsApi.getAll(),
    ]);

    const componentById = new Map(components.map((component) => [component.id, component]));

    return recommendations.map((recommendation) => {
      const component = componentById.get(recommendation.productId);

      return {
        id: recommendation.id,
        planningRunId: recommendation.planningRunId,
        plannedOrderNumber: `PLAN-WO-${recommendation.id.slice(0, 8).toUpperCase()}`,
        assemblySku: component?.sku ?? recommendation.productId,
        assemblyName: component?.name ?? "Unknown assembly",
        suggestedQuantity: Number(recommendation.suggestedQuantity ?? 0),
        scheduledStartDate: recommendation.suggestedStart,
        scheduledCompletionDate: recommendation.suggestedCompletion,
        status: recommendation.status,
      };
    });
  },

  async getPurchaseRecommendations(
    planningRunId?: string,
  ): Promise<PlannedPurchaseOrderDto[]> {
    const [recommendations, components, suppliers] = await Promise.all([
      apiClient.get<PurchaseRecommendationRecord[]>(
        buildQuery("/purchase-recommendations", { planningRunId }),
      ),
      componentsApi.getAll(),
      suppliersApi.getAll().catch(() => []),
    ]);

    const componentById = new Map(components.map((component) => [component.id, component]));
    const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

    return recommendations.map((recommendation) => {
      const component = componentById.get(recommendation.componentId);
      const supplier = recommendation.supplierId
        ? supplierById.get(recommendation.supplierId)
        : undefined;

      return {
        id: recommendation.id,
        planningRunId: recommendation.planningRunId,
        plannedPoNumber: `PLAN-PO-${recommendation.id.slice(0, 8).toUpperCase()}`,
        supplierName: supplier?.name ?? null,
        componentSku: component?.sku ?? recommendation.componentId,
        componentName: component?.name ?? "Unknown component",
        quantityToOrder: Number(recommendation.suggestedQuantity ?? 0),
        releaseDate: recommendation.requiredDate,
        status: recommendation.status,
      };
    });
  },

  getCapacityPlans: async (planningRunId?: string): Promise<WorkCenterCapacityDto[]> =>
    apiClient.get<WorkCenterCapacityDto[]>(
      buildQuery("/capacity-plans", { planningRunId }),
    ),

  getRuns: async (): Promise<MrpRunRecordDto[]> =>
    apiClient.get<MrpRunRecordDto[]>("/planning-runs"),

  getRunById: async (id: string): Promise<MrpRunRecordDto> =>
    apiClient.get<MrpRunRecordDto>(`/planning-runs/${id}`),

  executeRun: async (): Promise<MrpRunRecordDto> =>
    apiClient.post<MrpRunRecordDto, { horizonDays: number; startedBy: string }>(
      "/planning-runs",
      {
        horizonDays: 30,
        startedBy: "Web UI",
      },
    ),
};
