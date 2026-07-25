import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  CycleCount,
  CycleCountRepository,
  CycleCountStatus,
  StockCount,
} from '@ananya/warehouse';
import { CreateCycleCountDto } from './dtos';
import { StockCountsService } from '../stock-counts/stock-counts.service';

export const CYCLE_COUNT_REPOSITORY = 'CYCLE_COUNT_REPOSITORY';

@Injectable()
export class CycleCountsService {
  constructor(
    @Inject(CYCLE_COUNT_REPOSITORY)
    private readonly cycleCountRepository: CycleCountRepository,
    private readonly stockCountsService: StockCountsService,
  ) {}

  async create(dto: CreateCycleCountDto): Promise<CycleCount> {
    const cycleCount = CycleCount.create({
      warehouseId: dto.warehouseId,
      name: dto.name,
      frequency: dto.frequency,
      selectionRule: dto.selectionRule,
      nextScheduledDate: dto.nextScheduledDate
        ? new Date(dto.nextScheduledDate)
        : undefined,
    });
    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async findAll(
    warehouseId?: string,
    status?: CycleCountStatus,
  ): Promise<CycleCount[]> {
    return this.cycleCountRepository.findMany({ warehouseId, status });
  }

  async findOne(id: string): Promise<CycleCount> {
    const cycleCount = await this.cycleCountRepository.findById(id);
    if (!cycleCount) {
      throw new NotFoundException(
        `Cycle Count schedule with ID ${id} not found.`,
      );
    }
    return cycleCount;
  }

  async executeSchedule(id: string): Promise<StockCount> {
    const cycleCount = await this.findOne(id);
    const stockCount = await this.stockCountsService.create({
      warehouseId: cycleCount.warehouseId,
      assignedUser: 'SYSTEM (Cycle Count)',
    });
    cycleCount.markExecuted();
    await this.cycleCountRepository.save(cycleCount);
    return stockCount;
  }

  async pause(id: string): Promise<CycleCount> {
    const cycleCount = await this.findOne(id);
    cycleCount.pause();
    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async resume(id: string): Promise<CycleCount> {
    const cycleCount = await this.findOne(id);
    cycleCount.resume();
    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }
}
