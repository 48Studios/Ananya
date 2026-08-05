import { ObjectId } from "@ananya/core";
import {
  EmptyPurchaseOrderError,
  InvalidPoLineQuantityError,
  InvalidPoStatusTransitionError,
} from "./purchase-order.errors";

export type PurchaseOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "ISSUED"
  | "PARTIALLY_RECEIVED"
  | "FULFILLED"
  | "CANCELLED";

export interface PurchaseOrderLineProps {
  id: string;
  purchaseOrderId: string;
  componentId: string;
  vendorPartNumber?: string | null;
  unitPrice: number;
  quantityOrdered: number;
  quantityReceived: number;
  taxRate: number;
  lineTotal: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrderProps {
  id: string;
  poNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  notes?: string | null;
  issuedAt?: Date | null;
  expectedDeliveryDate?: Date | null;
  lines?: PurchaseOrderLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePurchaseOrderInput {
  poNumber: string;
  supplierId: string;
  currency?: string;
  notes?: string | null;
  expectedDeliveryDate?: Date | null;
}

export interface UpdatePurchaseOrderInput {
  notes?: string | null;
  expectedDeliveryDate?: Date | null;
}

export interface AddPoLineInput {
  componentId: string;
  vendorPartNumber?: string | null;
  unitPrice: number;
  quantityOrdered: number;
  taxRate?: number;
}

export class PurchaseOrder {
  public readonly id: string;
  public readonly poNumber: string;
  public readonly supplierId: string;
  public status: PurchaseOrderStatus;
  public readonly currency: string;
  public subtotal: number;
  public taxTotal: number;
  public grandTotal: number;
  public notes?: string | null;
  public issuedAt?: Date | null;
  public expectedDeliveryDate?: Date | null;
  public lines: PurchaseOrderLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: PurchaseOrderProps) {
    this.id = props.id;
    this.poNumber = props.poNumber;
    this.supplierId = props.supplierId;
    this.status = props.status;
    this.currency = props.currency;
    this.subtotal = props.subtotal;
    this.taxTotal = props.taxTotal;
    this.grandTotal = props.grandTotal;
    this.notes = props.notes;
    this.issuedAt = props.issuedAt;
    this.expectedDeliveryDate = props.expectedDeliveryDate;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreatePurchaseOrderInput): PurchaseOrder {
    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new PurchaseOrder({
      id,
      poNumber: input.poNumber.trim().toUpperCase(),
      supplierId: input.supplierId,
      status: "DRAFT",
      currency: input.currency?.trim() || "USD",
      subtotal: 0,
      taxTotal: 0,
      grandTotal: 0,
      notes: input.notes?.trim() ?? null,
      expectedDeliveryDate: input.expectedDeliveryDate ?? null,
      lines: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public updateHeader(input: UpdatePurchaseOrderInput): void {
    if (this.status !== "DRAFT") {
      throw new InvalidPoStatusTransitionError(this.status, "EDIT");
    }
    this.notes = input.notes !== undefined ? input.notes : this.notes;
    this.expectedDeliveryDate =
      input.expectedDeliveryDate !== undefined
        ? input.expectedDeliveryDate
        : this.expectedDeliveryDate;
    this.updatedAt = new Date();
  }

  public clearLines(): void {
    if (this.status !== "DRAFT") {
      throw new InvalidPoStatusTransitionError(this.status, "EDIT_LINES");
    }
    this.lines = [];
    this.recalculateTotals();
  }

  public addLine(input: AddPoLineInput): void {
    if (this.status !== "DRAFT") {
      throw new InvalidPoStatusTransitionError(this.status, "EDIT_LINES");
    }
    if (input.quantityOrdered <= 0) {
      throw new InvalidPoLineQuantityError(
        "Quantity ordered must be strictly greater than 0.",
      );
    }

    const lineId = ObjectId.generate().value;
    const taxRate = input.taxRate ?? 0;
    const lineTotal =
      input.unitPrice * input.quantityOrdered * (1 + taxRate / 100);

    const line: PurchaseOrderLineProps = {
      id: lineId,
      purchaseOrderId: this.id,
      componentId: input.componentId,
      vendorPartNumber: input.vendorPartNumber?.trim() ?? null,
      unitPrice: input.unitPrice,
      quantityOrdered: input.quantityOrdered,
      quantityReceived: 0,
      taxRate,
      lineTotal,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.lines.push(line);
    this.recalculateTotals();
  }

  public submit(): void {
    if (this.status !== "DRAFT") {
      throw new InvalidPoStatusTransitionError(this.status, "SUBMITTED");
    }
    if (this.lines.length === 0) {
      throw new EmptyPurchaseOrderError();
    }
    this.status = "SUBMITTED";
    this.updatedAt = new Date();
  }

  public approve(): void {
    if (this.status !== "SUBMITTED") {
      throw new InvalidPoStatusTransitionError(this.status, "APPROVED");
    }
    this.status = "APPROVED";
    this.updatedAt = new Date();
  }

  public issue(): void {
    if (this.status !== "APPROVED") {
      throw new InvalidPoStatusTransitionError(this.status, "ISSUED");
    }
    this.status = "ISSUED";
    this.issuedAt = new Date();
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (
      ["FULFILLED", "CANCELLED", "PARTIALLY_RECEIVED"].includes(this.status)
    ) {
      throw new InvalidPoStatusTransitionError(this.status, "CANCELLED");
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }

  public recalculateTotals(): void {
    let subtotal = 0;
    let taxTotal = 0;

    for (const line of this.lines) {
      const basePrice = line.unitPrice * line.quantityOrdered;
      const tax = basePrice * (line.taxRate / 100);
      subtotal += basePrice;
      taxTotal += tax;
    }

    this.subtotal = subtotal;
    this.taxTotal = taxTotal;
    this.grandTotal = subtotal + taxTotal;
  }

  public static rehydrate(props: PurchaseOrderProps): PurchaseOrder {
    return new PurchaseOrder(props);
  }
}
