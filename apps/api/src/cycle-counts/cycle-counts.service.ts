import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  CycleCount,
  CycleCountRepository,
  CycleCountStatus,
} from '@ananya/warehouse';
import {
  CreateCycleCountDto,
  UpdateCycleCountDto,
  AssignCounterDto,
  RecordPhysicalCountsDto,
  ApproveCycleCountDto,
} from './dtos';
import { StockAdjustmentsService } from '../stock-adjustments/stock-adjustments.service';

export const CYCLE_COUNT_REPOSITORY = 'CYCLE_COUNT_REPOSITORY';

export interface DiscrepancySummary {
  totalItemsCounted: number;
  matchingItems: number;
  shortageItems: number;
  surplusItems: number;
  totalQuantityDifference: number;
}

@Injectable()
export class CycleCountsService {
  constructor(
    @Inject(CYCLE_COUNT_REPOSITORY)
    private readonly cycleCountRepository: CycleCountRepository,
    private readonly stockAdjustmentsService: StockAdjustmentsService,
  ) {}

  async create(dto: CreateCycleCountDto): Promise<CycleCount> {
    const countNumber =
      await this.cycleCountRepository.generateNextCountNumber();

    const cycleCount = CycleCount.create({
      countNumber,
      locationId: dto.locationId,
      assignedCounter: dto.assignedCounter,
      scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
      createdBy: dto.createdBy || 'SYSTEM',
      notes: dto.notes,
      lines: dto.lines,
    });

    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async update(id: string, dto: UpdateCycleCountDto): Promise<CycleCount> {
    const cycleCount = await this.findOne(id);
    if (cycleCount.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot edit Cycle Count in ${cycleCount.status} status.`,
      );
    }

    cycleCount.updateHeader({
      locationId: dto.locationId,
      assignedCounter: dto.assignedCounter,
      scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
      notes: dto.notes,
    });

    if (dto.lines) {
      cycleCount.lines = [];
      for (const line of dto.lines) {
        cycleCount.addLine(line);
      }
    }

    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async findAll(
    locationId?: string,
    status?: CycleCountStatus,
    assignedCounter?: string,
    search?: string,
  ): Promise<CycleCount[]> {
    return this.cycleCountRepository.findMany({
      locationId,
      status,
      assignedCounter,
      search,
    });
  }

  async findOne(id: string): Promise<CycleCount> {
    const cycleCount = await this.cycleCountRepository.findById(id);
    if (!cycleCount) {
      throw new NotFoundException(`Cycle Count with ID ${id} not found.`);
    }
    return cycleCount;
  }

  async assignCounter(id: string, dto: AssignCounterDto): Promise<CycleCount> {
    const cycleCount = await this.findOne(id);
    cycleCount.assignCounter(dto.assignedCounter);
    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async startCounting(id: string): Promise<CycleCount> {
    const cycleCount = await this.findOne(id);
    cycleCount.startCounting();
    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async recordPhysicalCounts(
    id: string,
    dto: RecordPhysicalCountsDto,
  ): Promise<CycleCount> {
    const cycleCount = await this.findOne(id);
    cycleCount.recordPhysicalCounts(dto.counts);
    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async reviewVariances(id: string): Promise<DiscrepancySummary> {
    const cycleCount = await this.findOne(id);
    let matching = 0;
    let shortage = 0;
    let surplus = 0;
    let totalDiff = 0;

    for (const line of cycleCount.lines) {
      totalDiff += line.variance;
      if (line.variance === 0) {
        matching++;
      } else if (line.variance < 0) {
        shortage++;
      } else {
        surplus++;
      }
    }

    return {
      totalItemsCounted: cycleCount.lines.length,
      matchingItems: matching,
      shortageItems: shortage,
      surplusItems: surplus,
      totalQuantityDifference: Math.round(totalDiff * 10000) / 10000,
    };
  }

  async approve(id: string, dto?: ApproveCycleCountDto): Promise<CycleCount> {
    const cycleCount = await this.findOne(id);
    if (cycleCount.status === 'APPROVED') return cycleCount;

    const approvedBy = dto?.approvedBy || 'SYSTEM';

    // Find lines with non-zero discrepancies
    const discrepancyLines = cycleCount.lines.filter((l) => l.variance !== 0);

    let stockAdjustmentId: string | undefined = undefined;

    if (discrepancyLines.length > 0) {
      // Generate a Stock Adjustment for reconciliation
      const adjustment = await this.stockAdjustmentsService.create({
        locationId: cycleCount.locationId,
        reason: `Cycle Count reconciliation (${cycleCount.countNumber})`,
        notes: `Automated stock adjustment generated from Cycle Count ${cycleCount.countNumber}`,
        createdBy: approvedBy,
        lines: discrepancyLines.map((l) => ({
          componentId: l.componentId,
          currentQuantity: l.systemQuantity,
          countedQuantity: l.countedQuantity,
          unitOfMeasure: l.unitOfMeasure,
        })),
      });

      // Approve the Stock Adjustment to post immutable Inventory Transactions
      await this.stockAdjustmentsService.approve(adjustment.id, {
        approvedBy,
      });

      stockAdjustmentId = adjustment.id;
    }

    cycleCount.approve(approvedBy, stockAdjustmentId);
    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async cancel(id: string): Promise<CycleCount> {
    const cycleCount = await this.findOne(id);
    cycleCount.cancel();
    await this.cycleCountRepository.save(cycleCount);
    return cycleCount;
  }

  async delete(id: string): Promise<void> {
    const cycleCount = await this.findOne(id);
    if (cycleCount.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT Cycle Counts can be deleted.');
    }
    await this.cycleCountRepository.delete(id);
  }
}
