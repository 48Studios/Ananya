import { apiClient } from "../api-client";

export type PurchaseInvoiceStatus =
  | "DRAFT"
  | "MATCHED"
  | "VARIANCE_HOLD"
  | "APPROVED"
  | "PAID"
  | "CANCELLED";

export type ThreeWayMatchStatus =
  | "PENDING"
  | "MATCHED"
  | "PRICE_VARIANCE"
  | "QUANTITY_VARIANCE"
  | "APPROVED";

export interface PurchaseInvoiceLineDto {
  id: string;
  purchaseInvoiceId: string;
  componentId: string;
  componentName?: string;
  componentCode?: string;
  quantityBilled: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseInvoiceDto {
  id: string;
  invoiceNumber: string;
  vendorInvoiceNumber: string;
  supplierName?: string;
  supplierId: string;
  poNumber?: string;
  purchaseOrderId: string;
  goodsReceiptId?: string | null;
  status: PurchaseInvoiceStatus;
  matchStatus: ThreeWayMatchStatus;
  totalAmount: number;
  dueDate: string;
  lines?: PurchaseInvoiceLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AddPurchaseInvoiceLinePayload {
  componentId: string;
  quantityBilled: number;
  unitPrice: number;
}

export interface CreatePurchaseInvoicePayload {
  vendorInvoiceNumber: string;
  supplierId: string;
  purchaseOrderId: string;
  goodsReceiptId?: string | null;
  dueDate: string;
  lines?: AddPurchaseInvoiceLinePayload[];
}

export interface MatchResultDto {
  invoice: PurchaseInvoiceDto;
  matchResult: {
    isMatch: boolean;
    varianceReason?: "PRICE" | "QUANTITY";
    details: string[];
  };
}

export const purchaseInvoicesApi = {
  getAll: async (params?: {
    supplierId?: string;
    purchaseOrderId?: string;
  }): Promise<PurchaseInvoiceDto[]> => {
    const query = new URLSearchParams();
    if (params?.supplierId) query.set("supplierId", params.supplierId);
    if (params?.purchaseOrderId)
      query.set("purchaseOrderId", params.purchaseOrderId);
    const qs = query.toString();
    return apiClient.get<PurchaseInvoiceDto[]>(
      `/purchase-invoices${qs ? `?${qs}` : ""}`,
    );
  },
  getById: async (id: string): Promise<PurchaseInvoiceDto> =>
    apiClient.get<PurchaseInvoiceDto>(`/purchase-invoices/${id}`),
  create: async (
    payload: CreatePurchaseInvoicePayload,
  ): Promise<PurchaseInvoiceDto> =>
    apiClient.post<PurchaseInvoiceDto>("/purchase-invoices", payload),
  addLine: async (
    id: string,
    line: AddPurchaseInvoiceLinePayload,
  ): Promise<PurchaseInvoiceDto> =>
    apiClient.post<PurchaseInvoiceDto>(`/purchase-invoices/${id}/lines`, line),
  match: async (id: string): Promise<MatchResultDto> =>
    apiClient.post<MatchResultDto>(`/purchase-invoices/${id}/match`, {}),
  approve: async (id: string): Promise<PurchaseInvoiceDto> =>
    apiClient.post<PurchaseInvoiceDto>(`/purchase-invoices/${id}/approve`, {}),
  pay: async (id: string): Promise<PurchaseInvoiceDto> =>
    apiClient.post<PurchaseInvoiceDto>(`/purchase-invoices/${id}/pay`, {}),
  cancel: async (id: string): Promise<PurchaseInvoiceDto> =>
    apiClient.post<PurchaseInvoiceDto>(`/purchase-invoices/${id}/cancel`, {}),
  updateStatus: async (
    id: string,
    status: PurchaseInvoiceStatus,
  ): Promise<PurchaseInvoiceDto> =>
    apiClient.patch<PurchaseInvoiceDto>(`/purchase-invoices/${id}/status`, {
      status,
    }),
};
