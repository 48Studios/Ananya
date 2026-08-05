import { apiClient } from "../api-client";

export interface WarehouseDto {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehousePayload {
  code: string;
  name: string;
  description?: string;
}

export const warehousesApi = {
  getAll: (): Promise<WarehouseDto[]> =>
    apiClient.get<WarehouseDto[]>("/warehouses"),
  getById: (id: string): Promise<WarehouseDto> =>
    apiClient.get<WarehouseDto>(`/warehouses/${id}`),
  create: (payload: CreateWarehousePayload): Promise<WarehouseDto> =>
    apiClient.post<WarehouseDto, CreateWarehousePayload>(
      "/warehouses",
      payload,
    ),
};
