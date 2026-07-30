import { Project, ProjectStatus, ProjectType, ProjectPriority } from './project';

export interface FindManyProjectsOptions {
  status?: ProjectStatus;
  projectType?: ProjectType;
  priority?: ProjectPriority;
  owner?: string;
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
  delete(id: string): Promise<void>;
  generateNextProjectNumber(): Promise<string>;
}
