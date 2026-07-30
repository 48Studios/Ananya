import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ProductionOrder,
  ProductionOrderRepository,
  ProductionOrderStatus,
  ProductionOrderPriority,
} from '@ananya/manufacturing';
import {
  CreateProductionOrderDto,
  UpdateProductionOrderDto,
  RecordPartialOutputDto,
  RecordScrapDto,
  CompleteProductionOrderDto,
} from './dtos';
import { BomsService } from '../boms/boms.service';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const PRODUCTION_ORDER_REPOSITORY = 'PRODUCTION_ORDER_REPOSITORY';

export interface MaterialRequirementDetail {
  componentId: string;
  quantityPerUnit: number;
  unitOfMeasure: string;
  scrapFactorPercent: number;
  requiredQuantity: number;
  reservedQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  availableQuantity: number;
  isShortage: boolean;
}

export interface ProductionActivityItem {
  id: string;
  eventType:
    | 'STARTED'
    | 'MATERIAL_CONSUMED'
    | 'OUTPUT_PRODUCED'
    | 'SCRAP_RECORDED'
    | 'PAUSED'
    | 'RESUMED'
    | 'COMPLETED'
    | 'RELEASED';
  title: string;
  description: string;
  quantity?: number;
  unitOfMeasure?: string;
  timestamp: string;
  createdBy?: string;
}

@Injectable()
export class ProductionOrdersService {
  constructor(
    @Inject(PRODUCTION_ORDER_REPOSITORY)
    private readonly poRepository: ProductionOrderRepository,
    private readonly bomsService: BomsService,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateProductionOrderDto): Promise<ProductionOrder> {
    const bom = await this.bomsService.findOne(dto.bomId);
    if (bom.componentId !== dto.componentId) {
      throw new BadRequestException(
        'Selected BOM does not match the finished product component.',
      );
    }

    const productionNumber =
      await this.poRepository.generateNextProductionNumber();

    const order = ProductionOrder.create({
      productionNumber,
      bomId: dto.bomId,
      componentId: dto.componentId,
      locationId: dto.locationId,
      priority: dto.priority,
      quantityPlanned: dto.quantityPlanned,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      notes: dto.notes,
      createdBy: dto.createdBy || 'SYSTEM',
    });

    await this.poRepository.save(order);
    return order;
  }

