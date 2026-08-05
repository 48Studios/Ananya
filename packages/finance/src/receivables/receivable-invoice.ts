import { ObjectId } from "@ananya/core";

export type InvoiceStatus =
  "DRAFT" | "POSTED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export interface ReceivableInvoiceProps {
  id: string;
  invoiceNumber: string;
  customerId: string;
  salesOrderId: string;
  dueDate: Date;
  amount: number;
  balance: number;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReceivableInvoiceProps {
  invoiceNumber: string;
  customerId: string;
  salesOrderId: string;
  dueDate: Date;
  amount: number;
}

export class ReceivableInvoice implements ReceivableInvoiceProps {
  public readonly id: string;
  public invoiceNumber: string;
  public customerId: string;
  public salesOrderId: string;
  public dueDate: Date;
  public amount: number;
  public balance: number;
  public status: InvoiceStatus;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: ReceivableInvoiceProps) {
    this.id = props.id;
    this.invoiceNumber = props.invoiceNumber;
    this.customerId = props.customerId;
    this.salesOrderId = props.salesOrderId;
    this.dueDate = props.dueDate;
    this.amount = props.amount;
    this.balance = props.balance;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateReceivableInvoiceProps): ReceivableInvoice {
    if (props.amount <= 0) {
      throw new Error("Receivable invoice amount must be greater than zero");
    }

    const now = new Date();
    return new ReceivableInvoice({
      id: ObjectId.generate().value,
      invoiceNumber: props.invoiceNumber,
      customerId: props.customerId,
      salesOrderId: props.salesOrderId,
      dueDate: props.dueDate,
      amount: props.amount,
      balance: props.amount,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: ReceivableInvoiceProps): ReceivableInvoice {
    return new ReceivableInvoice(props);
  }

  public post(): void {
    if (this.status !== "DRAFT") {
      throw new Error(`Cannot post invoice in status ${this.status}`);
    }
    this.status = "POSTED";
    this.updatedAt = new Date();
  }

  public applyPayment(paymentAmount: number): void {
    if (this.status !== "POSTED" && this.status !== "PARTIALLY_PAID") {
      throw new Error(
        `Cannot apply payment to invoice in status ${this.status}`,
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
      throw new Error("Paid receivable invoices cannot be cancelled");
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }
}
