import { apiClient } from "../api-client";

/**
 * Mirrors the `SalesOrder` aggregate in `@ananya/sales`. The order carries its
 * own number; customers and quotations are referenced by id.
 */
export type SalesOrderStatus =
  | "DRAFT"
  | "APPROVED"
  | "RELEASED"
  | "ALLOCATED"
  | "PARTIALLY_FULFILLED"
  | "COMPLETED"
  | "CANCELLED";

export interface SalesOrderLineDto {
  id: string;
  salesOrderId: string;
  componentId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  totalPrice: number;
  reservedQuantity: number;
  fulfilledQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalesOrderDto {
  id: string;
  orderNumber: string;
  customerId: string;
  orderDate: string;
  requiredDate?: string | null;
  status: SalesOrderStatus;
  quotationId?: string | null;
  lines?: SalesOrderLineDto[];
  createdAt: string;
  updatedAt: string;
}

export const salesOrdersApi = {
  getAll: async (): Promise<SalesOrderDto[]> => {
    return apiClient.get<SalesOrderDto[]>("/sales-orders");
  },
  getById: async (id: string): Promise<SalesOrderDto> => {
    return apiClient.get<SalesOrderDto>(`/sales-orders/${id}`);
  },
};
