import { GoodsReceipt } from "./goods-receipt";

export interface FindManyGoodsReceiptsOptions {
  purchaseOrderId?: string;
  supplierId?: string;
}

export interface GoodsReceiptRepository {
  findById(id: string): Promise<GoodsReceipt | null>;
  findByGrNumber(grNumber: string): Promise<GoodsReceipt | null>;
  findMany(options?: FindManyGoodsReceiptsOptions): Promise<GoodsReceipt[]>;
  save(gr: GoodsReceipt): Promise<void>;
  delete(id: string): Promise<void>;
  generateNextGrNumber(): Promise<string>;
}
