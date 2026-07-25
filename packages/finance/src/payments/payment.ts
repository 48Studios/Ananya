import { ObjectId } from '@ananya/core';

export type PaymentType =
  | 'CUSTOMER_PAYMENT'
  | 'SUPPLIER_PAYMENT'
  | 'INTERNAL_TRANSFER'
  | 'REFUND';

export type PaymentMethod =
  | 'WIRE_TRANSFER'
  | 'CHECK'
  | 'CREDIT_CARD'
  | 'CASH'
  | 'ACH';

export type PaymentStatus = 'DRAFT' | 'POSTED' | 'RECONCILED' | 'CANCELLED';

export interface PaymentProps {
  id: string;
  paymentNumber: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  amount: number;
  reference?: string;
  bankAccountId?: string;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentProps {
  paymentNumber: string;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  amount: number;
  reference?: string;
  bankAccountId?: string;
}

export class Payment implements PaymentProps {
  public readonly id: string;
  public paymentNumber: string;
  public paymentType: PaymentType;
  public paymentMethod: PaymentMethod;
  public amount: number;
  public reference?: string;
  public bankAccountId?: string;
  public status: PaymentStatus;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: PaymentProps) {
    this.id = props.id;
    this.paymentNumber = props.paymentNumber;
    this.paymentType = props.paymentType;
    this.paymentMethod = props.paymentMethod;
    this.amount = props.amount;
    this.reference = props.reference;
    this.bankAccountId = props.bankAccountId;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreatePaymentProps): Payment {
    if (props.amount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }

    const now = new Date();
    return new Payment({
      id: ObjectId.generate().value,
      paymentNumber: props.paymentNumber,
      paymentType: props.paymentType,
      paymentMethod: props.paymentMethod,
      amount: props.amount,
      reference: props.reference,
      bankAccountId: props.bankAccountId,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: PaymentProps): Payment {
    return new Payment(props);
  }

  public post(): void {
    if (this.status !== 'DRAFT') {
      throw new Error(`Cannot post payment in status ${this.status}`);
    }
    this.status = 'POSTED';
    this.updatedAt = new Date();
  }

  public markReconciled(): void {
    if (this.status !== 'POSTED') {
      throw new Error(`Only POSTED payments can be marked reconciled`);
    }
    this.status = 'RECONCILED';
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === 'RECONCILED') {
      throw new Error('Reconciled payments cannot be cancelled');
    }
    this.status = 'CANCELLED';
    this.updatedAt = new Date();
  }
}
