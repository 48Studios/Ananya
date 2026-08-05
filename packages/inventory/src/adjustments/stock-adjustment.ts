import { ObjectId } from "@ananya/core";
import {
  InvalidAdjustmentStatusError,
  EmptyStockAdjustmentError,
  NegativeCountedQuantityError,
} from "./stock-adjustment.errors";

export type StockAdjustmentStatus = "PENDING" | "APPROVED" | "CANCELLED";

export interface StockAdjustmentLineProps {
  id: string;
  stockAdjustmentId: string;
  componentId: string;
  currentQuantity: number;
  countedQuantity: number;
  difference: number;
  unitOfMeasure: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockAdjustmentProps {
  id: string;
  adjustmentNumber: string;
  locationId: string;
  status: StockAdjustmentStatus;
  reason: string;
  notes?: string | null;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  lines?: StockAdjustmentLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStockAdjustmentInput {
  adjustmentNumber: string;
  locationId: string;
  reason: string;
  notes?: string | null;
  createdBy: string;
  lines: Array<{
    componentId: string;
    currentQuantity: number;
    countedQuantity: number;
    unitOfMeasure?: string;
  }>;
}

export class StockAdjustment {
  public readonly id: string;
  public readonly adjustmentNumber: string;
  public readonly locationId: string;
  public status: StockAdjustmentStatus;
  public readonly reason: string;
  public notes?: string | null;
  public readonly createdBy: string;
  public approvedBy?: string | null;
  public approvedAt?: Date | null;
  public readonly lines: StockAdjustmentLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: StockAdjustmentProps) {
    this.id = props.id;
    this.adjustmentNumber = props.adjustmentNumber;
    this.locationId = props.locationId;
    this.status = props.status;
    this.reason = props.reason;
    this.notes = props.notes;
    this.createdBy = props.createdBy;
    this.approvedBy = props.approvedBy;
    this.approvedAt = props.approvedAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateStockAdjustmentInput): StockAdjustment {
    if (!input.lines || input.lines.length === 0) {
      throw new EmptyStockAdjustmentError();
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();

    const adjustment = new StockAdjustment({
      id,
      adjustmentNumber: input.adjustmentNumber.trim().toUpperCase(),
      locationId: input.locationId,
      status: "PENDING",
      reason: input.reason.trim(),
      notes: input.notes?.trim() ?? null,
      createdBy: input.createdBy,
      lines: [],
      createdAt,
      updatedAt: createdAt,
    });

    for (const lineInput of input.lines) {
      if (lineInput.countedQuantity < 0) {
        throw new NegativeCountedQuantityError(
          lineInput.componentId,
          lineInput.countedQuantity,
        );
      }

      const lineId = ObjectId.generate().value;
      const difference = lineInput.countedQuantity - lineInput.currentQuantity;

      adjustment.lines.push({
        id: lineId,
        stockAdjustmentId: id,
        componentId: lineInput.componentId,
        currentQuantity: lineInput.currentQuantity,
        countedQuantity: lineInput.countedQuantity,
        difference,
        unitOfMeasure: lineInput.unitOfMeasure || "pcs",
        createdAt,
        updatedAt: createdAt,
      });
    }

    return adjustment;
  }

  public approve(approvedBy: string): void {
    if (this.status !== "PENDING") {
      throw new InvalidAdjustmentStatusError(
        `Cannot approve stock adjustment in ${this.status} status.`,
      );
    }

    this.status = "APPROVED";
    this.approvedBy = approvedBy;
    this.approvedAt = new Date();
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status !== "PENDING") {
      throw new InvalidAdjustmentStatusError(
        `Cannot cancel stock adjustment in ${this.status} status.`,
      );
    }

    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }

  public static rehydrate(props: StockAdjustmentProps): StockAdjustment {
    return new StockAdjustment(props);
  }
}
