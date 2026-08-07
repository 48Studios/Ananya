import { apiClient } from "../api-client";

export interface SupplierReturnDto {
  id: string;
  returnNumber: string;
  supplierId: string;
  supplierName?: string;
  poNumber?: string;
  totalAmount: number;
  status: "DRAFT" | "DISPATCHED" | "CREDITED";
  returnDate: string;
  createdAt: string;
  updatedAt: string;
}

export const supplierReturnsApi = {
  getAll: async (): Promise<SupplierReturnDto[]> => {
    return apiClient.get<SupplierReturnDto[]>("/supplier-returns");
  },
  getById: async (id: string): Promise<SupplierReturnDto> => {
    return apiClient.get<SupplierReturnDto>(`/supplier-returns/${id}`);
  },
  create: async (data: {
    supplierId: string;
    purchaseOrderId?: string;
    rmaNumber?: string;
  }): Promise<SupplierReturnDto> => {
    return apiClient.post<SupplierReturnDto>("/supplier-returns", data);
  },
};

