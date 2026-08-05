import {
  StockAdjustment,
  type StockAdjustmentStatus,
} from "./stock-adjustment";

export interface FindManyStockAdjustmentsOptions {
  locationId?: string;
  componentId?: string;
  status?: StockAdjustmentStatus;
  search?: string;
}

export interface StockAdjustmentRepository {
  findById(id: string): Promise<StockAdjustment | null>;
  findByAdjustmentNumber(number: string): Promise<StockAdjustment | null>;
  findMany(
    options?: FindManyStockAdjustmentsOptions,
  ): Promise<StockAdjustment[]>;
  save(adjustment: StockAdjustment): Promise<void>;
  generateNextAdjustmentNumber(): Promise<string>;
}
