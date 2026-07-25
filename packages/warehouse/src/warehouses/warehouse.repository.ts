import type { Warehouse, WarehouseBinProps } from "./warehouse";

export interface WarehouseRepository {
  findById(id: string): Promise<Warehouse | null>;
  findByCode(code: string): Promise<Warehouse | null>;
  findMany(): Promise<Warehouse[]>;
  findBinById(binId: string): Promise<WarehouseBinProps | null>;
  save(warehouse: Warehouse): Promise<void>;
}