  async update(
    id: string,
    dto: UpdateProductionOrderDto,
  ): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot edit Work Order in ${order.status} status.`,
      );
    }

    order.updateHeader({
      locationId: dto.locationId,
      priority: dto.priority,
      quantityPlanned: dto.quantityPlanned,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      notes: dto.notes,
    });

    await this.poRepository.save(order);
    return order;
  }

  async findAll(
    componentId?: string,
    bomId?: string,
    locationId?: string,
    status?: ProductionOrderStatus,
    priority?: ProductionOrderPriority,
    search?: string,
  ): Promise<ProductionOrder[]> {
    return this.poRepository.findMany({
      componentId,
      bomId,
      locationId,
      status,
      priority,
      search,
    });
  }

  async findOne(id: string): Promise<ProductionOrder> {
    const order = await this.poRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Work Order with ID ${id} not found.`);
    }
    return order;
  }

  async getMaterialRequirements(
    id: string,
  ): Promise<MaterialRequirementDetail[]> {
    const order = await this.findOne(id);
    const bom = await this.bomsService.findOne(order.bomId);

    const result: MaterialRequirementDetail[] = [];
    const completedRatio =
      order.quantityPlanned > 0
        ? order.quantityCompleted / order.quantityPlanned
        : 0;

    for (const line of bom.lines) {
      const totalGrossQty =
        order.quantityPlanned *
        line.quantityPerUnit *
        (1 + line.scrapFactorPercent / 100);
      const requiredQuantity = Math.round(totalGrossQty * 10000) / 10000;
      const consumedQuantity =
        Math.round(requiredQuantity * completedRatio * 10000) / 10000;
      const remainingQuantity =
        Math.round((requiredQuantity - consumedQuantity) * 10000) / 10000;

      result.push({
        componentId: line.componentId,
        quantityPerUnit: line.quantityPerUnit,
        unitOfMeasure: line.unitOfMeasure,
        scrapFactorPercent: line.scrapFactorPercent,
        requiredQuantity,
        reservedQuantity: remainingQuantity,
        consumedQuantity,
        remainingQuantity,
        availableQuantity: requiredQuantity,
        isShortage: false,
      });
    }

    return result;
  }

  async release(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    order.release();
    await this.poRepository.save(order);
    return order;
  }

  async start(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    if (order.status === 'IN_PROGRESS') {
      return order;
    }

    order.start();
    await this.poRepository.save(order);
    return order;
  }

  async recordPartialOutput(
    id: string,
    dto: RecordPartialOutputDto,
  ): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot record production execution on ${order.status} Work Order.`,
      );
    }

    if (order.status !== 'IN_PROGRESS') {
      order.start();
    }

    const bom = await this.bomsService.findOne(order.bomId);

    // Issue proportional raw materials for this partial run
    if (order.locationId) {
      for (const line of bom.lines) {
        const lineGrossQty =
          dto.producedQuantity *
          line.quantityPerUnit *
          (1 + line.scrapFactorPercent / 100);

        await this.inventoryTransactionsService.create({
          transactionType: 'Issue',
          componentId: line.componentId,
          sourceLocationId: order.locationId,
          quantity: Math.round(lineGrossQty * 10000) / 10000,
          unitOfMeasure: line.unitOfMeasure,
          reference: order.productionNumber,
          reason: `Material issue for run (${dto.producedQuantity} units) on Work Order ${order.productionNumber}`,
          createdBy: 'OPERATOR',
        });
      }

      // Receive finished goods output
      await this.inventoryTransactionsService.create({
        transactionType: 'Receipt',
        componentId: order.componentId,
        destinationLocationId: order.locationId,
        quantity: dto.producedQuantity,
        unitOfMeasure: 'pcs',
        reference: order.productionNumber,
        reason: `Partial finished goods output (${dto.producedQuantity} units) for Work Order ${order.productionNumber}`,
        createdBy: 'OPERATOR',
      });

      // Post scrap if recorded
      if (dto.scrappedQuantity && dto.scrappedQuantity > 0) {
        await this.inventoryTransactionsService.create({
          transactionType: 'Issue',
          componentId: order.componentId,
          sourceLocationId: order.locationId,
          quantity: dto.scrappedQuantity,
          unitOfMeasure: 'pcs',
          reference: order.productionNumber,
          reason: `Production scrap recorded (${dto.scrappedQuantity} units) for Work Order ${order.productionNumber}`,
          createdBy: 'OPERATOR',
        });
      }

      await this.inventoryProjectionsService.rebuild();
    }

    order.recordOutput(dto.producedQuantity, dto.scrappedQuantity || 0);
    await this.poRepository.save(order);
    return order;
  }

  async recordScrap(id: string, dto: RecordScrapDto): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      throw new BadRequestException(
        `Cannot record scrap on ${order.status} Work Order.`,
      );
    }

    if (order.locationId) {
      await this.inventoryTransactionsService.create({
        transactionType: 'Issue',
        componentId: dto.componentId,
        sourceLocationId: order.locationId,
        quantity: dto.quantity,
        unitOfMeasure: 'pcs',
        reference: order.productionNumber,
        reason: `Production scrap: ${dto.reason} (Work Order ${order.productionNumber})`,
        createdBy: 'OPERATOR',
      });

      await this.inventoryProjectionsService.rebuild();
    }

    order.addCompletedQuantity(0, dto.quantity);
    await this.poRepository.save(order);
    return order;
  }

  async pause(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    order.pause();
    await this.poRepository.save(order);
    return order;
  }

  async resume(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    order.resume();
    await this.poRepository.save(order);
    return order;
  }

  async complete(
    id: string,
    dto?: CompleteProductionOrderDto,
  ): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    if (order.status === 'COMPLETED') return order;

    const remainingToProduce = dto?.producedQuantity
      ? dto.producedQuantity
      : Math.max(0, order.quantityPlanned - order.quantityCompleted);

    if (remainingToProduce > 0 && order.locationId) {
      const bom = await this.bomsService.findOne(order.bomId);
      for (const line of bom.lines) {
        const lineGrossQty =
          remainingToProduce *
          line.quantityPerUnit *
          (1 + line.scrapFactorPercent / 100);

        await this.inventoryTransactionsService.create({
          transactionType: 'Issue',
          componentId: line.componentId,
          sourceLocationId: order.locationId,
          quantity: Math.round(lineGrossQty * 10000) / 10000,
          unitOfMeasure: line.unitOfMeasure,
          reference: order.productionNumber,
          reason: `Final material issue on completion for Work Order ${order.productionNumber}`,
          createdBy: 'SYSTEM',
        });
      }

      await this.inventoryTransactionsService.create({
        transactionType: 'Receipt',
        componentId: order.componentId,
        destinationLocationId: order.locationId,
        quantity: remainingToProduce,
        unitOfMeasure: 'pcs',
        reference: order.productionNumber,
        reason: `Final finished goods receipt on completion for Work Order ${order.productionNumber}`,
        createdBy: 'SYSTEM',
      });

      await this.inventoryProjectionsService.rebuild();
    }

    order.complete(order.quantityPlanned);
    await this.poRepository.save(order);
    return order;
  }

  async getActivityTimeline(id: string): Promise<ProductionActivityItem[]> {
    const order = await this.findOne(id);
    const orderTxs = await this.inventoryTransactionsService.getAll({
      reference: order.productionNumber,
    });

    const timeline: ProductionActivityItem[] = [
      {
        id: `evt-created-${order.id}`,
        eventType: 'RELEASED',
        title: 'Work Order Created',
        description: `Work order ${order.productionNumber} created for ${order.quantityPlanned} units planned.`,
        timestamp: new Date(order.createdAt).toISOString(),
        createdBy: order.createdBy || 'SYSTEM',
      },
    ];

    if (order.startDate) {
      timeline.push({
        id: `evt-started-${order.id}`,
        eventType: 'STARTED',
        title: 'Production Started',
        description: `Manufacturing job started for Work Order ${order.productionNumber}.`,
        timestamp: new Date(order.startDate).toISOString(),
        createdBy: 'OPERATOR',
      });
    }

    for (const tx of orderTxs) {
      if (tx.transactionType === 'Issue' && tx.reason?.includes('scrap')) {
        timeline.push({
          id: `evt-tx-${tx.id}`,
          eventType: 'SCRAP_RECORDED',
          title: 'Scrap Recorded',
          description: tx.reason,
          quantity: tx.quantity,
          unitOfMeasure: tx.unitOfMeasure,
          timestamp: new Date(tx.createdAt).toISOString(),
          createdBy: tx.createdBy || 'OPERATOR',
        });
      } else if (tx.transactionType === 'Issue') {
        timeline.push({
          id: `evt-tx-${tx.id}`,
          eventType: 'MATERIAL_CONSUMED',
          title: 'Material Consumed',
          description: tx.reason || `Raw material issued`,
          quantity: tx.quantity,
          unitOfMeasure: tx.unitOfMeasure,
          timestamp: new Date(tx.createdAt).toISOString(),
          createdBy: tx.createdBy || 'OPERATOR',
        });
      } else if (tx.transactionType === 'Receipt') {
        timeline.push({
          id: `evt-tx-${tx.id}`,
          eventType: 'OUTPUT_PRODUCED',
          title: 'Finished Goods Produced',
          description: tx.reason || `Finished goods received`,
          quantity: tx.quantity,
          unitOfMeasure: tx.unitOfMeasure,
          timestamp: new Date(tx.createdAt).toISOString(),
          createdBy: tx.createdBy || 'OPERATOR',
        });
      }
    }

    if (order.status === 'COMPLETED' && order.endDate) {
      timeline.push({
        id: `evt-completed-${order.id}`,
        eventType: 'COMPLETED',
        title: 'Production Completed',
        description: `Work Order ${order.productionNumber} successfully completed (${order.quantityCompleted} units total produced).`,
        timestamp: new Date(order.endDate).toISOString(),
        createdBy: 'SYSTEM',
      });
    }

    return timeline.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  async close(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    order.close();
    await this.poRepository.save(order);
    return order;
  }

  async cancel(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    order.cancel();
    await this.poRepository.save(order);
    return order;
  }

  async delete(id: string): Promise<void> {
    const order = await this.findOne(id);
    if (order.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT Work Orders can be deleted.');
    }
    await this.poRepository.delete(id);
  }
}
