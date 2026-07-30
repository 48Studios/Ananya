import { apiClient } from '../api-client';

export type GoodsReceiptStatus = 'DRAFT' | 'COMPLETED' | 'CANCELLED';

export interface GoodsReceiptLineDto {
  id: string;
  goodsReceiptId: string;
  poLineId: string;
  componentId: string;
  locationId: string;
  quantityReceived: number;
  quantityRejected: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  serialNumbers: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptDto {
  id: string;
  grNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  status: GoodsReceiptStatus;
  packingSlipNumber?: string | null;
  receivedAt: string;
  lines: GoodsReceiptLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AddGoodsReceiptLinePayload {
  poLineId: string;
  componentId: string;
  locationId: string;
  quantityReceived: number;
  quantityRejected?: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  serialNumbers?: string[];
}

export interface CreateGoodsReceiptPayload {
  purchaseOrderId: string;
  supplierId: string;
  packingSlipNumber?: string | null;
  receivedAt?: string | null;
  lines?: AddGoodsReceiptLinePayload[];
}

export interface FindManyGrOptions {
  purchaseOrderId?: string;
  supplierId?: string;
}

export const goodsReceiptsApi = {
  getAll: (options?: FindManyGrOptions): Promise<GoodsReceiptDto[]> => {
    const params = new URLSearchParams();
    if (options?.purchaseOrderId) params.append('purchaseOrderId', options.purchaseOrderId);
    if (options?.supplierId) params.append('supplierId', options.supplierId);

    const queryString = params.toString();
    const url = queryString ? `/goods-receipts?${queryString}` : '/goods-receipts';
    return apiClient.get<GoodsReceiptDto[]>(url);
  },
  getById: (id: string): Promise<GoodsReceiptDto> =>
    apiClient.get<GoodsReceiptDto>(`/goods-receipts/${id}`),
  create: (payload: CreateGoodsReceiptPayload): Promise<GoodsReceiptDto> =>
    apiClient.post<GoodsReceiptDto, CreateGoodsReceiptPayload>('/goods-receipts', payload),
  postReceipt: (id: string): Promise<GoodsReceiptDto> =>
    apiClient.post<GoodsReceiptDto, Record<string, never>>(`/goods-receipts/${id}/post`, {}),
};
