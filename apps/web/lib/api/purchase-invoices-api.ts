import { apiClient } from "../api-client";

export interface PurchaseInvoiceDto {
  id: string;
  invoiceNumber: string;
  vendorInvoiceNumber: string;
  supplierName?: string;
  supplierId: string;
  poNumber?: string;
  purchaseOrderId: string;
  goodsReceiptId?: string | null;
  status:
    | "DRAFT"
    | "MATCHED"
    | "VARIANCE_HOLD"
    | "APPROVED"
    | "PAID"
    | "CANCELLED"
    | "UNPAID"
    | "PARTIAL";
  matchStatus:
    | "PENDING"
    | "MATCHED"
    | "PRICE_VARIANCE"
    | "QUANTITY_VARIANCE"
    | "APPROVED";
  amount?: number;
  totalAmount: number;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePurchaseInvoicePayload {
  invoiceNumber?: string;
  supplierName?: string;
  poNumber?: string;
  amount?: number;
  dueDate?: string;
  status?: "PAID" | "UNPAID" | "PARTIAL";
}

export interface CreatePurchaseInvoicePayload {
  invoiceNumber: string;
  supplierName: string;
  poNumber: string;
  amount: number;
  dueDate: string;
  status?: "PAID" | "UNPAID" | "PARTIAL";
}

export const purchaseInvoicesApi = {
  getAll: async (): Promise<PurchaseInvoiceDto[]> =>
    apiClient.get<PurchaseInvoiceDto[]>("/purchase-invoices"),
  create: async (
    payload: CreatePurchaseInvoicePayload,
  ): Promise<PurchaseInvoiceDto> => {
    void payload;
    throw new Error(
      "Purchase invoice creation requires supplier and purchase-order IDs and is not available from this read-only register.",
    );
  },
  update: async (
    id: string,
    payload: UpdatePurchaseInvoicePayload,
  ): Promise<PurchaseInvoiceDto> => {
    void id;
    void payload;
    throw new Error(
      "Purchase invoice updates are not supported by the current register API.",
    );
  },
};
