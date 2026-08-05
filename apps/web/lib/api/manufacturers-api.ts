import { apiClient } from "../api-client";

export interface ManufacturerDto {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateManufacturerPayload {
  code: string;
  name: string;
}

export interface UpdateManufacturerPayload {
  code?: string;
  name?: string;
  isActive?: boolean;
}

export const manufacturersApi = {
  getAll: (): Promise<ManufacturerDto[]> =>
    apiClient.get<ManufacturerDto[]>("/manufacturers"),
  getById: (id: string): Promise<ManufacturerDto> =>
    apiClient.get<ManufacturerDto>(`/manufacturers/${id}`),
  create: (payload: CreateManufacturerPayload): Promise<ManufacturerDto> =>
    apiClient.post<ManufacturerDto, CreateManufacturerPayload>(
      "/manufacturers",
      payload,
    ),
  update: (
    id: string,
    payload: UpdateManufacturerPayload,
  ): Promise<ManufacturerDto> =>
    apiClient.put<ManufacturerDto, UpdateManufacturerPayload>(
      `/manufacturers/${id}`,
      payload,
    ),
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/manufacturers/${id}`),
};
