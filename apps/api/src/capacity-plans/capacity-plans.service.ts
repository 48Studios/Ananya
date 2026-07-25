import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CapacityPlan, CapacityPlanRepository } from '@ananya/mrp';
import { CreateCapacityPlanDto } from './dtos';

export const CAPACITY_PLAN_REPOSITORY = 'CAPACITY_PLAN_REPOSITORY';

@Injectable()
export class CapacityPlansService {
  constructor(
    @Inject(CAPACITY_PLAN_REPOSITORY)
    private readonly capacityPlanRepository: CapacityPlanRepository,
  ) {}

  async create(dto: CreateCapacityPlanDto): Promise<CapacityPlan> {
    const plan = CapacityPlan.create({
      planningRunId: dto.planningRunId,
      workCenterId: dto.workCenterId,
      workCenterName: dto.workCenterName,
      availableCapacityHours: dto.availableCapacityHours,
      plannedCapacityHours: dto.plannedCapacityHours,
    });
    await this.capacityPlanRepository.save(plan);
    return plan;
  }

  async findAll(
    planningRunId?: string,
    workCenterId?: string,
    onlyOverloaded?: boolean,
  ): Promise<CapacityPlan[]> {
    return this.capacityPlanRepository.findMany({
      planningRunId,
      workCenterId,
      onlyOverloaded,
    });
  }

  async findOne(id: string): Promise<CapacityPlan> {
    const plan = await this.capacityPlanRepository.findById(id);
    if (!plan) {
      throw new NotFoundException(`Capacity Plan with ID ${id} not found.`);
    }
    return plan;
  }
}
