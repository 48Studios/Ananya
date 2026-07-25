import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { WarehousePolicy, WarehousePolicyRepository } from '@ananya/warehouse';
import { SaveWarehousePolicyDto } from './dtos';

export const WAREHOUSE_POLICY_REPOSITORY = 'WAREHOUSE_POLICY_REPOSITORY';

@Injectable()
export class WarehousePoliciesService {
  constructor(
    @Inject(WAREHOUSE_POLICY_REPOSITORY)
    private readonly policyRepository: WarehousePolicyRepository,
  ) {}

  async savePolicy(dto: SaveWarehousePolicyDto): Promise<WarehousePolicy> {
    let policy = await this.policyRepository.findByWarehouseId(dto.warehouseId);
    if (policy) {
      policy.updateRules(dto);
    } else {
      policy = WarehousePolicy.create(dto);
    }
    await this.policyRepository.save(policy);
    return policy;
  }

  async findByWarehouseId(warehouseId: string): Promise<WarehousePolicy> {
    const policy = await this.policyRepository.findByWarehouseId(warehouseId);
    if (!policy) {
      throw new NotFoundException(
        `Warehouse policy for warehouse ID ${warehouseId} not found.`,
      );
    }
    return policy;
  }

  async findAll(): Promise<WarehousePolicy[]> {
    return this.policyRepository.findMany();
  }
}
