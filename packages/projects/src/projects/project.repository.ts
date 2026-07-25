import { Project, ProjectStatus, ProjectPriority } from './project';

export interface FindManyProjectsOptions {
  status?: ProjectStatus;
  priority?: ProjectPriority;
  customerId?: string;
  salesOrderId?: string;
  projectManager?: string;
  search?: string;
}

export interface ProjectRepository {
  findById(id: string): Promise<Project | null>;
  findByNumber(projectNumber: string): Promise<Project | null>;
  findMany(options?: FindManyProjectsOptions): Promise<Project[]>;
  save(project: Project): Promise<void>;
  generateNextProjectNumber(): Promise<string>;
}
