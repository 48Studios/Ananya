import type { MaterialConsumption } from "./material-consumption";

export interface FindManyConsumptionsOptions {
  productionOrderId?: string;
}

export interface MaterialConsumptionRepository {
  findById(id: string): Promise<MaterialConsumption | null>;
  findByProductionOrderId(
    productionOrderId: string,
  ): Promise<MaterialConsumption[]>;
  findMany(
    options?: FindManyConsumptionsOptions,
  ): Promise<MaterialConsumption[]>;
  save(consumption: MaterialConsumption): Promise<void>;
  generateNextConsumptionNumber(): Promise<string>;
}
