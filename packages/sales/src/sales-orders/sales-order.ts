import { ObjectId } from '@ananya/core';

export type SalesOrderStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'RELEASED'
  | 'ALLOCATED'
  | 'PARTIALLY_FULFILLED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface SalesOrderLineProps {
  id: string;
  salesOrderId: string;
  componentId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  totalPrice: number;
  reservedQuantity: number;
  fulfilledQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesOrderProps {
  id: string;
  orderNumber: string;
  customerId: string;
  orderDate: Date;
  requiredDate?: Date | null;
  status: SalesOrderStatus;
  quotationId?: string | null;
  lines?: SalesOrderLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSalesOrderInput {
  orderNumber: string;
  customerId: string;
  orderDate?: Date;
  requiredDate?: Date | null;
  quotationId?: string | null;
}

export interface AddSalesOrderLineInput {
  componentId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
}

export class SalesOrder {
  public readonly id: string;
  public readonly orderNumber: string;
  public readonly customerId: string;
  public orderDate: Date;
  public requiredDate?: Date | null;
  public status: SalesOrderStatus;
  public quotationId?: string | null;
  public readonly lines: SalesOrderLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: SalesOrderProps) {
    this.id = props.id;
    this.orderNumber = props.orderNumber;
    this.customerId = props.customerId;
    this.orderDate = props.orderDate;
    this.requiredDate = props.requiredDate;
    this.status = props.status;
    this.quotationId = props.quotationId;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: CreateSalesOrderInput): SalesOrder {
    const now = new Date();
    return new SalesOrder({
      id: ObjectId.generate().value,
      orderNumber: input.orderNumber.toUpperCase(),
      customerId: input.customerId,
      orderDate: input.orderDate || now,
      requiredDate: input.requiredDate ?? null,
      status: 'DRAFT',
      quotationId: input.quotationId ?? null,
      lines: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: SalesOrderProps): SalesOrder {
    return new SalesOrder(props);
  }

  get totalAmount(): number {
    return this.lines.reduce((sum, l) => sum + l.totalPrice, 0);
  }

  addLine(input: AddSalesOrderLineInput): SalesOrderLineProps {
    if (this.status !== 'DRAFT') {
      throw new Error('Can only add lines to a DRAFT sales order.');
    }
    if (input.quantity <= 0) {
      throw new Error('Sales order line quantity must be greater than zero.');
    }
    if (input.unitPrice < 0) {
      throw new Error('Sales order line unit price cannot be negative.');
    }

    const discount = input.discount || 0;
    const tax = input.tax || 0;
    const subtotal = input.quantity * input.unitPrice * (1 - discount / 100);
    const totalPrice = subtotal * (1 + tax / 100);
    const now = new Date();

    const line: SalesOrderLineProps = {
      id: ObjectId.generate().value,
      salesOrderId: this.id,
      componentId: input.componentId,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      discount,
      tax,
      totalPrice,
      reservedQuantity: 0,
      fulfilledQuantity: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.lines.push(line);
    this.updatedAt = now;
    return line;
  }

  approve(): void {
    if (this.status !== 'DRAFT') {
      throw new Error('Only DRAFT sales orders can be approved.');
    }
    if (this.lines.length === 0) {
      throw new Error('Cannot approve a sales order without line items.');
    }
    this.status = 'APPROVED';
    this.updatedAt = new Date();
  }

  release(): void {
    if (this.status !== 'APPROVED') {
      throw new Error('Only APPROVED sales orders can be released for fulfillment.');
    }
    this.status = 'RELEASED';
    this.updatedAt = new Date();
  }

  updateLineFulfillment(lineId: string, fulfilledQty: number): void {
    const line = this.lines.find((l) => l.id === lineId);
    if (!line) {
      throw new Error(`Sales order line ${lineId} not found.`);
    }
    line.fulfilledQuantity += fulfilledQty;
    line.updatedAt = new Date();

    const allFulfilled = this.lines.every(
      (l) => l.fulfilledQuantity >= l.quantity,
    );
    const anyFulfilled = this.lines.some(
      (l) => l.fulfilledQuantity > 0,
    );

    if (allFulfilled) {
      this.status = 'COMPLETED';
    } else if (anyFulfilled) {
      this.status = 'PARTIALLY_FULFILLED';
    }
    this.updatedAt = new Date();
  }

  cancel(): void {
    if (this.status === 'COMPLETED') {
      throw new Error('Cannot cancel a COMPLETED sales order.');
    }
    this.status = 'CANCELLED';
    this.updatedAt = new Date();
  }
}
