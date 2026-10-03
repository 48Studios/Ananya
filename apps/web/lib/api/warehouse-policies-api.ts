import { apiClient } from "../api-client";

/**
 * Mirrors the `WarehousePolicy` aggregate in `@ananya/inventory`.
 *
 * A policy belongs to a warehouse and is expressed as rules (booleans) plus
 * optional default bins — there is no policy name, no picking/putaway rule enum
 * and no warehouse name in the domain. The API is the source of truth; this
 * client never seeds placeholder policies.
 */
export interface WarehousePolicyDto {
  id: string;
  warehouseId: string;
  allowNegativeInventory: boolean;
  enforceBinCapacity: boolean;
  directedPutaway: boolean;
  directedPicking: boolean;
  defaultReceivingBinId?: string | null;
  defaultProductionBinId?: string | null;
  defaultShippingBinId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface SaveWarehousePolicyPayload {
  warehouseId: string;
  allowNegativeInventory?: boolean;
  enforceBinCapacity?: boolean;
  directedPutaway?: boolean;
  directedPicking?: boolean;
  defaultReceivingBinId?: string;
  defaultProductionBinId?: string;
  defaultShippingBinId?: string;
}

export const warehousePoliciesApi = {
  getAll: async (): Promise<WarehousePolicyDto[]> => {
    return apiClient.get<WarehousePolicyDto[]>("/warehouse-policies");
  },
  getByWarehouse: async (warehouseId: string): Promise<WarehousePolicyDto> => {
    return apiClient.get<WarehousePolicyDto>(
      `/warehouse-policies/warehouse/${warehouseId}`,
    );
  },
  save: async (
    payload: SaveWarehousePolicyPayload,
  ): Promise<WarehousePolicyDto> => {
    return apiClient.post<WarehousePolicyDto, SaveWarehousePolicyPayload>(
      "/warehouse-policies",
      payload,
    );
  },
};
