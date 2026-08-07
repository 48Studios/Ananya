import { apiClient } from "../api-client";

export interface BatchDto {
  id: string;
  componentId: string;
  componentSku: string;
  sku?: string;
  componentName: string;
  batchNumber: string;
  supplierBatchNumber?: string | null;
  manufacturingDate?: string | null;
  manufactureDate?: string | null;
  expiryDate?: string | null;
  quantityOnHand?: number;
  status?: "ACTIVE" | "EXPIRED" | "QUARANTINED";
  createdAt: string;
  updatedAt?: string;
}

export interface CreateBatchPayload {
  batchNumber: string;
  sku: string;
  componentName: string;
  quantityOnHand: number;
  manufactureDate: string;
  expiryDate: string;
  status?: "ACTIVE" | "EXPIRED" | "QUARANTINED";
}

export type UpdateBatchPayload = Partial<CreateBatchPayload>;

export const batchesApi = {
  getAll: async (): Promise<BatchDto[]> =>
    apiClient.get<BatchDto[]>("/batches"),
  getById: async (id: string): Promise<BatchDto> =>
    apiClient.get<BatchDto>(`/batches/${id}`),
  create: async (payload: CreateBatchPayload): Promise<BatchDto> => {
    void payload;
    throw new Error(
      "Batch creation requires a component-based workflow and is not available from this read-only registry.",
    );
  },
  update: async (
    id: string,
    payload: UpdateBatchPayload,
  ): Promise<BatchDto> => {
    void id;
    void payload;
    throw new Error(
      "Batch updates are not supported by the current batch registry API.",
    );
  },
};
