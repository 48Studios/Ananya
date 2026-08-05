import { apiClient } from "../api-client";

export interface RmaRequestDto {
  id: string;
  rmaNumber: string;
  customerName: string;
  salesOrderNumber: string;
  reason: string;
  status: "SUBMITTED" | "APPROVED" | "RECEIVED" | "INSPECTED";
  disposition: string;
  createdDate: string;
  createdAt: string;
  updatedAt: string;
}

export const rmaRequestsApi = {
  getAll: async (): Promise<RmaRequestDto[]> => {
    return apiClient.get<RmaRequestDto[]>("/rma-requests");
  },
  getById: async (id: string): Promise<RmaRequestDto> => {
    return apiClient.get<RmaRequestDto>(`/rma-requests/${id}`);
  },
};
