import { apiClient } from "../api-client";

export interface WarrantyClaimDto {
  id: string;
  claimNumber: string;
  serialNumber: string;
  customerName: string;
  productName: string;
  issueDescription: string;
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  createdDate: string;
  createdAt: string;
  updatedAt: string;
}

export const warrantyClaimsApi = {
  getAll: async (): Promise<WarrantyClaimDto[]> => {
    return apiClient.get<WarrantyClaimDto[]>("/warranty-claims");
  },
  getById: async (id: string): Promise<WarrantyClaimDto> => {
    return apiClient.get<WarrantyClaimDto>(`/warranty-claims/${id}`);
  },
  create: async (data: {
    customerId?: string;
    productId?: string;
    serialNumber?: string;
    purchaseDate?: string;
    expiryDate?: string;
    claimReason: string;
  }): Promise<WarrantyClaimDto> => {
    return apiClient.post<WarrantyClaimDto>("/warranty-claims", data);
  },
};
