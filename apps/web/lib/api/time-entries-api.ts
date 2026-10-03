import { apiClient } from "../api-client";

/**
 * Mirrors the `TimeEntry` aggregate in `@ananya/projects`. The API stores ids
 * (`userId`, `taskId`), not display names, so callers resolve those separately.
 */
export type TimeEntryStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

export interface TimeEntryDto {
  id: string;
  userId: string;
  taskId: string;
  date: string;
  hours: number;
  description?: string;
  status: TimeEntryStatus;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTimeEntryPayload {
  taskId: string;
  date: string;
  hours: number;
  description?: string;
  /** Only honoured for managers; defaults to the authenticated user. */
  userId?: string;
}

export const timeEntriesApi = {
  getAll: async (): Promise<TimeEntryDto[]> => {
    return apiClient.get<TimeEntryDto[]>("/time-entries");
  },
  getById: async (id: string): Promise<TimeEntryDto> => {
    return apiClient.get<TimeEntryDto>(`/time-entries/${id}`);
  },
  create: async (data: CreateTimeEntryPayload): Promise<TimeEntryDto> => {
    return apiClient.post<TimeEntryDto>("/time-entries", data);
  },
};
