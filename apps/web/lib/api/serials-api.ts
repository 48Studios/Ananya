import { apiClient } from "../api-client";

export interface SerialDto {
  id: string;
  componentId: string;
  componentSku: string;
  sku?: string;
  componentName: string;
  serialNumber: string;
  locationId?: string | null;
  locationName?: string | null;
  location?: string;
  status?: "IN_STOCK" | "ASSIGNED" | "DISPATCHED" | "MAINTENANCE";
  createdAt: string;
  updatedAt?: string;
}

export interface CreateSerialPayload {
  serialNumber: string;
  sku: string;
  componentName: string;
  status?: "IN_STOCK" | "ASSIGNED" | "DISPATCHED" | "MAINTENANCE";
  location: string;
}

export type UpdateSerialPayload = Partial<CreateSerialPayload>;

export const serialsApi = {
  getAll: async (): Promise<SerialDto[]> => apiClient.get<SerialDto[]>("/serials"),
  getById: async (id: string): Promise<SerialDto> =>
    apiClient.get<SerialDto>(`/serials/${id}`),
  create: async (payload: CreateSerialPayload): Promise<SerialDto> => {
    void payload;
    throw new Error(
      "Serial creation requires a component-based workflow and is not available from this read-only registry.",
    );
  },
  update: async (
    id: string,
    payload: UpdateSerialPayload,
  ): Promise<SerialDto> => {
    void id;
    void payload;
    throw new Error(
      "Serial updates are not supported by the current serial registry API.",
    );
  },
};
