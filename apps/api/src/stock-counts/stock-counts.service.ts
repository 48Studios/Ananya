import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  StockCount,
  StockCountRepository,
  StockCountStatus,
} from '@ananya/warehouse';
import { CreateStockCountDto, AddCountLineDto, AssignCounterDto } from './dtos';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const STOCK_COUNT_REPOSITORY = 'STOCK_COUNT_REPOSITORY';

@Injectable()
export class StockCountsService {
  constructor(
    @Inject(STOCK_COUNT_REPOSITORY)
    private readonly stockCountRepository: StockCountRepository,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateStockCountDto): Promise<StockCount> {
    const countNumber =
      await this.stockCountRepository.generateNextCountNumber();
    const count = StockCount.create({
      countNumber,
      warehouseId: dto.warehouseId,
      assignedUser: dto.assignedUser,
    });
    await this.stockCountRepository.save(count);
    return count;
  }

  async findAll(
    warehouseId?: string,
    status?: StockCountStatus,
  ): Promise<StockCount[]> {
    return this.stockCountRepository.findMany({ warehouseId, status });
  }

  async findOne(id: string): Promise<StockCount> {
    const count = await this.stockCountRepository.findById(id);
    if (!count) {
      throw new NotFoundException(`Stock Count with ID ${id} not found.`);
    }
    return count;
  }

  async assignUser(id: string, dto: AssignCounterDto): Promise<StockCount> {
    const count = await this.findOne(id);
    count.assignUser(dto.assignedUser);
    await this.stockCountRepository.save(count);
    return count;
  }

  async addLine(id: string, dto: AddCountLineDto): Promise<StockCount> {
    const count = await this.findOne(id);
    count.addLine(dto);
    await this.stockCountRepository.save(count);
    return count;
  }

  async submit(id: string): Promise<StockCount> {
    const count = await this.findOne(id);
    count.submit();
    await this.stockCountRepository.save(count);
    return count;
  }

  async approve(id: string): Promise<StockCount> {
    const count = await this.findOne(id);
    count.approve();
    await this.stockCountRepository.save(count);
    return count;
  }

  async postCount(id: string): Promise<StockCount> {
    const count = await this.findOne(id);
    if (count.status !== 'APPROVED') {
      throw new BadRequestException(
        'Stock Count must be APPROVED before posting adjustments.',
      );
    }

    // Process lines with non-zero variance into Inventory Adjustment Transactions
    for (const line of count.lines) {
      if (line.variance !== 0) {
        await this.inventoryTransactionsService.create({
          transactionType: 'Adjustment',
          componentId: line.componentId,
          destinationLocationId: line.binId,
          quantity: line.variance,
          unitOfMeasure: 'pcs',
          reference: count.countNumber,
          reason: 'Stock count physical adjustment',
          createdBy: 'SYSTEM',
        });
      }
    }

    // Mark count posted
    count.post();
    await this.stockCountRepository.save(count);

    // Rebuild inventory projections
    await this.inventoryProjectionsService.rebuild();

    return count;
  }

  async cancel(id: string): Promise<StockCount> {
    const count = await this.findOne(id);
    count.cancel();
    await this.stockCountRepository.save(count);
    return count;
  }
}
