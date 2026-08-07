import { apiClient } from "../api-client";

export interface UnitDto {
  id: string;
  name: string;
  category: string;
  conversionFactor: number | string | null;
  precision: number | string;
  isBaseUnit: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUnitPayload {
  name: string;
  category?: string;
  isBaseUnit?: boolean;
  conversionFactor?: number | string | null;
  precision?: number | string;
}

export interface UpdateUnitPayload {
  name?: string;
  category?: string;
  isBaseUnit?: boolean;
  conversionFactor?: number | null;
  precision?: number;
  isActive?: boolean;
}

export const unitsApi = {
  getAll: (): Promise<UnitDto[]> => apiClient.get<UnitDto[]>("/units"),
  getById: (id: string): Promise<UnitDto> =>
    apiClient.get<UnitDto>(`/units/${id}`),
  create: (payload: CreateUnitPayload): Promise<UnitDto> =>
    apiClient.post<UnitDto, CreateUnitPayload>("/units", payload),
  update: (id: string, payload: UpdateUnitPayload): Promise<UnitDto> =>
    apiClient.put<UnitDto, UpdateUnitPayload>(`/units/${id}`, payload),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/units/${id}`),
};
