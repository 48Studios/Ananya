import { apiClient } from '../api-client';

export type ProjectStatus =
  | 'PLANNING'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'ARCHIVED'
  | 'CANCELLED';

export type ProjectType =
  | 'CUSTOMER'
  | 'INTERNAL'
  | 'R_AND_D'
  | 'PROTOTYPE'
  | 'INSTALLATION'
  | 'MANUFACTURING_INITIATIVE';

export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MilestoneStatus = 'OPEN' | 'COMPLETED';

export type ProjectActivityType =
  | 'CREATED'
  | 'STATUS_CHANGED'
  | 'MATERIAL_ALLOCATED'
  | 'MATERIAL_ISSUED'
  | 'MATERIAL_RETURNED'
  | 'ARCHIVED';

export interface ProjectMaterialDto {
  id: string;
  projectId: string;
  componentId: string;
  locationId: string;
  allocatedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  unitOfMeasure: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectActivityDto {
  id: string;
  projectId: string;
  activityType: ProjectActivityType;
  description: string;
  performedBy: string;
  metadata?: string | null;
  createdAt: string;
}

export interface MilestoneDto {
  id: string;
  projectId: string;
  name: string;
  dueDate: string;
  status: MilestoneStatus;
  completionPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDto {
  id: string;
  projectNumber: string;
  name: string;
  projectType: ProjectType;
  description?: string | null;
  owner: string;
  projectManager: string;
  customerId?: string | null;
  salesOrderId?: string | null;
  startDate: string;
  targetCompletionDate: string;
  priority: ProjectPriority;
  status: ProjectStatus;
  materials: ProjectMaterialDto[];
  activities: ProjectActivityDto[];
  milestones: MilestoneDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  projectType?: ProjectType;
  description?: string;
  owner?: string;
  projectManager: string;
  customerId?: string;
  salesOrderId?: string;
  startDate: string;
  targetCompletionDate: string;
  priority?: ProjectPriority;
}

export interface UpdateProjectPayload {
  name?: string;
  projectType?: ProjectType;
  description?: string;
  owner?: string;
  projectManager?: string;
  customerId?: string;
  salesOrderId?: string;
  startDate?: string;
  targetCompletionDate?: string;
  priority?: ProjectPriority;
}

export interface AllocateMaterialPayload {
  componentId: string;
  locationId: string;
  quantity: number;
  unitOfMeasure?: string;
  notes?: string;
  performedBy?: string;
}

export interface IssueMaterialPayload {
  componentId: string;
  locationId: string;
  quantity: number;
  performedBy?: string;
}

export interface ReturnMaterialPayload {
  componentId: string;
  locationId: string;
  quantity: number;
  performedBy?: string;
}

export interface AddMilestonePayload {
  name: string;
  dueDate: string;
  completionPercentage?: number;
}

export interface FindManyProjectsOptions {
  status?: ProjectStatus;
  priority?: ProjectPriority;
  customerId?: string;
  salesOrderId?: string;
  projectManager?: string;
  search?: string;
}

export const projectsApi = {
  getAll: (options?: FindManyProjectsOptions): Promise<ProjectDto[]> => {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.priority) params.append('priority', options.priority);
    if (options?.customerId) params.append('customerId', options.customerId);
    if (options?.salesOrderId) params.append('salesOrderId', options.salesOrderId);
    if (options?.projectManager) params.append('projectManager', options.projectManager);
    if (options?.search) params.append('search', options.search);

    const queryString = params.toString();
    const url = queryString ? `/projects?${queryString}` : '/projects';
    return apiClient.get<ProjectDto[]>(url);
  },

  getById: (id: string): Promise<ProjectDto> =>
    apiClient.get<ProjectDto>(`/projects/${id}`),

  create: (payload: CreateProjectPayload): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, CreateProjectPayload>('/projects', payload),

  update: (id: string, payload: UpdateProjectPayload): Promise<ProjectDto> =>
    apiClient.put<ProjectDto, UpdateProjectPayload>(`/projects/${id}`, payload),

  start: (id: string): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, Record<string, never>>(`/projects/${id}/start`, {}),

  pause: (id: string): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, Record<string, never>>(`/projects/${id}/pause`, {}),

  complete: (id: string): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, Record<string, never>>(`/projects/${id}/complete`, {}),

  archive: (id: string): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, Record<string, never>>(`/projects/${id}/archive`, {}),

  cancel: (id: string): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, Record<string, never>>(`/projects/${id}/cancel`, {}),

  addMilestone: (id: string, payload: AddMilestonePayload): Promise<MilestoneDto> =>
    apiClient.post<MilestoneDto, AddMilestonePayload>(
      `/projects/${id}/milestones`,
      payload,
    ),

  completeMilestone: (id: string, milestoneId: string): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, Record<string, never>>(
      `/projects/${id}/milestones/${milestoneId}/complete`,
      {},
    ),

  allocateMaterial: (id: string, payload: AllocateMaterialPayload): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, AllocateMaterialPayload>(
      `/projects/${id}/materials/allocate`,
      payload,
    ),

  issueMaterial: (id: string, payload: IssueMaterialPayload): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, IssueMaterialPayload>(
      `/projects/${id}/materials/issue`,
      payload,
    ),

  returnMaterial: (id: string, payload: ReturnMaterialPayload): Promise<ProjectDto> =>
    apiClient.post<ProjectDto, ReturnMaterialPayload>(
      `/projects/${id}/materials/return`,
      payload,
    ),
};
