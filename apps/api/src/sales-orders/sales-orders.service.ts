import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  SalesOrder,
  SalesOrderRepository,
  SalesOrderStatus,
} from '@ananya/sales';
import {
  CreateSalesOrderDto,
  ConvertQuotationDto,
  AddSalesOrderLineDto,
} from './dtos';
import { CustomersService } from '../customers/customers.service';
import { QuotationsService } from '../quotations/quotations.service';

export const SALES_ORDER_REPOSITORY = 'SALES_ORDER_REPOSITORY';

@Injectable()
export class SalesOrdersService {
  constructor(
    @Inject(SALES_ORDER_REPOSITORY)
    private readonly salesOrderRepository: SalesOrderRepository,
    private readonly customersService: CustomersService,
    private readonly quotationsService: QuotationsService,
  ) {}

  async create(dto: CreateSalesOrderDto): Promise<SalesOrder> {
    const customer = await this.customersService.findOne(dto.customerId);
    if (customer.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Customer ${customer.name} is not ACTIVE. Cannot create sales order.`,
      );
    }
    const orderNumber =
      await this.salesOrderRepository.generateNextOrderNumber();
    const order = SalesOrder.create({
      orderNumber,
      customerId: dto.customerId,
      orderDate: dto.orderDate ? new Date(dto.orderDate) : undefined,
      requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
      quotationId: dto.quotationId,
    });
    await this.salesOrderRepository.save(order);
    return order;
  }

  async convertFromQuotation(dto: ConvertQuotationDto): Promise<SalesOrder> {
    const quotation = await this.quotationsService.findOne(dto.quotationId);
    if (quotation.status !== 'ACCEPTED') {
      throw new BadRequestException(
        'Only ACCEPTED quotations can be converted into Sales Orders.',
      );
    }

    const orderNumber =
      await this.salesOrderRepository.generateNextOrderNumber();
    const order = SalesOrder.create({
      orderNumber,
      customerId: quotation.customerId,
      quotationId: quotation.id,
      requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
    });

    for (const line of quotation.lines) {
      order.addLine({
        componentId: line.componentId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
      });
    }

    await this.salesOrderRepository.save(order);
    return order;
  }

  async findAll(
    customerId?: string,
    status?: SalesOrderStatus,
  ): Promise<SalesOrder[]> {
    return this.salesOrderRepository.findMany({ customerId, status });
  }

  async findOne(id: string): Promise<SalesOrder> {
    const order = await this.salesOrderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Sales Order with ID ${id} not found.`);
    }
    return order;
  }

  async addLine(id: string, dto: AddSalesOrderLineDto): Promise<SalesOrder> {
    const order = await this.findOne(id);
    order.addLine(dto);
    await this.salesOrderRepository.save(order);
    return order;
  }

  async approve(id: string): Promise<SalesOrder> {
    const order = await this.findOne(id);
    order.approve();
    await this.salesOrderRepository.save(order);
    return order;
  }

  async release(id: string): Promise<SalesOrder> {
    const order = await this.findOne(id);
    order.release();
    await this.salesOrderRepository.save(order);
    return order;
  }

  async updateLineFulfillment(
    orderId: string,
    lineId: string,
    fulfilledQuantity: number,
  ): Promise<SalesOrder> {
    const order = await this.findOne(orderId);
    order.updateLineFulfillment(lineId, fulfilledQuantity);
    await this.salesOrderRepository.save(order);
    return order;
  }

  async cancel(id: string): Promise<SalesOrder> {
    const order = await this.findOne(id);
    order.cancel();
    await this.salesOrderRepository.save(order);
    return order;
  }
}
