import { apiClient } from "../api-client";

export type InventoryAlertType = "LOW_STOCK" | "OUT_OF_STOCK";
export type InventoryAlertStatus = "ACTIVE" | "RESOLVED";

export interface InventoryAlertDto {
  id: string;
  componentId: string;
  alertType: InventoryAlertType;
  status: InventoryAlertStatus;
  onHandQuantity: string;
  availableQuantity: string;
  shortageQuantity: string;
  lastEvaluatedAt: string;
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAlertSummaryDto {
  active: number;
  lowStock: number;
  outOfStock: number;
}

export interface ListAlertsOptions {
  status?: InventoryAlertStatus;
  alertType?: InventoryAlertType;
  componentId?: string;
  limit?: number;
}

export const inventoryAlertsApi = {
  getSummary: (): Promise<InventoryAlertSummaryDto> =>
    apiClient.get<InventoryAlertSummaryDto>("/inventory-alerts/summary"),
  listAlerts: (options?: ListAlertsOptions): Promise<InventoryAlertDto[]> => {
    const params = new URLSearchParams();
    if (options?.status) params.append("status", options.status);
    if (options?.alertType) params.append("alertType", options.alertType);
    if (options?.componentId) params.append("componentId", options.componentId);
    if (options?.limit) params.append("limit", options.limit.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<InventoryAlertDto[]>(`/inventory-alerts${query}`);
  },
};
