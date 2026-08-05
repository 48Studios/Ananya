import { ObjectId } from "@ananya/core";

export type PurchaseInvoiceStatus =
  "DRAFT" | "MATCHED" | "VARIANCE_HOLD" | "APPROVED" | "PAID" | "CANCELLED";

export type ThreeWayMatchStatus =
  "PENDING" | "MATCHED" | "PRICE_VARIANCE" | "QUANTITY_VARIANCE" | "APPROVED";

export interface PurchaseInvoiceLineProps {
  id: string;
  purchaseInvoiceId: string;
  componentId: string;
  quantityBilled: number;
  unitPrice: number;
  lineTotal: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseInvoiceProps {
  id: string;
  invoiceNumber: string;
  vendorInvoiceNumber: string;
  supplierId: string;
  purchaseOrderId: string;
  goodsReceiptId?: string | null;
  status: PurchaseInvoiceStatus;
  matchStatus: ThreeWayMatchStatus;
  totalAmount: number;
  dueDate: Date;
  lines?: PurchaseInvoiceLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePurchaseInvoiceInput {
  invoiceNumber: string;
  vendorInvoiceNumber: string;
  supplierId: string;
  purchaseOrderId: string;
  goodsReceiptId?: string | null;
  dueDate: Date;
}

export interface AddPurchaseInvoiceLineInput {
  componentId: string;
  quantityBilled: number;
  unitPrice: number;
}

export class PurchaseInvoice {
  public readonly id: string;
  public readonly invoiceNumber: string;
  public readonly vendorInvoiceNumber: string;
  public readonly supplierId: string;
  public readonly purchaseOrderId: string;
  public goodsReceiptId?: string | null;
  public status: PurchaseInvoiceStatus;
  public matchStatus: ThreeWayMatchStatus;
  public totalAmount: number;
  public dueDate: Date;
  public readonly lines: PurchaseInvoiceLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: PurchaseInvoiceProps) {
    this.id = props.id;
    this.invoiceNumber = props.invoiceNumber;
    this.vendorInvoiceNumber = props.vendorInvoiceNumber;
    this.supplierId = props.supplierId;
    this.purchaseOrderId = props.purchaseOrderId;
    this.goodsReceiptId = props.goodsReceiptId;
    this.status = props.status;
    this.matchStatus = props.matchStatus;
    this.totalAmount = props.totalAmount;
    this.dueDate = props.dueDate;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreatePurchaseInvoiceInput): PurchaseInvoice {
    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new PurchaseInvoice({
      id,
      invoiceNumber: input.invoiceNumber.trim().toUpperCase(),
      vendorInvoiceNumber: input.vendorInvoiceNumber.trim(),
      supplierId: input.supplierId,
      purchaseOrderId: input.purchaseOrderId,
      goodsReceiptId: input.goodsReceiptId ?? null,
      status: "DRAFT",
      matchStatus: "PENDING",
      totalAmount: 0,
      dueDate: input.dueDate,
      lines: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public addLine(input: AddPurchaseInvoiceLineInput): void {
    const lineId = ObjectId.generate().value;
    const createdAt = new Date();

    const line: PurchaseInvoiceLineProps = {
      id: lineId,
      purchaseInvoiceId: this.id,
      componentId: input.componentId,
      quantityBilled: input.quantityBilled,
      unitPrice: input.unitPrice,
      lineTotal: input.quantityBilled * input.unitPrice,
      createdAt,
      updatedAt: createdAt,
    };

    this.lines.push(line);
    this.recalculateTotal();
  }

  public recalculateTotal(): void {
    this.totalAmount = this.lines.reduce((sum, l) => sum + l.lineTotal, 0);
  }

  public setMatchResult(matched: boolean, reason?: string): void {
    if (matched) {
      this.status = "MATCHED";
      this.matchStatus = "MATCHED";
    } else {
      this.status = "VARIANCE_HOLD";
      this.matchStatus =
        reason === "PRICE" ? "PRICE_VARIANCE" : "QUANTITY_VARIANCE";
    }
    this.updatedAt = new Date();
  }

  public approveForPayment(): void {
    this.status = "APPROVED";
    this.matchStatus = "APPROVED";
    this.updatedAt = new Date();
  }

  public static rehydrate(props: PurchaseInvoiceProps): PurchaseInvoice {
    return new PurchaseInvoice(props);
  }
}
