import { apiClient } from "../api-client";

export interface TaskDto {
  id: string;
  taskNumber: string;
  taskTitle: string;
  assignee: string;
  moduleRef: string;
  priority: string;
  status: string;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
}

export const tasksApi = {
  getAll: async (): Promise<TaskDto[]> => {
    return apiClient.get<TaskDto[]>("/tasks");
  },
  getById: async (id: string): Promise<TaskDto> => {
    return apiClient.get<TaskDto>(`/tasks/${id}`);
  },
  create: async (data: {
    projectId?: string;
    title: string;
    description?: string;
    assignedUser?: string;
    estimatedHours?: number;
    priority?: string;
  }): Promise<TaskDto> => {
    return apiClient.post<TaskDto>("/tasks", data);
  },
};

