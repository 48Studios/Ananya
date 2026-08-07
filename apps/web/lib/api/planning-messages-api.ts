import { apiClient } from "../api-client";

export interface PlanningMessageDto {
  id: string;
  planningRunId: string;
  severity: "INFO" | "WARNING" | "ERROR";
  message: string;
  createdAt: string;
  updatedAt: string;
}

export const planningMessagesApi = {
  getAll: async (planningRunId: string): Promise<PlanningMessageDto[]> =>
    apiClient.get<PlanningMessageDto[]>(
      `/planning-messages?planningRunId=${encodeURIComponent(planningRunId)}`,
    ),
};
