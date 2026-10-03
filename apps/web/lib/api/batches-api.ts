import { apiClient } from "../api-client";

/**
 * Mirrors the `Batch` aggregate in `@ananya/inventory`. A batch records which
 * component it belongs to and its dates; it carries no SKU, name or on-hand
 * quantity of its own.
 */
export interface BatchDto {
  id: string;
  componentId: string;
  batchNumber: string;
  manufacturingDate?: string | null;
  expiryDate?: string | null;
  supplierBatchNumber?: string | null;
  createdAt: string;
}

export interface CreateBatchPayload {
  componentId: string;
  batchNumber: string;
  manufacturingDate?: string;
  expiryDate?: string;
  supplierBatchNumber?: string;
}

export const batchesApi = {
  getAll: async (): Promise<BatchDto[]> => {
    return apiClient.get<BatchDto[]>("/batches");
  },
  getByComponent: async (componentId: string): Promise<BatchDto[]> => {
    return apiClient.get<BatchDto[]>(`/batches/component/${componentId}`);
  },
  create: async (data: CreateBatchPayload): Promise<BatchDto> => {
    return apiClient.post<BatchDto>("/batches", data);
  },
};
