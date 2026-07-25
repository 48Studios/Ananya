import type {
  ProductionOrder,
  ProductionOrderStatus,
} from "./production-order";

export interface FindManyProductionOrdersOptions {
  componentId?: string;
  bomId?: string;
  status?: ProductionOrderStatus;
}

export interface ProductionOrderRepository {
  findById(id: string): Promise<ProductionOrder | null>;
  findByProductionNumber(
    productionNumber: string,
  ): Promise<ProductionOrder | null>;
  findMany(
    options?: FindManyProductionOrdersOptions,
  ): Promise<ProductionOrder[]>;
  save(order: ProductionOrder): Promise<void>;
  generateNextProductionNumber(): Promise<string>;
}
