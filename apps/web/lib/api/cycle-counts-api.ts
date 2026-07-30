import { apiClient } from '../api-client';

export type CycleCountStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'COUNTING'
  | 'REVIEW'
  | 'APPROVED'
  | 'CANCELLED';

export interface CycleCountLineDto {
  id: string;
  cycleCountId: string;
  componentId: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  unitOfMeasure: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CycleCountDto {
  id: string;
  countNumber: string;
  locationId: string;
  status: CycleCountStatus;
  assignedCounter?: string | null;
  scheduledDate?: string | null;
  completedAt?: string | null;
  approvedAt?: string | null;
  createdBy?: string | null;
  approvedBy?: string | null;
  stockAdjustmentId?: string | null;
  notes?: string | null;
  lines: CycleCountLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface DiscrepancySummaryDto {
  totalItemsCounted: number;
  matchingItems: number;
  shortageItems: number;
  surplusItems: number;
  totalQuantityDifference: number;
}

export interface CycleCountLineInputPayload {
  componentId: string;
  systemQuantity: number;
  countedQuantity?: number;
  unitOfMeasure?: string;
  notes?: string;
}

export interface CreateCycleCountPayload {
  locationId: string;
  assignedCounter?: string;
  scheduledDate?: string;
  createdBy?: string;
  notes?: string;
  lines?: CycleCountLineInputPayload[];
}

export interface UpdateCycleCountPayload {
  locationId?: string;
  assignedCounter?: string;
  scheduledDate?: string;
  notes?: string;
  lines?: CycleCountLineInputPayload[];
}

export interface PhysicalCountEntryPayload {
  lineId: string;
  countedQuantity: number;
  notes?: string;
}

export interface FindManyCycleCountsOptions {
  locationId?: string;
  status?: CycleCountStatus;
  assignedCounter?: string;
  search?: string;
}

export const cycleCountsApi = {
  getAll: (options?: FindManyCycleCountsOptions): Promise<CycleCountDto[]> => {
    const params = new URLSearchParams();
    if (options?.locationId) params.append('locationId', options.locationId);
    if (options?.status) params.append('status', options.status);
    if (options?.assignedCounter)
      params.append('assignedCounter', options.assignedCounter);
    if (options?.search) params.append('search', options.search);

    const queryString = params.toString();
    const url = queryString ? `/cycle-counts?${queryString}` : '/cycle-counts';
    return apiClient.get<CycleCountDto[]>(url);
  },
  getById: (id: string): Promise<CycleCountDto> =>
    apiClient.get<CycleCountDto>(`/cycle-counts/${id}`),
  getSummary: (id: string): Promise<DiscrepancySummaryDto> =>
    apiClient.get<DiscrepancySummaryDto>(`/cycle-counts/${id}/summary`),
  create: (payload: CreateCycleCountPayload): Promise<CycleCountDto> =>
    apiClient.post<CycleCountDto, CreateCycleCountPayload>(
      '/cycle-counts',
      payload,
    ),
  update: (
    id: string,
    payload: UpdateCycleCountPayload,
  ): Promise<CycleCountDto> =>
    apiClient.put<CycleCountDto, UpdateCycleCountPayload>(
      `/cycle-counts/${id}`,
      payload,
    ),
  assignCounter: (
    id: string,
    assignedCounter: string,
  ): Promise<CycleCountDto> =>
    apiClient.post<CycleCountDto, { assignedCounter: string }>(
      `/cycle-counts/${id}/assign`,
      { assignedCounter },
    ),
  startCounting: (id: string): Promise<CycleCountDto> =>
    apiClient.post<CycleCountDto, Record<string, never>>(
      `/cycle-counts/${id}/start`,
      {},
    ),
  recordPhysicalCounts: (
    id: string,
    counts: PhysicalCountEntryPayload[],
  ): Promise<CycleCountDto> =>
    apiClient.post<
      CycleCountDto,
      { counts: PhysicalCountEntryPayload[] }
    >(`/cycle-counts/${id}/record-counts`, { counts }),
  approve: (id: string, approvedBy?: string): Promise<CycleCountDto> =>
    apiClient.post<CycleCountDto, { approvedBy?: string }>(
      `/cycle-counts/${id}/approve`,
      { approvedBy },
    ),
  cancel: (id: string): Promise<CycleCountDto> =>
    apiClient.post<CycleCountDto, Record<string, never>>(
      `/cycle-counts/${id}/cancel`,
      {},
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/cycle-counts/${id}`),
};
