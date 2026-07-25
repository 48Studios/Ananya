import type { ManufacturingTraceability } from "./manufacturing-traceability";

export interface ManufacturingTraceabilityRepository {
  findByProductionOrderId(
    productionOrderId: string,
  ): Promise<ManufacturingTraceability[]>;
  findByFinishedGoodsComponentId(
    componentId: string,
  ): Promise<ManufacturingTraceability[]>;
  findByConsumedComponentId(
    componentId: string,
  ): Promise<ManufacturingTraceability[]>;
  findByBatchNumber(
    batchNumber: string,
  ): Promise<ManufacturingTraceability[]>;
  findBySerialNumber(
    serialNumber: string,
  ): Promise<ManufacturingTraceability[]>;
  save(record: ManufacturingTraceability): Promise<void>;
  saveMany(records: ManufacturingTraceability[]): Promise<void>;
}
