import { Task, TaskStatus, TaskPriority } from './task';

export interface FindManyTasksOptions {
  projectId?: string;
  assignedUser?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
}

export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  findByNumber(taskNumber: string): Promise<Task | null>;
  findMany(options?: FindManyTasksOptions): Promise<Task[]>;
  save(task: Task): Promise<void>;
  generateNextTaskNumber(): Promise<string>;
}
