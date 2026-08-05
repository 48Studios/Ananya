import { apiClient } from "../api-client";

export type TransactionType =
  | "Receipt"
  | "Issue"
  | "Transfer"
  | "Adjustment"
  | "Return"
  | "Consumption"
  | "Production"
  | "ManualCorrection"
  | "InitialStock";

export interface InventoryTransactionDto {
  id: string;
  componentId: string;
  quantity: number;
  unitOfMeasure: string;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
  transactionType: TransactionType;
  reference?: string | null;
  reason?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface FindManyTransactionsOptions {
  componentId?: string;
  locationId?: string;
  transactionType?: TransactionType;
  reference?: string;
  createdBy?: string;
  search?: string;
}

export const inventoryTransactionsApi = {
  getAll: (
    options?: FindManyTransactionsOptions,
  ): Promise<InventoryTransactionDto[]> => {
    const params = new URLSearchParams();
    if (options?.componentId) params.append("componentId", options.componentId);
    if (options?.locationId) params.append("locationId", options.locationId);
    if (options?.transactionType)
      params.append("transactionType", options.transactionType);
    if (options?.reference) params.append("reference", options.reference);
    if (options?.createdBy) params.append("createdBy", options.createdBy);
    if (options?.search) params.append("search", options.search);

    const queryString = params.toString();
    const url = queryString
      ? `/inventory-transactions?${queryString}`
      : "/inventory-transactions";
    return apiClient.get<InventoryTransactionDto[]>(url);
  },
  getById: (id: string): Promise<InventoryTransactionDto> =>
    apiClient.get<InventoryTransactionDto>(`/inventory-transactions/${id}`),
};
