import { apiClient } from "../api-client";

/**
 * Mirrors the `FinishedGoodsReceipt` aggregate in `@ananya/manufacturing`. The
 * received products live on `lines`; the header records the work order, status
 * and posting time.
 */
export type FgrStatus = "DRAFT" | "POSTED";

export interface FinishedGoodsReceiptLineDto {
  id: string;
  fgrId: string;
  componentId: string;
  locationId: string;
  quantityProduced: number;
  quantityScrapped: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinishedGoodsReceiptDto {
  id: string;
  fgrNumber: string;
  productionOrderId: string;
  status: FgrStatus;
  postedAt: string | null;
  lines: FinishedGoodsReceiptLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AddFinishedGoodsLinePayload {
  componentId: string;
  locationId: string;
  quantityProduced: number;
  quantityScrapped?: number;
  batchNumber?: string;
}

export const finishedGoodsApi = {
  getAll: async (): Promise<FinishedGoodsReceiptDto[]> => {
    return apiClient.get<FinishedGoodsReceiptDto[]>("/finished-goods");
  },
  getById: async (id: string): Promise<FinishedGoodsReceiptDto> => {
    return apiClient.get<FinishedGoodsReceiptDto>(`/finished-goods/${id}`);
  },
  create: async (data: {
    productionOrderId: string;
  }): Promise<FinishedGoodsReceiptDto> => {
    return apiClient.post<FinishedGoodsReceiptDto>("/finished-goods", data);
  },
  addLine: async (
    id: string,
    data: AddFinishedGoodsLinePayload,
  ): Promise<unknown> => {
    return apiClient.post(`/finished-goods/${id}/lines`, data);
  },
  post: async (id: string): Promise<unknown> => {
    return apiClient.post(`/finished-goods/${id}/post`, {});
  },
};
