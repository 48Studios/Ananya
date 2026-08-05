import type { FinishedGoodsReceipt } from "./finished-goods-receipt";

export interface FindManyFgrsOptions {
  productionOrderId?: string;
}

export interface FinishedGoodsReceiptRepository {
  findById(id: string): Promise<FinishedGoodsReceipt | null>;
  findByProductionOrderId(
    productionOrderId: string,
  ): Promise<FinishedGoodsReceipt[]>;
  findMany(options?: FindManyFgrsOptions): Promise<FinishedGoodsReceipt[]>;
  save(fgr: FinishedGoodsReceipt): Promise<void>;
  generateNextFgrNumber(): Promise<string>;
}
