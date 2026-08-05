import { apiClient } from "../api-client";

export type PurchaseOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "ISSUED"
  | "PARTIALLY_RECEIVED"
  | "FULFILLED"
  | "CANCELLED";

export interface PurchaseOrderLineDto {
  id: string;
  purchaseOrderId: string;
  componentId: string;
  vendorPartNumber?: string | null;
  unitPrice: number;
  quantityOrdered: number;
  quantityReceived: number;
  taxRate: number;
  lineTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderDto {
  id: string;
  poNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  notes?: string | null;
  issuedAt?: string | null;
  expectedDeliveryDate?: string | null;
  lines: PurchaseOrderLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AddPoLinePayload {
  componentId: string;
  vendorPartNumber?: string | null;
  unitPrice: number;
  quantityOrdered: number;
  taxRate?: number;
}

export interface CreatePurchaseOrderPayload {
  supplierId: string;
  currency?: string;
  notes?: string | null;
  expectedDeliveryDate?: string | null;
  lines?: AddPoLinePayload[];
}

export interface UpdatePurchaseOrderPayload {
  notes?: string | null;
  expectedDeliveryDate?: string | null;
  lines?: AddPoLinePayload[];
}

export interface FindManyPoOptions {
  supplierId?: string;
  status?: PurchaseOrderStatus;
  search?: string;
}

export const purchaseOrdersApi = {
  getAll: (options?: FindManyPoOptions): Promise<PurchaseOrderDto[]> => {
    const params = new URLSearchParams();
    if (options?.supplierId) params.append("supplierId", options.supplierId);
    if (options?.status) params.append("status", options.status);
    if (options?.search) params.append("search", options.search);

    const queryString = params.toString();
    const url = queryString
      ? `/purchase-orders?${queryString}`
      : "/purchase-orders";
    return apiClient.get<PurchaseOrderDto[]>(url);
  },
  getById: (id: string): Promise<PurchaseOrderDto> =>
    apiClient.get<PurchaseOrderDto>(`/purchase-orders/${id}`),
  create: (payload: CreatePurchaseOrderPayload): Promise<PurchaseOrderDto> =>
    apiClient.post<PurchaseOrderDto, CreatePurchaseOrderPayload>(
      "/purchase-orders",
      payload,
    ),
  update: (
    id: string,
    payload: UpdatePurchaseOrderPayload,
  ): Promise<PurchaseOrderDto> =>
    apiClient.put<PurchaseOrderDto, UpdatePurchaseOrderPayload>(
      `/purchase-orders/${id}`,
      payload,
    ),
  submit: (id: string): Promise<PurchaseOrderDto> =>
    apiClient.post<PurchaseOrderDto, Record<string, never>>(
      `/purchase-orders/${id}/submit`,
      {},
    ),
  approve: (id: string): Promise<PurchaseOrderDto> =>
    apiClient.post<PurchaseOrderDto, Record<string, never>>(
      `/purchase-orders/${id}/approve`,
      {},
    ),
  issue: (id: string): Promise<PurchaseOrderDto> =>
    apiClient.post<PurchaseOrderDto, Record<string, never>>(
      `/purchase-orders/${id}/issue`,
      {},
    ),
  cancel: (id: string): Promise<PurchaseOrderDto> =>
    apiClient.post<PurchaseOrderDto, Record<string, never>>(
      `/purchase-orders/${id}/cancel`,
      {},
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/purchase-orders/${id}`),
};
