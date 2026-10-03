import { apiClient } from "../api-client";

/**
 * Mirrors the `RmaRequest` aggregate in `@ananya/service`. The customer and the
 * originating sales order are referenced by id, so the UI resolves what it can
 * and never invents an order number.
 */
export type RmaStatus =
  | "REQUESTED"
  | "APPROVED"
  | "RECEIVED"
  | "INSPECTED"
  | "PROCESSED"
  | "CLOSED"
  | "REJECTED";

export type RmaDisposition = "REPAIR" | "REPLACE" | "SCRAP" | "RETURN";

export interface RmaRequestDto {
  id: string;
  rmaNumber: string;
  customerId: string;
  salesOrderId?: string;
  itemDescription: string;
  serialNumber?: string;
  reason: string;
  status: RmaStatus;
  disposition?: RmaDisposition;
  inspectionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRmaRequestPayload {
  customerId: string;
  itemDescription: string;
  reason: string;
  salesOrderId?: string;
  serialNumber?: string;
}

export const rmaRequestsApi = {
  getAll: async (): Promise<RmaRequestDto[]> => {
    return apiClient.get<RmaRequestDto[]>("/rma-requests");
  },
  getById: async (id: string): Promise<RmaRequestDto> => {
    return apiClient.get<RmaRequestDto>(`/rma-requests/${id}`);
  },
  create: async (data: CreateRmaRequestPayload): Promise<RmaRequestDto> => {
    return apiClient.post<RmaRequestDto>("/rma-requests", data);
  },
};
