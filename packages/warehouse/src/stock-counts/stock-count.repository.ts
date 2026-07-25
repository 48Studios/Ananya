import type { StockCount, StockCountStatus } from "./stock-count";

export interface FindManyStockCountsOptions {
  warehouseId?: string;
  status?: StockCountStatus;
}

export interface StockCountRepository {
  findById(id: string): Promise<StockCount | null>;
  findMany(options?: FindManyStockCountsOptions): Promise<StockCount[]>;
  save(stockCount: StockCount): Promise<void>;
  generateNextCountNumber(): Promise<string>;
}
