import { apiClient } from "../api-client";

/**
 * Mirrors the `MaintenanceSchedule` aggregate in `@ananya/service`. There is no
 * work centre, no task type and no "last completed" date in the domain: the
 * schedule records a service frequency and the next visit date.
 */
export type MaintenanceStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type ServiceFrequency = "MONTHLY" | "QUARTERLY" | "BIANNUAL" | "ANNUAL";

export interface MaintenanceScheduleDto {
  id: string;
  scheduleNumber: string;
  customerId: string;
  assetName: string;
  serialNumber?: string;
  frequency: ServiceFrequency;
  nextVisitDate: string;
  assignedTechnician?: string;
  status: MaintenanceStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaintenanceSchedulePayload {
  customerId: string;
  assetName: string;
  frequency: ServiceFrequency;
  nextVisitDate: string;
  serialNumber?: string;
  assignedTechnician?: string;
  notes?: string;
}

export const maintenanceApi = {
  getAll: async (): Promise<MaintenanceScheduleDto[]> => {
    return apiClient.get<MaintenanceScheduleDto[]>("/maintenance-schedules");
  },
  getById: async (id: string): Promise<MaintenanceScheduleDto> => {
    return apiClient.get<MaintenanceScheduleDto>(
      `/maintenance-schedules/${id}`,
    );
  },
  create: async (
    payload: CreateMaintenanceSchedulePayload,
  ): Promise<MaintenanceScheduleDto> => {
    return apiClient.post<MaintenanceScheduleDto>(
      "/maintenance-schedules",
      payload,
    );
  },
  completeVisit: async (id: string): Promise<MaintenanceScheduleDto> => {
    return apiClient.post<MaintenanceScheduleDto>(
      `/maintenance-schedules/${id}/complete-visit`,
      {},
    );
  },
  pause: async (id: string): Promise<MaintenanceScheduleDto> => {
    return apiClient.post<MaintenanceScheduleDto>(
      `/maintenance-schedules/${id}/pause`,
      {},
    );
  },
  resume: async (id: string): Promise<MaintenanceScheduleDto> => {
    return apiClient.post<MaintenanceScheduleDto>(
      `/maintenance-schedules/${id}/resume`,
      {},
    );
  },
};
