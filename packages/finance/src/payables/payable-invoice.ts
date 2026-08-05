import { ObjectId } from "@ananya/core";

export type PayableStatus =
  "DRAFT" | "POSTED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export interface PayableInvoiceProps {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  purchaseInvoiceId: string;
  dueDate: Date;
  amount: number;
  balance: number;
  status: PayableStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePayableInvoiceProps {
  invoiceNumber: string;
  supplierId: string;
  purchaseInvoiceId: string;
  dueDate: Date;
  amount: number;
}

export class PayableInvoice implements PayableInvoiceProps {
  public readonly id: string;
  public invoiceNumber: string;
  public supplierId: string;
  public purchaseInvoiceId: string;
  public dueDate: Date;
  public amount: number;
  public balance: number;
  public status: PayableStatus;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: PayableInvoiceProps) {
    this.id = props.id;
    this.invoiceNumber = props.invoiceNumber;
    this.supplierId = props.supplierId;
    this.purchaseInvoiceId = props.purchaseInvoiceId;
    this.dueDate = props.dueDate;
    this.amount = props.amount;
    this.balance = props.balance;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreatePayableInvoiceProps): PayableInvoice {
    if (props.amount <= 0) {
      throw new Error("Payable invoice amount must be greater than zero");
    }

    const now = new Date();
    return new PayableInvoice({
      id: ObjectId.generate().value,
      invoiceNumber: props.invoiceNumber,
      supplierId: props.supplierId,
      purchaseInvoiceId: props.purchaseInvoiceId,
      dueDate: props.dueDate,
      amount: props.amount,
      balance: props.amount,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: PayableInvoiceProps): PayableInvoice {
    return new PayableInvoice(props);
  }

  public post(): void {
    if (this.status !== "DRAFT") {
      throw new Error(`Cannot post payable invoice in status ${this.status}`);
    }
    this.status = "POSTED";
    this.updatedAt = new Date();
  }

  public applyPayment(paymentAmount: number): void {
    if (this.status !== "POSTED" && this.status !== "PARTIALLY_PAID") {
      throw new Error(
        `Cannot apply payment to payable invoice in status ${this.status}`,
      );
    }
    if (paymentAmount <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }
    if (paymentAmount > this.balance) {
      throw new Error(
        `Payment amount ($${paymentAmount.toFixed(2)}) exceeds remaining balance ($${this.balance.toFixed(2)})`,
      );
    }

    this.balance -= paymentAmount;
    this.status = this.balance === 0 ? "PAID" : "PARTIALLY_PAID";
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === "PAID") {
      throw new Error("Paid payable invoices cannot be cancelled");
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }
}
