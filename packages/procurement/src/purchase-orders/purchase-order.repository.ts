import { PurchaseOrder, type PurchaseOrderStatus } from "./purchase-order";

export interface FindManyPurchaseOrdersOptions {
  supplierId?: string;
  status?: PurchaseOrderStatus;
  search?: string;
}

export interface PurchaseOrderRepository {
  findById(id: string): Promise<PurchaseOrder | null>;
  findByPoNumber(poNumber: string): Promise<PurchaseOrder | null>;
  findMany(options?: FindManyPurchaseOrdersOptions): Promise<PurchaseOrder[]>;
  save(po: PurchaseOrder): Promise<void>;
  delete(id: string): Promise<void>;
  generateNextPoNumber(): Promise<string>;
}
