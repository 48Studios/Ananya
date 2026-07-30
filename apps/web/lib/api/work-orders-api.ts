import { apiClient } from '../api-client';

export type WorkOrderStatus =
  | 'DRAFT'
  | 'RELEASED'
  | 'MATERIAL_ALLOCATED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export type WorkOrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface WorkOrderDto {
  id: string;
  productionNumber: string;
  bomId: string;
  componentId: string;
  locationId?: string | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  quantityPlanned: number;
  quantityCompleted: number;
  quantityScrapped: number;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialRequirementDetailDto {
  componentId: string;
  quantityPerUnit: number;
  unitOfMeasure: string;
  scrapFactorPercent: number;
  requiredQuantity: number;
  reservedQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  availableQuantity: number;
  isShortage: boolean;
}

export interface ProductionActivityItemDto {
  id: string;
  eventType:
    | 'STARTED'
    | 'MATERIAL_CONSUMED'
    | 'OUTPUT_PRODUCED'
    | 'SCRAP_RECORDED'
    | 'PAUSED'
    | 'RESUMED'
    | 'COMPLETED'
    | 'RELEASED';
  title: string;
  description: string;
  quantity?: number;
  unitOfMeasure?: string;
  timestamp: string;
  createdBy?: string;
}

export interface CreateWorkOrderPayload {
  bomId: string;
  componentId: string;
  locationId?: string;
  quantityPlanned: number;
  priority?: WorkOrderPriority;
  startDate?: string;
  endDate?: string;
  notes?: string;
  createdBy?: string;
}

export interface UpdateWorkOrderPayload {
  locationId?: string;
  quantityPlanned?: number;
  priority?: WorkOrderPriority;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface RecordPartialOutputPayload {
  producedQuantity: number;
  scrappedQuantity?: number;
  notes?: string;
}

export interface RecordScrapPayload {
  componentId: string;
  quantity: number;
  reason: string;
}

export interface FindManyWorkOrdersOptions {
  componentId?: string;
  bomId?: string;
  locationId?: string;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  search?: string;
}

export const workOrdersApi = {
  getAll: (options?: FindManyWorkOrdersOptions): Promise<WorkOrderDto[]> => {
    const params = new URLSearchParams();
    if (options?.componentId) params.append('componentId', options.componentId);
    if (options?.bomId) params.append('bomId', options.bomId);
    if (options?.locationId) params.append('locationId', options.locationId);
    if (options?.status) params.append('status', options.status);
    if (options?.priority) params.append('priority', options.priority);
    if (options?.search) params.append('search', options.search);

    const queryString = params.toString();
    const url = queryString ? `/work-orders?${queryString}` : '/work-orders';
    return apiClient.get<WorkOrderDto[]>(url);
  },
  getById: (id: string): Promise<WorkOrderDto> =>
    apiClient.get<WorkOrderDto>(`/work-orders/${id}`),
  getMaterialRequirements: (id: string): Promise<MaterialRequirementDetailDto[]> =>
    apiClient.get<MaterialRequirementDetailDto[]>(`/work-orders/${id}/materials`),
  getTimeline: (id: string): Promise<ProductionActivityItemDto[]> =>
    apiClient.get<ProductionActivityItemDto[]>(`/work-orders/${id}/timeline`),
  create: (payload: CreateWorkOrderPayload): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, CreateWorkOrderPayload>('/work-orders', payload),
  update: (id: string, payload: UpdateWorkOrderPayload): Promise<WorkOrderDto> =>
    apiClient.put<WorkOrderDto, UpdateWorkOrderPayload>(`/work-orders/${id}`, payload),
  release: (id: string): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, Record<string, never>>(`/work-orders/${id}/release`, {}),
  start: (id: string): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, Record<string, never>>(`/work-orders/${id}/start`, {}),
  recordPartialOutput: (id: string, payload: RecordPartialOutputPayload): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, RecordPartialOutputPayload>(`/work-orders/${id}/record-output`, payload),
  recordScrap: (id: string, payload: RecordScrapPayload): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, RecordScrapPayload>(`/work-orders/${id}/record-scrap`, payload),
  pause: (id: string): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, Record<string, never>>(`/work-orders/${id}/pause`, {}),
  resume: (id: string): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, Record<string, never>>(`/work-orders/${id}/resume`, {}),
  complete: (id: string, producedQuantity?: number): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, { producedQuantity?: number }>(`/work-orders/${id}/complete`, {
      producedQuantity,
    }),
  cancel: (id: string): Promise<WorkOrderDto> =>
    apiClient.post<WorkOrderDto, Record<string, never>>(`/work-orders/${id}/cancel`, {}),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/work-orders/${id}`),
};
