import { apiClient } from "../api-client";

export interface TimeEntryDto {
  id: string;
  employeeName: string;
  workOrderRef: string;
  taskDescription: string;
  hoursLogged: number;
  workDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export const timeEntriesApi = {
  getAll: async (): Promise<TimeEntryDto[]> => {
    return apiClient.get<TimeEntryDto[]>("/time-entries");
  },
  getById: async (id: string): Promise<TimeEntryDto> => {
    return apiClient.get<TimeEntryDto>(`/time-entries/${id}`);
  },
};
