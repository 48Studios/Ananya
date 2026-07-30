import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  StockAdjustment,
  StockAdjustmentRepository,
  StockAdjustmentStatus,
} from '@ananya/inventory';
import { CreateStockAdjustmentDto, ApproveStockAdjustmentDto } from './dtos';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const STOCK_ADJUSTMENT_REPOSITORY = 'STOCK_ADJUSTMENT_REPOSITORY';

@Injectable()
export class StockAdjustmentsService {
  constructor(
    @Inject(STOCK_ADJUSTMENT_REPOSITORY)
    private readonly repository: StockAdjustmentRepository,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateStockAdjustmentDto): Promise<StockAdjustment> {
    const adjustmentNumber =
      await this.repository.generateNextAdjustmentNumber();
    const adj = StockAdjustment.create({
      adjustmentNumber,
      locationId: dto.locationId,
      reason: dto.reason,
      notes: dto.notes,
      createdBy: dto.createdBy || 'SYSTEM',
      lines: dto.lines.map((l) => ({
        componentId: l.componentId,
        currentQuantity: l.currentQuantity,
        countedQuantity: l.countedQuantity,
        unitOfMeasure: l.unitOfMeasure,
      })),
    });

    await this.repository.save(adj);
    return adj;
  }

  async findAll(
    locationId?: string,
    componentId?: string,
    status?: StockAdjustmentStatus,
    search?: string,
  ): Promise<StockAdjustment[]> {
    return this.repository.findMany({
      locationId,
      componentId,
      status,
      search,
    });
  }

  async findOne(id: string): Promise<StockAdjustment> {
    const adj = await this.repository.findById(id);
    if (!adj) {
      throw new NotFoundException(`Stock Adjustment with ID ${id} not found.`);
    }
    return adj;
  }

  async approve(
    id: string,
    dto?: ApproveStockAdjustmentDto,
  ): Promise<StockAdjustment> {
    const adj = await this.findOne(id);
    if (adj.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot approve adjustment in ${adj.status} status.`,
      );
    }

    const approvedBy = dto?.approvedBy || 'SYSTEM';

    // Process line item inventory ledger entries
    for (const line of adj.lines) {
      if (line.difference === 0) continue;

      if (line.difference > 0) {
        // Stock addition -> destination location
        await this.inventoryTransactionsService.create({
          transactionType: 'Adjustment',
          componentId: line.componentId,
          destinationLocationId: adj.locationId,
          quantity: line.difference,
          unitOfMeasure: line.unitOfMeasure,
          reference: adj.adjustmentNumber,
          reason: `Stock adjustment increase: ${adj.reason}`,
          createdBy: approvedBy,
        });
      } else {
        // Stock removal -> source location
        await this.inventoryTransactionsService.create({
          transactionType: 'Adjustment',
          componentId: line.componentId,
          sourceLocationId: adj.locationId,
          quantity: Math.abs(line.difference),
          unitOfMeasure: line.unitOfMeasure,
          reference: adj.adjustmentNumber,
          reason: `Stock adjustment decrease: ${adj.reason}`,
          createdBy: approvedBy,
        });
      }
    }

    adj.approve(approvedBy);
    await this.repository.save(adj);

    // Rebuild inventory projections
    await this.inventoryProjectionsService.rebuild();

    return adj;
  }

  async cancel(id: string): Promise<StockAdjustment> {
    const adj = await this.findOne(id);
    if (adj.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot cancel adjustment in ${adj.status} status.`,
      );
    }

    adj.cancel();
    await this.repository.save(adj);
    return adj;
  }
}
