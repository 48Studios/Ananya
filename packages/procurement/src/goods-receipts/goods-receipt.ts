import { ObjectId } from "@ananya/core";
import {
  InvalidGoodsReceiptStatusError,
  InvalidReceivingQuantityError,
} from "./goods-receipt.errors";

export type GoodsReceiptStatus = "DRAFT" | "COMPLETED" | "CANCELLED";

export interface GoodsReceiptLineProps {
  id: string;
  goodsReceiptId: string;
  poLineId: string;
  componentId: string;
  locationId: string;
  quantityReceived: number;
  quantityRejected: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  serialNumbers: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GoodsReceiptProps {
  id: string;
  grNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  status: GoodsReceiptStatus;
  packingSlipNumber?: string | null;
  receivedAt: Date;
  lines?: GoodsReceiptLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGoodsReceiptInput {
  grNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  packingSlipNumber?: string | null;
  receivedAt?: Date;
}

export interface AddGoodsReceiptLineInput {
  poLineId: string;
  componentId: string;
  locationId: string;
  quantityReceived: number;
  quantityRejected?: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  serialNumbers?: string[];
}

export class GoodsReceipt {
  public readonly id: string;
  public readonly grNumber: string;
  public readonly purchaseOrderId: string;
  public readonly supplierId: string;
  public status: GoodsReceiptStatus;
  public packingSlipNumber?: string | null;
  public receivedAt: Date;
  public readonly lines: GoodsReceiptLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: GoodsReceiptProps) {
    this.id = props.id;
    this.grNumber = props.grNumber;
    this.purchaseOrderId = props.purchaseOrderId;
    this.supplierId = props.supplierId;
    this.status = props.status;
    this.packingSlipNumber = props.packingSlipNumber;
    this.receivedAt = props.receivedAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateGoodsReceiptInput): GoodsReceipt {
    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new GoodsReceipt({
      id,
      grNumber: input.grNumber.trim().toUpperCase(),
      purchaseOrderId: input.purchaseOrderId,
      supplierId: input.supplierId,
      status: "DRAFT",
      packingSlipNumber: input.packingSlipNumber?.trim() ?? null,
      receivedAt: input.receivedAt ?? new Date(),
      lines: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public addLine(input: AddGoodsReceiptLineInput): void {
    if (this.status !== "DRAFT") {
      throw new InvalidGoodsReceiptStatusError(
        "Cannot add lines to a non-DRAFT Goods Receipt.",
      );
    }
    if (input.quantityReceived <= 0) {
      throw new InvalidReceivingQuantityError(
        "Quantity received must be greater than 0.",
      );
    }

    const lineId = ObjectId.generate().value;
    const createdAt = new Date();

    const line: GoodsReceiptLineProps = {
      id: lineId,
      goodsReceiptId: this.id,
      poLineId: input.poLineId,
      componentId: input.componentId,
      locationId: input.locationId,
      quantityReceived: input.quantityReceived,
      quantityRejected: input.quantityRejected ?? 0,
      batchNumber: input.batchNumber?.trim() ?? null,
      expiryDate: input.expiryDate ?? null,
      serialNumbers: input.serialNumbers ?? [],
      createdAt,
      updatedAt: createdAt,
    };

    this.lines.push(line);
  }

  public markCompleted(): void {
    if (this.status !== "DRAFT") {
      throw new InvalidGoodsReceiptStatusError(
        "Goods Receipt is already processed.",
      );
    }
    this.status = "COMPLETED";
    this.updatedAt = new Date();
  }

  public static rehydrate(props: GoodsReceiptProps): GoodsReceipt {
    return new GoodsReceipt(props);
  }
}
