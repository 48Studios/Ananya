import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  SupplierReturn,
  SupplierReturnRepository,
  SupplierReturnStatus,
} from '@ananya/procurement';
import {
  CreateSupplierReturnDto,
  UpdateSupplierReturnDto,
  UpdateSupplierReturnStatusDto,
  AddSupplierReturnLineDto,
} from './dtos';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const SUPPLIER_RETURN_REPOSITORY = 'SUPPLIER_RETURN_REPOSITORY';

@Injectable()
export class SupplierReturnsService {
  constructor(
    @Inject(SUPPLIER_RETURN_REPOSITORY)
    private readonly returnRepository: SupplierReturnRepository,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateSupplierReturnDto): Promise<SupplierReturn> {
    const returnNumber = await this.returnRepository.generateNextReturnNumber();
    const returnDoc = SupplierReturn.create({
      returnNumber,
      supplierId: dto.supplierId,
      purchaseOrderId: dto.purchaseOrderId,
      rmaNumber: dto.rmaNumber,
    });
    await this.returnRepository.save(returnDoc);
    return returnDoc;
  }

  async findAll(
    supplierId?: string,
    status?: string,
  ): Promise<SupplierReturn[]> {
    return this.returnRepository.findMany({ supplierId, status });
  }

  async findOne(id: string): Promise<SupplierReturn> {
    const returnDoc = await this.returnRepository.findById(id);
    if (!returnDoc) {
      throw new NotFoundException(`Supplier Return with ID ${id} not found.`);
    }
    return returnDoc;
  }

  async update(
    id: string,
    dto: UpdateSupplierReturnDto,
  ): Promise<SupplierReturn> {
    const returnDoc = await this.findOne(id);
    if (returnDoc.status !== 'DRAFT') {
      throw new BadRequestException(
        'Can only modify details of a DRAFT return.',
      );
    }
    returnDoc.updateDetails(dto);
    await this.returnRepository.save(returnDoc);
    return returnDoc;
  }

  async delete(id: string): Promise<void> {
    const returnDoc = await this.findOne(id);
    if (returnDoc.status !== 'DRAFT' && returnDoc.status !== 'CANCELLED') {
      throw new BadRequestException(
        'Can only delete DRAFT or CANCELLED returns.',
      );
    }
    await this.returnRepository.delete(id);
  }

  async addLine(
    id: string,
    dto: AddSupplierReturnLineDto,
  ): Promise<SupplierReturn> {
    const returnDoc = await this.findOne(id);
    if (returnDoc.status !== 'DRAFT') {
      throw new BadRequestException('Cannot modify lines of non-DRAFT return.');
    }

    // Verify stock availability at selected location
    const projection =
      await this.inventoryProjectionsService.getByComponentAndLocation(
        dto.componentId,
        dto.locationId,
      );
    const available = projection ? projection.quantity : 0;
    if (dto.quantityReturned > available) {
      throw new BadRequestException(
        `Insufficient stock at the selected location. Available: ${available}, requested: ${dto.quantityReturned}`,
      );
    }

    returnDoc.addLine(dto);
    await this.returnRepository.save(returnDoc);
    return returnDoc;
  }

  async removeLine(id: string, lineId: string): Promise<SupplierReturn> {
    const returnDoc = await this.findOne(id);
    if (returnDoc.status !== 'DRAFT') {
      throw new BadRequestException('Cannot modify lines of non-DRAFT return.');
    }
    returnDoc.removeLine(lineId);
    await this.returnRepository.deleteLine(lineId);
    await this.returnRepository.save(returnDoc);
    return returnDoc;
  }

  async approve(id: string, rmaNumber?: string): Promise<SupplierReturn> {
    const returnDoc = await this.findOne(id);
    returnDoc.approve(rmaNumber);
    await this.returnRepository.save(returnDoc);
    return returnDoc;
  }

