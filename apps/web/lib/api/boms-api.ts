import { apiClient } from "../api-client";

export type BomStatus = "DRAFT" | "RELEASED" | "OBSOLETE";

export interface BomLineDto {
  id: string;
  bomId: string;
  componentId: string;
  quantityPerUnit: number;
  unitOfMeasure: string;
  scrapFactorPercent: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillOfMaterialsDto {
  id: string;
  componentId: string;
  revision: string;
  status: BomStatus;
  notes?: string | null;
  releasedAt?: string | null;
  lines: BomLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AddBomLinePayload {
  componentId: string;
  quantityPerUnit: number;
  unitOfMeasure?: string;
  scrapFactorPercent?: number;
  notes?: string | null;
}

export interface CreateBomPayload {
  componentId: string;
  revision?: string;
  notes?: string | null;
  lines?: AddBomLinePayload[];
}

export interface UpdateBomPayload {
  notes?: string | null;
  lines?: AddBomLinePayload[];
}

export interface FindManyBomsOptions {
  componentId?: string;
  status?: BomStatus;
}

export const bomsApi = {
  getAll: (options?: FindManyBomsOptions): Promise<BillOfMaterialsDto[]> => {
    const params = new URLSearchParams();
    if (options?.componentId) params.append("componentId", options.componentId);
    if (options?.status) params.append("status", options.status);

    const queryString = params.toString();
    const url = queryString ? `/boms?${queryString}` : "/boms";
    return apiClient.get<BillOfMaterialsDto[]>(url);
  },
  getById: (id: string): Promise<BillOfMaterialsDto> =>
    apiClient.get<BillOfMaterialsDto>(`/boms/${id}`),
  getRevisions: (componentId: string): Promise<BillOfMaterialsDto[]> =>
    apiClient.get<BillOfMaterialsDto[]>(`/boms/revisions/${componentId}`),
  create: (payload: CreateBomPayload): Promise<BillOfMaterialsDto> =>
    apiClient.post<BillOfMaterialsDto, CreateBomPayload>("/boms", payload),
  update: (
    id: string,
    payload: UpdateBomPayload,
  ): Promise<BillOfMaterialsDto> =>
    apiClient.put<BillOfMaterialsDto, UpdateBomPayload>(`/boms/${id}`, payload),
  duplicate: (id: string, newRevision?: string): Promise<BillOfMaterialsDto> =>
    apiClient.post<BillOfMaterialsDto, { newRevision?: string }>(
      `/boms/${id}/duplicate`,
      {
        newRevision,
      },
    ),
  release: (id: string): Promise<BillOfMaterialsDto> =>
    apiClient.post<BillOfMaterialsDto, Record<string, never>>(
      `/boms/${id}/release`,
      {},
    ),
  obsolete: (id: string): Promise<BillOfMaterialsDto> =>
    apiClient.post<BillOfMaterialsDto, Record<string, never>>(
      `/boms/${id}/obsolete`,
      {},
    ),
  delete: (id: string): Promise<void> => apiClient.delete<void>(`/boms/${id}`),
};
