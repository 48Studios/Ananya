import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  PurchaseOrder,
  PurchaseOrderRepository,
  PurchaseOrderStatus,
  CreatePurchaseOrder,
  UpdatePurchaseOrder,
  DeletePurchaseOrder,
} from '@ananya/procurement';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  AddPoLineDto,
} from './dtos';

export const PURCHASE_ORDER_REPOSITORY = 'PURCHASE_ORDER_REPOSITORY';

@Injectable()
export class PurchaseOrdersService {
  private readonly createPo: CreatePurchaseOrder;
  private readonly updatePo: UpdatePurchaseOrder;
  private readonly deletePo: DeletePurchaseOrder;

  constructor(
    @Inject(PURCHASE_ORDER_REPOSITORY)
    private readonly poRepository: PurchaseOrderRepository,
  ) {
    this.createPo = new CreatePurchaseOrder(poRepository);
    this.updatePo = new UpdatePurchaseOrder(poRepository);
    this.deletePo = new DeletePurchaseOrder(poRepository);
  }

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    return this.createPo.execute({
      poNumber: '',
      supplierId: dto.supplierId,
      currency: dto.currency,
      notes: dto.notes,
      expectedDeliveryDate: dto.expectedDeliveryDate
        ? new Date(dto.expectedDeliveryDate)
        : null,
      lines: dto.lines,
    });
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrder> {
    return this.updatePo.execute(id, {
      notes: dto.notes,
      expectedDeliveryDate: dto.expectedDeliveryDate
        ? new Date(dto.expectedDeliveryDate)
        : undefined,
      lines: dto.lines,
    });
  }

  async delete(id: string): Promise<void> {
    return this.deletePo.execute(id);
  }

  async findAll(
    supplierId?: string,
    status?: PurchaseOrderStatus,
    search?: string,
  ): Promise<PurchaseOrder[]> {
    return this.poRepository.findMany({ supplierId, status, search });
  }

  async findOne(id: string): Promise<PurchaseOrder> {
    const po = await this.poRepository.findById(id);
    if (!po) {
      throw new NotFoundException(`Purchase Order with ID ${id} not found.`);
    }
    return po;
  }

  async addLine(poId: string, dto: AddPoLineDto): Promise<PurchaseOrder> {
    const po = await this.findOne(poId);
    po.addLine(dto);
    await this.poRepository.save(po);
    return po;
  }

  async submit(id: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    po.submit();
    await this.poRepository.save(po);
    return po;
  }

  async approve(id: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    po.approve();
    await this.poRepository.save(po);
    return po;
  }

  async issue(id: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    po.issue();
    await this.poRepository.save(po);
    return po;
  }

  async cancel(id: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    po.cancel();
    await this.poRepository.save(po);
    return po;
  }
}
