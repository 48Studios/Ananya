import { ObjectId } from "@ananya/core";

export type QuotationStatus =
  "DRAFT" | "SENT" | "ACCEPTED" | "EXPIRED" | "CANCELLED";

export interface QuotationLineProps {
  id: string;
  quotationId: string;
  componentId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuotationProps {
  id: string;
  quoteNumber: string;
  customerId: string;
  currency: string;
  validUntil: Date;
  status: QuotationStatus;
  lines?: QuotationLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateQuotationInput {
  quoteNumber: string;
  customerId: string;
  currency?: string;
  validUntil?: Date;
}

export interface AddQuotationLineInput {
  componentId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export class Quotation {
  public readonly id: string;
  public readonly quoteNumber: string;
  public readonly customerId: string;
  public currency: string;
  public validUntil: Date;
  public status: QuotationStatus;
  public readonly lines: QuotationLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: QuotationProps) {
    this.id = props.id;
    this.quoteNumber = props.quoteNumber;
    this.customerId = props.customerId;
    this.currency = props.currency;
    this.validUntil = props.validUntil;
    this.status = props.status;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: CreateQuotationInput): Quotation {
    const now = new Date();
    const defaultValidUntil = new Date();
    defaultValidUntil.setDate(defaultValidUntil.getDate() + 30);

    return new Quotation({
      id: ObjectId.generate().value,
      quoteNumber: input.quoteNumber.toUpperCase(),
      customerId: input.customerId,
      currency: input.currency || "USD",
      validUntil: input.validUntil || defaultValidUntil,
      status: "DRAFT",
      lines: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: QuotationProps): Quotation {
    return new Quotation(props);
  }

  get totalAmount(): number {
    return this.lines.reduce((sum, l) => sum + l.totalPrice, 0);
  }

  addLine(input: AddQuotationLineInput): QuotationLineProps {
    if (this.status !== "DRAFT") {
      throw new Error("Can only add line items to a DRAFT quotation.");
    }
    if (input.quantity <= 0) {
      throw new Error("Quotation line quantity must be greater than zero.");
    }
    if (input.unitPrice < 0) {
      throw new Error("Quotation line unit price cannot be negative.");
    }

    const discount = input.discount || 0;
    const totalPrice = input.quantity * input.unitPrice * (1 - discount / 100);
    const now = new Date();

    const line: QuotationLineProps = {
      id: ObjectId.generate().value,
      quotationId: this.id,
      componentId: input.componentId,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      discount,
      totalPrice,
      createdAt: now,
      updatedAt: now,
    };

    this.lines.push(line);
    this.updatedAt = now;
    return line;
  }

  send(): void {
    if (this.status !== "DRAFT") {
      throw new Error("Only DRAFT quotations can be sent.");
    }
    if (this.lines.length === 0) {
      throw new Error("Cannot send a quotation without line items.");
    }
    this.status = "SENT";
    this.updatedAt = new Date();
  }

  accept(): void {
    if (this.status !== "SENT") {
      throw new Error("Only SENT quotations can be accepted.");
    }
    if (new Date() > this.validUntil) {
      this.status = "EXPIRED";
      this.updatedAt = new Date();
      throw new Error("Quotation has expired and cannot be accepted.");
    }
    this.status = "ACCEPTED";
    this.updatedAt = new Date();
  }

  cancel(): void {
    if (this.status === "ACCEPTED") {
      throw new Error("Cannot cancel an ACCEPTED quotation.");
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }
}
