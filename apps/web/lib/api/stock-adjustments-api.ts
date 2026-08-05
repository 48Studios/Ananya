import { apiClient } from "../api-client";

export type StockAdjustmentStatus = "PENDING" | "APPROVED" | "CANCELLED";

export interface StockAdjustmentLineDto {
  id: string;
  stockAdjustmentId: string;
  componentId: string;
  currentQuantity: number;
  countedQuantity: number;
  difference: number;
  unitOfMeasure: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockAdjustmentDto {
  id: string;
  adjustmentNumber: string;
  locationId: string;
  status: StockAdjustmentStatus;
  reason: string;
  notes?: string | null;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  lines: StockAdjustmentLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateStockAdjustmentLinePayload {
  componentId: string;
  currentQuantity: number;
  countedQuantity: number;
  unitOfMeasure?: string;
}

export interface CreateStockAdjustmentPayload {
  locationId: string;
  reason: string;
  notes?: string | null;
  createdBy?: string;
  lines: CreateStockAdjustmentLinePayload[];
}

export interface FindManyStockAdjustmentsOptions {
  locationId?: string;
  componentId?: string;
  status?: StockAdjustmentStatus;
  search?: string;
}

export const stockAdjustmentsApi = {
  getAll: (
    options?: FindManyStockAdjustmentsOptions,
  ): Promise<StockAdjustmentDto[]> => {
    const params = new URLSearchParams();
    if (options?.locationId) params.append("locationId", options.locationId);
    if (options?.componentId) params.append("componentId", options.componentId);
    if (options?.status) params.append("status", options.status);
    if (options?.search) params.append("search", options.search);

    const queryString = params.toString();
    const url = queryString
      ? `/stock-adjustments?${queryString}`
      : "/stock-adjustments";
    return apiClient.get<StockAdjustmentDto[]>(url);
  },
  getById: (id: string): Promise<StockAdjustmentDto> =>
    apiClient.get<StockAdjustmentDto>(`/stock-adjustments/${id}`),
  create: (
    payload: CreateStockAdjustmentPayload,
  ): Promise<StockAdjustmentDto> =>
    apiClient.post<StockAdjustmentDto, CreateStockAdjustmentPayload>(
      "/stock-adjustments",
      payload,
    ),
  approve: (id: string, approvedBy?: string): Promise<StockAdjustmentDto> =>
    apiClient.post<StockAdjustmentDto, { approvedBy?: string }>(
      `/stock-adjustments/${id}/approve`,
      {
        approvedBy,
      },
    ),
  cancel: (id: string): Promise<StockAdjustmentDto> =>
    apiClient.post<StockAdjustmentDto, Record<string, never>>(
      `/stock-adjustments/${id}/cancel`,
      {},
    ),
};
