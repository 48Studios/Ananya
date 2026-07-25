import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  FinishedGoodsReceipt,
  FinishedGoodsReceiptRepository,
  ManufacturingTraceability,
  ManufacturingTraceabilityRepository,
  ProductionOrderRepository,
} from '@ananya/manufacturing';
import { CreateFinishedGoodsDto, AddFgrLineDto } from './dtos';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';
import { PRODUCTION_ORDER_REPOSITORY } from '../production-orders/production-orders.service';

export const FGR_REPOSITORY = 'FGR_REPOSITORY';
export const TRACEABILITY_REPOSITORY_FOR_FGR =
  'TRACEABILITY_REPOSITORY_FOR_FGR';

@Injectable()
export class FinishedGoodsService {
  constructor(
    @Inject(FGR_REPOSITORY)
    private readonly fgrRepository: FinishedGoodsReceiptRepository,
    @Inject(TRACEABILITY_REPOSITORY_FOR_FGR)
    private readonly traceabilityRepository: ManufacturingTraceabilityRepository,
    @Inject(PRODUCTION_ORDER_REPOSITORY)
    private readonly productionOrderRepository: ProductionOrderRepository,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateFinishedGoodsDto): Promise<FinishedGoodsReceipt> {
    const fgrNumber = await this.fgrRepository.generateNextFgrNumber();
    const fgr = FinishedGoodsReceipt.create({
      fgrNumber,
      productionOrderId: dto.productionOrderId,
    });
    await this.fgrRepository.save(fgr);
    return fgr;
  }

  async findAll(productionOrderId?: string): Promise<FinishedGoodsReceipt[]> {
    return this.fgrRepository.findMany({ productionOrderId });
  }

  async findOne(id: string): Promise<FinishedGoodsReceipt> {
    const fgr = await this.fgrRepository.findById(id);
    if (!fgr) {
      throw new NotFoundException(
        `Finished Goods Receipt with ID ${id} not found.`,
      );
    }
    return fgr;
  }

  async addLine(
    fgrId: string,
    dto: AddFgrLineDto,
  ): Promise<FinishedGoodsReceipt> {
    const fgr = await this.findOne(fgrId);
    fgr.addLine(dto);
    await this.fgrRepository.save(fgr);
    return fgr;
  }

  async post(id: string): Promise<FinishedGoodsReceipt> {
    const fgr = await this.findOne(id);
    if (fgr.status !== 'DRAFT') {
      throw new BadRequestException(
        'Finished Goods Receipt has already been posted.',
      );
    }

    // Receipt inventory for each line with produced quantity
    for (const line of fgr.lines) {
      if (line.quantityProduced > 0) {
        await this.inventoryTransactionsService.create({
          transactionType: 'Receipt',
          componentId: line.componentId,
          destinationLocationId: line.locationId,
          quantity: line.quantityProduced,
          unitOfMeasure: 'pcs',
          reference: fgr.fgrNumber,
          reason: 'Finished goods from production order',
          createdBy: 'SYSTEM',
        });
      }

      // Record traceability
      const trace = ManufacturingTraceability.create({
        eventType: 'FINISHED_GOODS_PRODUCED',
        productionOrderId: fgr.productionOrderId,
        fgrId: fgr.id,
        componentId: line.componentId,
        locationId: line.locationId,
        quantity: line.quantityProduced,
        batchNumber: line.batchNumber,
        serialNumbers: line.serialNumbers,
      });
      await this.traceabilityRepository.save(trace);
    }

    // Mark posted
    fgr.post();
    await this.fgrRepository.save(fgr);

    // Update production order completed/scrapped quantities
    const order = await this.productionOrderRepository.findById(
      fgr.productionOrderId,
    );
    if (order) {
      order.addCompletedQuantity(fgr.totalProduced, fgr.totalScrapped);
      await this.productionOrderRepository.save(order);
    }

    // Rebuild projections
    await this.inventoryProjectionsService.rebuild();

    return fgr;
  }
}
