import { ObjectId } from '@ananya/core';

export type ReturnStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'RECEIVED'
  | 'INSPECTED'
  | 'RESTOCKED'
  | 'REJECTED'
  | 'CLOSED';

export type ReturnReason =
  | 'DEFECTIVE'
  | 'WRONG_ITEM'
  | 'DAMAGED_IN_TRANSIT'
  | 'EXCESS_ORDER';

export type ReturnDisposition = 'RESTOCK' | 'SCRAP' | 'VENDOR_RETURN';

export interface CustomerReturnLineProps {
  id: string;
  customerReturnId: string;
  salesOrderLineId: string;
  componentId: string;
  quantity: number;
  reason: ReturnReason;
  disposition?: ReturnDisposition | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerReturnProps {
  id: string;
  returnNumber: string;
  customerId: string;
  salesOrderId: string;
  status: ReturnStatus;
  notes?: string | null;
  lines?: CustomerReturnLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomerReturnInput {
  returnNumber: string;
  customerId: string;
  salesOrderId: string;
  notes?: string | null;
}

export interface AddReturnLineInput {
  salesOrderLineId: string;
  componentId: string;
  quantity: number;
  reason: ReturnReason;
}

export class CustomerReturn {
  public readonly id: string;
  public readonly returnNumber: string;
  public readonly customerId: string;
  public readonly salesOrderId: string;
  public status: ReturnStatus;
  public notes?: string | null;
  public readonly lines: CustomerReturnLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: CustomerReturnProps) {
    this.id = props.id;
    this.returnNumber = props.returnNumber;
    this.customerId = props.customerId;
    this.salesOrderId = props.salesOrderId;
    this.status = props.status;
    this.notes = props.notes;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: CreateCustomerReturnInput): CustomerReturn {
    const now = new Date();
    return new CustomerReturn({
      id: ObjectId.generate().value,
      returnNumber: input.returnNumber.toUpperCase(),
      customerId: input.customerId,
      salesOrderId: input.salesOrderId,
      status: 'DRAFT',
      notes: input.notes ?? null,
      lines: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: CustomerReturnProps): CustomerReturn {
    return new CustomerReturn(props);
  }

  addLine(input: AddReturnLineInput): CustomerReturnLineProps {
    if (this.status !== 'DRAFT') {
      throw new Error('Can only add lines to DRAFT customer return documents.');
    }
    if (input.quantity <= 0) {
      throw new Error('Return line quantity must be greater than zero.');
    }

    const now = new Date();
    const line: CustomerReturnLineProps = {
      id: ObjectId.generate().value,
      customerReturnId: this.id,
      salesOrderLineId: input.salesOrderLineId,
      componentId: input.componentId,
      quantity: input.quantity,
      reason: input.reason,
      createdAt: now,
      updatedAt: now,
    };
    this.lines.push(line);
    this.updatedAt = now;
    return line;
  }

  approve(): void {
    if (this.status !== 'DRAFT') {
      throw new Error('Only DRAFT return requests can be approved.');
    }
    if (this.lines.length === 0) {
      throw new Error('Cannot approve return without line items.');
    }
    this.status = 'APPROVED';
    this.updatedAt = new Date();
  }

  receive(): void {
    if (this.status !== 'APPROVED') {
      throw new Error('Only APPROVED return requests can be received by Warehouse.');
    }
    this.status = 'RECEIVED';
    this.updatedAt = new Date();
  }

  inspect(dispositions: Record<string, ReturnDisposition>): void {
    if (this.status !== 'RECEIVED') {
      throw new Error('Only RECEIVED returns can be inspected.');
    }
    this.lines.forEach((l) => {
      if (dispositions[l.id]) {
        l.disposition = dispositions[l.id];
        l.updatedAt = new Date();
      }
    });
    this.status = 'INSPECTED';
    this.updatedAt = new Date();
  }

  restock(): void {
    if (this.status !== 'INSPECTED') {
      throw new Error('Only INSPECTED returns can be restocked.');
    }
    this.status = 'RESTOCKED';
    this.updatedAt = new Date();
  }

  reject(): void {
    if (this.status !== 'INSPECTED' && this.status !== 'RECEIVED') {
      throw new Error('Return cannot be rejected in current state.');
    }
    this.status = 'REJECTED';
    this.updatedAt = new Date();
  }

  close(): void {
    if (
      this.status !== 'RESTOCKED' &&
      this.status !== 'REJECTED'
    ) {
      throw new Error('Return must be RESTOCKED or REJECTED before closing.');
    }
    this.status = 'CLOSED';
    this.updatedAt = new Date();
  }
}
