import type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderPriority,
} from "./production-order";

export interface FindManyProductionOrdersOptions {
  componentId?: string;
  bomId?: string;
  locationId?: string;
  status?: ProductionOrderStatus;
  priority?: ProductionOrderPriority;
  search?: string;
}

export interface ProductionOrderRepository {
  findById(id: string): Promise<ProductionOrder | null>;
  findByProductionNumber(productionNumber: string): Promise<ProductionOrder | null>;
  findMany(options?: FindManyProductionOrdersOptions): Promise<ProductionOrder[]>;
  save(order: ProductionOrder): Promise<void>;
  delete(id: string): Promise<void>;
  generateNextProductionNumber(): Promise<string>;
}
