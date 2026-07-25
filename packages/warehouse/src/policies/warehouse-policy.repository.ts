import type { WarehousePolicy } from "./warehouse-policy";

export interface WarehousePolicyRepository {
  findById(id: string): Promise<WarehousePolicy | null>;
  findByWarehouseId(warehouseId: string): Promise<WarehousePolicy | null>;
  findMany(): Promise<WarehousePolicy[]>;
  save(policy: WarehousePolicy): Promise<void>;
}
