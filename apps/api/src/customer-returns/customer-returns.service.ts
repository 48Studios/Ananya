import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  CustomerReturn,
  CustomerReturnRepository,
  ReturnStatus,
} from '@ananya/sales';
import {
  CreateCustomerReturnDto,
  AddReturnLineDto,
  InspectReturnDto,
} from './dtos';
import { SalesOrdersService } from '../sales-orders/sales-orders.service';
import { InventoryTransactionsService } from '../inventory-transactions/inventory-transactions.service';
import { InventoryProjectionsService } from '../inventory-projections/inventory-projections.service';

export const CUSTOMER_RETURN_REPOSITORY = 'CUSTOMER_RETURN_REPOSITORY';

@Injectable()
export class CustomerReturnsService {
  constructor(
    @Inject(CUSTOMER_RETURN_REPOSITORY)
    private readonly returnRepository: CustomerReturnRepository,
    private readonly salesOrdersService: SalesOrdersService,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
    private readonly inventoryProjectionsService: InventoryProjectionsService,
  ) {}

  async create(dto: CreateCustomerReturnDto): Promise<CustomerReturn> {
    const order = await this.salesOrdersService.findOne(dto.salesOrderId);
    if (order.customerId !== dto.customerId) {
      throw new BadRequestException(
        'Sales Order customer does not match the return customer ID.',
      );
    }
    const returnNumber = await this.returnRepository.generateNextReturnNumber();
    const customerReturn = CustomerReturn.create({
      returnNumber,
      customerId: dto.customerId,
      salesOrderId: dto.salesOrderId,
      notes: dto.notes,
    });
    await this.returnRepository.save(customerReturn);
    return customerReturn;
  }

  async findAll(
    customerId?: string,
    salesOrderId?: string,
    status?: ReturnStatus,
  ): Promise<CustomerReturn[]> {
    return this.returnRepository.findMany({
      customerId,
      salesOrderId,
      status,
    });
  }

  async findOne(id: string): Promise<CustomerReturn> {
    const customerReturn = await this.returnRepository.findById(id);
    if (!customerReturn) {
      throw new NotFoundException(`Customer Return with ID ${id} not found.`);
    }
    return customerReturn;
  }

  async addLine(id: string, dto: AddReturnLineDto): Promise<CustomerReturn> {
    const customerReturn = await this.findOne(id);
    const order = await this.salesOrdersService.findOne(
      customerReturn.salesOrderId,
    );
    const orderLine = order.lines.find((l) => l.id === dto.salesOrderLineId);
    if (!orderLine) {
      throw new BadRequestException(
        `Sales order line ${dto.salesOrderLineId} not found on order.`,
      );
    }
    if (dto.quantity > orderLine.fulfilledQuantity) {
      throw new BadRequestException(
        `Returned quantity (${dto.quantity}) cannot exceed shipped/fulfilled quantity (${orderLine.fulfilledQuantity}).`,
      );
    }

    customerReturn.addLine(dto);
    await this.returnRepository.save(customerReturn);
    return customerReturn;
  }

  async approve(id: string): Promise<CustomerReturn> {
    const customerReturn = await this.findOne(id);
    customerReturn.approve();
    await this.returnRepository.save(customerReturn);
    return customerReturn;
  }

  async receive(id: string): Promise<CustomerReturn> {
    const customerReturn = await this.findOne(id);
    customerReturn.receive();
    await this.returnRepository.save(customerReturn);
    return customerReturn;
  }

  async inspect(id: string, dto: InspectReturnDto): Promise<CustomerReturn> {
    const customerReturn = await this.findOne(id);
    customerReturn.inspect(dto.dispositions);
    await this.returnRepository.save(customerReturn);
    return customerReturn;
  }

  async restock(id: string): Promise<CustomerReturn> {
    const customerReturn = await this.findOne(id);
    if (customerReturn.status !== 'INSPECTED') {
      throw new BadRequestException(
        'Return must be INSPECTED before restocking.',
      );
    }

    // Execute physical stock reinstatement for RESTOCK disposition lines
    for (const line of customerReturn.lines) {
      if (line.disposition === 'RESTOCK') {
        await this.inventoryTransactionsService.create({
          transactionType: 'Adjustment',
          componentId: line.componentId,
          quantity: line.quantity,
          unitOfMeasure: 'pcs',
          reference: customerReturn.returnNumber,
          reason: 'Customer return restock adjustment',
          createdBy: 'SYSTEM',
        });
      }
    }

    customerReturn.restock();
    await this.returnRepository.save(customerReturn);

    // Rebuild inventory projections
    await this.inventoryProjectionsService.rebuild();

    return customerReturn;
  }

  async reject(id: string): Promise<CustomerReturn> {
    const customerReturn = await this.findOne(id);
    customerReturn.reject();
    await this.returnRepository.save(customerReturn);
    return customerReturn;
  }

  async close(id: string): Promise<CustomerReturn> {
    const customerReturn = await this.findOne(id);
    customerReturn.close();
    await this.returnRepository.save(customerReturn);
    return customerReturn;
  }
}
