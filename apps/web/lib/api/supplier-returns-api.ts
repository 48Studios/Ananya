import { apiClient } from "../api-client";

export type SupplierReturnStatus =
  | "DRAFT"
  | "APPROVED"
  | "DISPATCHED"
  | "COMPLETED"
  | "CANCELLED";

export interface SupplierReturnLineDto {
  id: string;
  supplierReturnId: string;
  componentId: string;
  locationId: string;
  quantityReturned: number;
  unitPrice: number;
  reason: string;
  batchNumber?: string | null;
  serialNumbers?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SupplierReturnDto {
  id: string;
  returnNumber: string;
  supplierId: string;
  /** Resolved by the caller from the suppliers API; the API returns only the id. */
  supplierName?: string;
  purchaseOrderId?: string | null;
  /** Resolved by the caller from the purchase orders API. */
  poNumber?: string;
  rmaNumber?: string | null;
  totalAmount: number;
  status: SupplierReturnStatus;
  dispatchedAt?: string | null;
  lines: SupplierReturnLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierReturnPayload {
  supplierId: string;
  purchaseOrderId?: string;
  rmaNumber?: string;
}

export interface UpdateSupplierReturnPayload {
  supplierId?: string;
  purchaseOrderId?: string;
  rmaNumber?: string;
}

export interface AddSupplierReturnLinePayload {
  componentId: string;
  locationId: string;
  quantityReturned: number;
  unitPrice: number;
  reason: string;
  batchNumber?: string;
  serialNumbers?: string[];
}

export const supplierReturnsApi = {
  getAll: async (options?: {
    supplierId?: string;
    status?: string;
  }): Promise<SupplierReturnDto[]> => {
    const params = new URLSearchParams();
    if (options?.supplierId) params.append("supplierId", options.supplierId);
    if (options?.status) params.append("status", options.status);
    const qs = params.toString();
    return apiClient.get<SupplierReturnDto[]>(
      qs ? `/supplier-returns?${qs}` : "/supplier-returns",
    );
  },
  getById: async (id: string): Promise<SupplierReturnDto> => {
    return apiClient.get<SupplierReturnDto>(`/supplier-returns/${id}`);
  },
  create: async (
    data: CreateSupplierReturnPayload,
  ): Promise<SupplierReturnDto> => {
    return apiClient.post<SupplierReturnDto>("/supplier-returns", data);
  },
  update: async (
    id: string,
    data: UpdateSupplierReturnPayload,
  ): Promise<SupplierReturnDto> => {
    return apiClient.put<SupplierReturnDto>(`/supplier-returns/${id}`, data);
  },
  delete: async (id: string): Promise<void> => {
    return apiClient.delete<void>(`/supplier-returns/${id}`);
  },
  updateStatus: async (
    id: string,
    data: { status: string; rmaNumber?: string },
  ): Promise<SupplierReturnDto> => {
    return apiClient.patch<SupplierReturnDto>(
      `/supplier-returns/${id}/status`,
      data,
    );
  },
  addLine: async (
    id: string,
    data: AddSupplierReturnLinePayload,
  ): Promise<SupplierReturnDto> => {
    return apiClient.post<SupplierReturnDto>(
      `/supplier-returns/${id}/lines`,
      data,
    );
  },
  removeLine: async (
    id: string,
    lineId: string,
  ): Promise<SupplierReturnDto> => {
    return apiClient.delete<SupplierReturnDto>(
      `/supplier-returns/${id}/lines/${lineId}`,
    );
  },
  approve: async (
    id: string,
    rmaNumber?: string,
  ): Promise<SupplierReturnDto> => {
    return apiClient.post<SupplierReturnDto>(
      `/supplier-returns/${id}/approve`,
      { rmaNumber },
    );
  },
  dispatch: async (id: string): Promise<SupplierReturnDto> => {
    return apiClient.post<SupplierReturnDto>(
      `/supplier-returns/${id}/dispatch`,
      {},
    );
  },
  complete: async (id: string): Promise<SupplierReturnDto> => {
    return apiClient.post<SupplierReturnDto>(
      `/supplier-returns/${id}/complete`,
      {},
    );
  },
  cancel: async (id: string): Promise<SupplierReturnDto> => {
    return apiClient.post<SupplierReturnDto>(
      `/supplier-returns/${id}/cancel`,
      {},
    );
  },
};
