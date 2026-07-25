import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  ProductionOrder,
  ProductionOrderRepository,
  ProductionOrderStatus,
} from '@ananya/manufacturing';
import { CreateProductionOrderDto } from './dtos';

export const PRODUCTION_ORDER_REPOSITORY = 'PRODUCTION_ORDER_REPOSITORY';

@Injectable()
export class ProductionOrdersService {
  constructor(
    @Inject(PRODUCTION_ORDER_REPOSITORY)
    private readonly poRepository: ProductionOrderRepository,
  ) {}

  async create(dto: CreateProductionOrderDto): Promise<ProductionOrder> {
    const productionNumber =
      await this.poRepository.generateNextProductionNumber();
    const order = ProductionOrder.create({
      productionNumber,
      bomId: dto.bomId,
      componentId: dto.componentId,
      quantityPlanned: dto.quantityPlanned,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
    });
    await this.poRepository.save(order);
    return order;
  }

  async findAll(
    componentId?: string,
    bomId?: string,
    status?: ProductionOrderStatus,
  ): Promise<ProductionOrder[]> {
    return this.poRepository.findMany({ componentId, bomId, status });
  }

  async findOne(id: string): Promise<ProductionOrder> {
    const order = await this.poRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Production Order with ID ${id} not found.`);
    }
    return order;
  }

  async release(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    order.release();
    await this.poRepository.save(order);
    return order;
  }

  async start(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    order.start();
    await this.poRepository.save(order);
    return order;
  }

  async complete(id: string): Promise<ProductionOrder> {
    const order = await this.findOne(id);
    order.complete();
    await this.poRepository.save(order);
    return order;
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
}