  async dispatch(id: string): Promise<SupplierReturn> {
    const returnDoc = await this.findOne(id);
    if (returnDoc.status !== 'APPROVED') {
      throw new BadRequestException(
        'Supplier Return must be APPROVED before dispatch.',
      );
    }

    if (!returnDoc.lines || returnDoc.lines.length === 0) {
      throw new BadRequestException(
        'Cannot dispatch a return with no line items. Please add at least one line item first.',
      );
    }

    // Verify stock availability across all lines before issuing
    for (const line of returnDoc.lines) {
      const projection =
        await this.inventoryProjectionsService.getByComponentAndLocation(
          line.componentId,
          line.locationId,
        );
      const available = projection ? projection.quantity : 0;
      if (line.quantityReturned > available) {
        throw new BadRequestException(
          `Insufficient stock to return component ${line.componentId} from location ${line.locationId}. Available: ${available}, required: ${line.quantityReturned}`,
        );
      }
    }

    // 1. Log inventory ISSUE transactions for each line
    for (const line of returnDoc.lines) {
      await this.inventoryTransactionsService.create({
        transactionType: 'Issue',
        componentId: line.componentId,
        sourceLocationId: line.locationId,
        quantity: line.quantityReturned,
        unitOfMeasure: 'pcs',
        reference: returnDoc.returnNumber,
        reason: `Supplier Return dispatch (RMA: ${returnDoc.rmaNumber ?? 'N/A'})`,
        createdBy: 'SYSTEM',
        createdAt: new Date(),
      });
    }

    // 2. Mark dispatched
    returnDoc.dispatch();
    await this.returnRepository.save(returnDoc);

    // 3. Rebuild inventory stock projections
    await this.inventoryProjectionsService.rebuild();

    return returnDoc;
  }

  async complete(id: string): Promise<SupplierReturn> {
    const returnDoc = await this.findOne(id);
    if (returnDoc.status === 'COMPLETED') {
      return returnDoc;
    }
    if (returnDoc.status === 'DRAFT') {
      returnDoc.approve();
      await this.returnRepository.save(returnDoc);
    }
    if (returnDoc.status === 'APPROVED') {
      await this.dispatch(id);
    }
    const updated = await this.findOne(id);
    updated.complete();
    await this.returnRepository.save(updated);
    return updated;
  }

  async cancel(id: string): Promise<SupplierReturn> {
    const returnDoc = await this.findOne(id);
    if (returnDoc.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel a completed return.');
    }
    if (returnDoc.status === 'DISPATCHED') {
      // Restore stock that was issued during dispatch
      for (const line of returnDoc.lines) {
        await this.inventoryTransactionsService.create({
          transactionType: 'Receipt',
          componentId: line.componentId,
          destinationLocationId: line.locationId,
          quantity: line.quantityReturned,
          unitOfMeasure: 'pcs',
          reference: returnDoc.returnNumber,
          reason: `Supplier Return cancellation restoration (RMA: ${returnDoc.rmaNumber ?? 'N/A'})`,
          createdBy: 'SYSTEM',
          createdAt: new Date(),
        });
      }
      await this.inventoryProjectionsService.rebuild();
    }
    returnDoc.cancel();
    await this.returnRepository.save(returnDoc);
    return returnDoc;
  }

  async updateStatus(
    id: string,
    dto: UpdateSupplierReturnStatusDto,
  ): Promise<SupplierReturn> {
    const targetStatus = dto.status.toUpperCase();
    switch (targetStatus) {
      case 'DRAFT': {
        const returnDoc = await this.findOne(id);
        if (
          returnDoc.status === 'DISPATCHED' ||
          returnDoc.status === 'COMPLETED'
        ) {
          throw new BadRequestException(
            'Cannot revert dispatched or completed return to draft.',
          );
        }
        returnDoc.status = 'DRAFT' as SupplierReturnStatus;
        await this.returnRepository.save(returnDoc);
        return returnDoc;
      }
      case 'APPROVED':
        return this.approve(id, dto.rmaNumber);
      case 'DISPATCHED':
        return this.dispatch(id);
      case 'COMPLETED':
      case 'CREDITED':
        return this.complete(id);
      case 'CANCELLED':
        return this.cancel(id);
      default:
        throw new BadRequestException(`Invalid status: ${dto.status}`);
    }
  }
}
