import { apiClient } from '../api-client';

export type WarehouseTransferStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'DISPATCHED'
  | 'RECEIVED'
  | 'CANCELLED';

export interface WarehouseTransferLineDto {
  id: string;
  transferId: string;
  componentId: string;
  quantity: number;
  unitOfMeasure: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseTransferDto {
  id: string;
  transferNumber: string;
  sourceLocationId: string;
  destinationLocationId: string;
  status: WarehouseTransferStatus;
  requestedDate?: string | null;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  requestedBy?: string | null;
  notes?: string | null;
  lines: WarehouseTransferLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface TransferLinePayload {
  componentId: string;
  quantity: number;
  unitOfMeasure?: string;
  notes?: string;
}

export interface CreateWarehouseTransferPayload {
  sourceLocationId: string;
  destinationLocationId: string;
  requestedDate?: string;
  requestedBy?: string;
  notes?: string;
  lines?: TransferLinePayload[];
}

export interface UpdateWarehouseTransferPayload {
  sourceLocationId?: string;
  destinationLocationId?: string;
  requestedDate?: string;
  notes?: string;
  lines?: TransferLinePayload[];
}

export interface FindManyTransfersOptions {
  sourceLocationId?: string;
  destinationLocationId?: string;
  status?: WarehouseTransferStatus;
  search?: string;
}

export const warehouseTransfersApi = {
  getAll: (options?: FindManyTransfersOptions): Promise<WarehouseTransferDto[]> => {
    const params = new URLSearchParams();
    if (options?.sourceLocationId) params.append('sourceLocationId', options.sourceLocationId);
    if (options?.destinationLocationId)
      params.append('destinationLocationId', options.destinationLocationId);
    if (options?.status) params.append('status', options.status);
    if (options?.search) params.append('search', options.search);

    const queryString = params.toString();
    const url = queryString ? `/warehouse-transfers?${queryString}` : '/warehouse-transfers';
    return apiClient.get<WarehouseTransferDto[]>(url);
  },
  getById: (id: string): Promise<WarehouseTransferDto> =>
    apiClient.get<WarehouseTransferDto>(`/warehouse-transfers/${id}`),
  create: (payload: CreateWarehouseTransferPayload): Promise<WarehouseTransferDto> =>
    apiClient.post<WarehouseTransferDto, CreateWarehouseTransferPayload>(
      '/warehouse-transfers',
      payload,
    ),
  update: (
    id: string,
    payload: UpdateWarehouseTransferPayload,
  ): Promise<WarehouseTransferDto> =>
    apiClient.put<WarehouseTransferDto, UpdateWarehouseTransferPayload>(
      `/warehouse-transfers/${id}`,
      payload,
    ),
  submit: (id: string): Promise<WarehouseTransferDto> =>
    apiClient.post<WarehouseTransferDto, Record<string, never>>(
      `/warehouse-transfers/${id}/submit`,
      {},
    ),
  dispatch: (id: string): Promise<WarehouseTransferDto> =>
    apiClient.post<WarehouseTransferDto, Record<string, never>>(
      `/warehouse-transfers/${id}/dispatch`,
      {},
    ),
  receive: (id: string): Promise<WarehouseTransferDto> =>
    apiClient.post<WarehouseTransferDto, Record<string, never>>(
      `/warehouse-transfers/${id}/receive`,
      {},
    ),
  cancel: (id: string): Promise<WarehouseTransferDto> =>
    apiClient.post<WarehouseTransferDto, Record<string, never>>(
      `/warehouse-transfers/${id}/cancel`,
      {},
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/warehouse-transfers/${id}`),
};
