import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  FulfillmentRequest,
  FulfillmentRequestRepository,
  FulfillmentStatus,
} from '@ananya/sales';
import {
  CreateFulfillmentRequestDto,
  AddFulfillmentLineDto,
  ShipFulfillmentRequestDto,
} from './dtos';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const FULFILLMENT_REQUEST_REPOSITORY = 'FULFILLMENT_REQUEST_REPOSITORY';

@Injectable()
export class FulfillmentRequestsService {
  constructor(
    @Inject(FULFILLMENT_REQUEST_REPOSITORY)
    private readonly fulfillmentRepository: FulfillmentRequestRepository,
    private readonly salesOrdersService: SalesOrdersService,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateFulfillmentRequestDto): Promise<FulfillmentRequest> {
    const order = await this.salesOrdersService.findOne(dto.salesOrderId);
    if (order.status !== 'RELEASED' && order.status !== 'APPROVED') {
      throw new BadRequestException(
        `Sales order ${order.orderNumber} must be RELEASED or APPROVED before generating fulfillment requests.`,
      );
    }
    const requestNumber =
      await this.fulfillmentRepository.generateNextRequestNumber();
    const request = FulfillmentRequest.create({
      requestNumber,
      salesOrderId: dto.salesOrderId,
      warehouseId: dto.warehouseId,
    });

    // Auto-populate lines from Sales Order lines if not specified
    for (const line of order.lines) {
      const unfulfilled = line.quantity - line.fulfilledQuantity;
      if (unfulfilled > 0) {
        request.addLine({
          salesOrderLineId: line.id,
          componentId: line.componentId,
          requestedQuantity: unfulfilled,
        });
      }
    }

    await this.fulfillmentRepository.save(request);
    return request;
  }

  async findAll(
    salesOrderId?: string,
    warehouseId?: string,
    status?: FulfillmentStatus,
  ): Promise<FulfillmentRequest[]> {
    return this.fulfillmentRepository.findMany({
      salesOrderId,
      warehouseId,
      status,
    });
  }

  async findOne(id: string): Promise<FulfillmentRequest> {
    const request = await this.fulfillmentRepository.findById(id);
    if (!request) {
      throw new NotFoundException(
        `Fulfillment Request with ID ${id} not found.`,
      );
    }
    return request;
  }

  async addLine(
    id: string,
    dto: AddFulfillmentLineDto,
  ): Promise<FulfillmentRequest> {
    const request = await this.findOne(id);
    request.addLine(dto);
    await this.fulfillmentRepository.save(request);
    return request;
  }

  async accept(id: string): Promise<FulfillmentRequest> {
    const request = await this.findOne(id);
    request.accept();
    await this.fulfillmentRepository.save(request);
    return request;
  }

  async startPicking(id: string): Promise<FulfillmentRequest> {
    const request = await this.findOne(id);
    request.startPicking();
    await this.fulfillmentRepository.save(request);
    return request;
  }

  async pack(id: string): Promise<FulfillmentRequest> {
    const request = await this.findOne(id);
    request.pack();
    await this.fulfillmentRepository.save(request);
    return request;
  }

  async ship(
    id: string,
    dto: ShipFulfillmentRequestDto,
  ): Promise<FulfillmentRequest> {
    const request = await this.findOne(id);
    request.ship(dto.carrierName, dto.trackingNumber);
    await this.fulfillmentRepository.save(request);
    return request;
  }

  async complete(id: string): Promise<FulfillmentRequest> {
    const request = await this.findOne(id);
    if (request.status !== 'SHIPPED') {
      throw new BadRequestException(
        'Fulfillment Request must be SHIPPED before completing delivery.',
      );
    }

    // Execute physical stock deduction via Inventory Application Service
    for (const line of request.lines) {
      await this.inventoryTransactionsService.create({
        transactionType: 'Issue',
        componentId: line.componentId,
        sourceLocationId: request.warehouseId,
        quantity: line.requestedQuantity,
        unitOfMeasure: 'pcs',
        reference: request.requestNumber,
        reason: 'Sales order fulfillment dispatch',
        createdBy: 'SYSTEM',
      });

      // Update Sales Order line fulfillment balance
      await this.salesOrdersService.updateLineFulfillment(
        request.salesOrderId,
        line.salesOrderLineId,
        line.requestedQuantity,
      );
    }

    // Mark fulfillment request complete
    request.complete();
    await this.fulfillmentRepository.save(request);

    // Rebuild inventory projections
    await this.inventoryProjectionsService.rebuild();

    return request;
  }

  async cancel(id: string): Promise<FulfillmentRequest> {
    const request = await this.findOne(id);
    request.cancel();
    await this.fulfillmentRepository.save(request);
    return request;
  }
}
