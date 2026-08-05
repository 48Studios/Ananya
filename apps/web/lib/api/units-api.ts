import { apiClient } from "../api-client";

export interface UnitDto {
  id: string;
  name: string;
  category: string;
  conversionFactor: string;
  precision: string;
  isBaseUnit: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUnitPayload {
  name: string;
  category?: string;
  conversionFactor?: string;
  precision?: string;
}

export const unitsApi = {
  getAll: (): Promise<UnitDto[]> => apiClient.get<UnitDto[]>("/units"),
  getById: (id: string): Promise<UnitDto> =>
    apiClient.get<UnitDto>(`/units/${id}`),
  create: (payload: CreateUnitPayload): Promise<UnitDto> =>
    apiClient.post<UnitDto, CreateUnitPayload>("/units", {
      name: payload.name,
      category: payload.category || "Count",
      conversionFactor: payload.conversionFactor || "1.0000",
      precision: payload.precision || "0",
    }),
};
