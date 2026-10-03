import { apiClient } from "../api-client";

/**
 * Mirrors the `Task` aggregate in `@ananya/projects` — the shape the API
 * serializes. The domain has no due date and no "module" reference, so the UI
 * must not expect one.
 */
export type TaskStatus =
  | "TODO"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "DONE"
  | "CANCELLED";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TaskAssignmentDto {
  id: string;
  taskId: string;
  userId: string;
  assignedAt: string;
}

export interface TaskDto {
  id: string;
  taskNumber: string;
  projectId: string;
  title: string;
  description?: string;
  assignedUser?: string;
  estimatedHours: number;
  actualHours: number;
  priority: TaskPriority;
  status: TaskStatus;
  assignments: TaskAssignmentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPayload {
  projectId: string;
  title: string;
  estimatedHours: number;
  description?: string;
  assignedUser?: string;
  priority?: TaskPriority;
}

export const tasksApi = {
  getAll: async (): Promise<TaskDto[]> => {
    return apiClient.get<TaskDto[]>("/tasks");
  },
  getById: async (id: string): Promise<TaskDto> => {
    return apiClient.get<TaskDto>(`/tasks/${id}`);
  },
  create: async (data: CreateTaskPayload): Promise<TaskDto> => {
    return apiClient.post<TaskDto>("/tasks", data);
  },
};
