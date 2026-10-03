import { apiClient } from "../api-client";

/**
 * Mirrors the `WarrantyClaim` aggregate in `@ananya/service`. The claim's
 * lifecycle field is `decision` (there is no separate "status"), and it records
 * the product by id — not by name.
 */
export type WarrantyDecision =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED";

export interface WarrantyClaimDto {
  id: string;
  warrantyNumber: string;
  customerId: string;
  productId: string;
  serialNumber?: string;
  purchaseDate: string;
  expiryDate: string;
  claimReason: string;
  decision: WarrantyDecision;
  decisionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarrantyClaimPayload {
  customerId: string;
  productId: string;
  purchaseDate: string;
  expiryDate: string;
  claimReason: string;
  serialNumber?: string;
}

export const warrantyClaimsApi = {
  getAll: async (): Promise<WarrantyClaimDto[]> => {
    return apiClient.get<WarrantyClaimDto[]>("/warranty-claims");
  },
  getById: async (id: string): Promise<WarrantyClaimDto> => {
    return apiClient.get<WarrantyClaimDto>(`/warranty-claims/${id}`);
  },
  create: async (
    data: CreateWarrantyClaimPayload,
  ): Promise<WarrantyClaimDto> => {
    return apiClient.post<WarrantyClaimDto>("/warranty-claims", data);
  },
};
