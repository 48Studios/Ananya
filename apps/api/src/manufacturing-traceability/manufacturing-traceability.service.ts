import { Injectable, Inject } from '@nestjs/common';
import {
  ManufacturingTraceability,
  ManufacturingTraceabilityRepository,
} from '@ananya/manufacturing';

export const MFG_TRACEABILITY_REPOSITORY = 'MFG_TRACEABILITY_REPOSITORY';

@Injectable()
export class ManufacturingTraceabilityService {
  constructor(
    @Inject(MFG_TRACEABILITY_REPOSITORY)
    private readonly traceabilityRepository: ManufacturingTraceabilityRepository,
  ) {}

  async findByProductionOrder(
    productionOrderId: string,
  ): Promise<ManufacturingTraceability[]> {
    return this.traceabilityRepository.findByProductionOrderId(
      productionOrderId,
    );
  }

  async forwardTrace(
    batchNumber?: string,
    serialNumber?: string,
    componentId?: string,
  ): Promise<ManufacturingTraceability[]> {
    if (batchNumber) {
      return this.traceabilityRepository.findByBatchNumber(batchNumber);
    }
    if (serialNumber) {
      return this.traceabilityRepository.findBySerialNumber(serialNumber);
    }
    if (componentId) {
      return this.traceabilityRepository.findByFinishedGoodsComponentId(
        componentId,
      );
    }
    return [];
  }

  async backwardTrace(
    batchNumber?: string,
    serialNumber?: string,
    componentId?: string,
  ): Promise<ManufacturingTraceability[]> {
    if (batchNumber) {
      return this.traceabilityRepository.findByBatchNumber(batchNumber);
    }
    if (serialNumber) {
      return this.traceabilityRepository.findBySerialNumber(serialNumber);
    }
    if (componentId) {
      return this.traceabilityRepository.findByConsumedComponentId(componentId);
    }
    return [];
  }
}
