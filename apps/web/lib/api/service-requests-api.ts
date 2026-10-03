import { apiClient } from "../api-client";

/**
 * Mirrors `ServiceRequestProps` in `@ananya/service` — the shape the API
 * actually serializes. Optional domain fields are omitted from the response
 * rather than sent as `null`.
 */
export type ServiceRequestStatus =
  | "OPEN"
  | "ASSIGNED"
  | "DIAGNOSING"
  | "WAITING_PARTS"
  | "REPAIRING"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED";

export type ServicePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ServiceCategory =
  | "HARDWARE"
  | "SOFTWARE"
  | "MAINTENANCE"
  | "INSTALLATION"
  | "INSPECTION";

export interface ServiceRequestDto {
  id: string;
  serviceNumber: string;
  customerId: string;
  salesOrderId?: string;
  projectId?: string;
  componentId?: string;
  serialNumber?: string;
  title: string;
  description?: string;
  priority: ServicePriority;
  category: ServiceCategory;
  status: ServiceRequestStatus;
  assignedTechnician?: string;
  diagnosticNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceRequestPayload {
  customerId: string;
  title: string;
  category: ServiceCategory;
  salesOrderId?: string;
  projectId?: string;
  componentId?: string;
  serialNumber?: string;
  description?: string;
  priority?: ServicePriority;
}

export const serviceRequestsApi = {
  getAll: async (): Promise<ServiceRequestDto[]> => {
    return apiClient.get<ServiceRequestDto[]>("/service-requests");
  },
  getById: async (id: string): Promise<ServiceRequestDto> => {
    return apiClient.get<ServiceRequestDto>(`/service-requests/${id}`);
  },
  create: async (
    data: CreateServiceRequestPayload,
  ): Promise<ServiceRequestDto> => {
    return apiClient.post<ServiceRequestDto>("/service-requests", data);
  },
};
