import { apiClient } from '../api-client';

export type ReservationStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'FULFILLED'
  | 'RELEASED'
  | 'EXPIRED'
  | 'CANCELLED';

export type ReservationType =
  | 'WORK_ORDER'
  | 'PROJECT'
  | 'PURCHASE_REQUEST'
  | 'SALES_ORDER';

export interface ReservationLineDto {
  id: string;
  reservationId: string;
  componentId: string;
  locationId: string;
  reservedQuantity: number;
  fulfilledQuantity: number;
  unitOfMeasure: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationDto {
  id: string;
  reservationNumber: string;
  reservationType: ReservationType;
  referenceDocument?: string | null;
  reservedBy: string;
  status: ReservationStatus;
  notes?: string | null;
  lines: ReservationLineDto[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export interface ReservationLineInputPayload {
  componentId: string;
  locationId: string;
  reservedQuantity: number;
  unitOfMeasure?: string;
  notes?: string;
}

export interface CreateReservationPayload {
  reservationType: ReservationType;
  referenceDocument?: string;
  reservedBy: string;
  notes?: string;
  expiresAt?: string;
  lines?: ReservationLineInputPayload[];
}

export interface UpdateReservationPayload {
  reservationType?: ReservationType;
  referenceDocument?: string;
  reservedBy?: string;
  notes?: string;
  expiresAt?: string;
  lines?: ReservationLineInputPayload[];
}

export interface AvailableQuantityDto {
  onHand: number;
  reserved: number;
  available: number;
}

export interface FindManyReservationsOptions {
  componentId?: string;
  locationId?: string;
  reservationType?: ReservationType;
  status?: ReservationStatus;
  referenceDocument?: string;
  search?: string;
}

export const reservationsApi = {
  getAll: (options?: FindManyReservationsOptions): Promise<ReservationDto[]> => {
    const params = new URLSearchParams();
    if (options?.componentId) params.append('componentId', options.componentId);
    if (options?.locationId) params.append('locationId', options.locationId);
    if (options?.reservationType)
      params.append('reservationType', options.reservationType);
    if (options?.status) params.append('status', options.status);
    if (options?.referenceDocument)
      params.append('referenceDocument', options.referenceDocument);
    if (options?.search) params.append('search', options.search);

    const queryString = params.toString();
    const url = queryString ? `/reservations?${queryString}` : '/reservations';
    return apiClient.get<ReservationDto[]>(url);
  },
  getById: (id: string): Promise<ReservationDto> =>
    apiClient.get<ReservationDto>(`/reservations/${id}`),
  getAvailable: (
    componentId: string,
    locationId: string,
  ): Promise<AvailableQuantityDto> =>
    apiClient.get<AvailableQuantityDto>(
      `/reservations/available?componentId=${componentId}&locationId=${locationId}`,
    ),
  create: (payload: CreateReservationPayload): Promise<ReservationDto> =>
    apiClient.post<ReservationDto, CreateReservationPayload>(
      '/reservations',
      payload,
    ),
  update: (
    id: string,
    payload: UpdateReservationPayload,
  ): Promise<ReservationDto> =>
    apiClient.put<ReservationDto, UpdateReservationPayload>(
      `/reservations/${id}`,
      payload,
    ),
  fulfill: (id: string): Promise<ReservationDto> =>
    apiClient.post<ReservationDto, Record<string, never>>(
      `/reservations/${id}/fulfill`,
      {},
    ),
  release: (id: string): Promise<ReservationDto> =>
    apiClient.post<ReservationDto, Record<string, never>>(
      `/reservations/${id}/release`,
      {},
    ),
  cancel: (id: string): Promise<ReservationDto> =>
    apiClient.post<ReservationDto, Record<string, never>>(
      `/reservations/${id}/cancel`,
      {},
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/reservations/${id}`),
};
