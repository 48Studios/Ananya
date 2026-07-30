import { ObjectId } from "@ananya/core";
import {
  ImmutableCycleCountError,
  InvalidCountedQuantityError,
  InvalidCycleCountStatusTransitionError,
} from "./cycle-count.errors";

export type CycleCountStatus =
  | "DRAFT"
  | "ASSIGNED"
  | "COUNTING"
  | "REVIEW"
  | "APPROVED"
  | "CANCELLED";

export interface CycleCountLineProps {
  id: string;
  cycleCountId: string;
  componentId: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  unitOfMeasure?: string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CycleCountProps {
  id: string;
  countNumber: string;
  locationId: string;
  status: CycleCountStatus;
  assignedCounter?: string | null;
  scheduledDate?: Date | null;
  completedAt?: Date | null;
  approvedAt?: Date | null;
  createdBy?: string | null;
  approvedBy?: string | null;
  stockAdjustmentId?: string | null;
  notes?: string | null;
  lines?: CycleCountLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCycleCountInput {
  countNumber: string;
  locationId: string;
  assignedCounter?: string | null;
  scheduledDate?: Date | null;
  createdBy?: string | null;
  notes?: string | null;
  lines?: {
    componentId: string;
    systemQuantity: number;
    countedQuantity?: number;
    unitOfMeasure?: string;
    notes?: string | null;
  }[];
}

export interface RecordPhysicalCountInput {
  lineId: string;
  countedQuantity: number;
  notes?: string | null;
}

export class CycleCount {
  public readonly id: string;
  public readonly countNumber: string;
  public locationId: string;
  public status: CycleCountStatus;
  public assignedCounter?: string | null;
  public scheduledDate?: Date | null;
  public completedAt?: Date | null;
  public approvedAt?: Date | null;
  public createdBy?: string | null;
  public approvedBy?: string | null;
  public stockAdjustmentId?: string | null;
  public notes?: string | null;
  public lines: CycleCountLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: CycleCountProps) {
    this.id = props.id;
    this.countNumber = props.countNumber;
    this.locationId = props.locationId;
    this.status = props.status;
    this.assignedCounter = props.assignedCounter ?? null;
    this.scheduledDate = props.scheduledDate ?? null;
    this.completedAt = props.completedAt ?? null;
    this.approvedAt = props.approvedAt ?? null;
    this.createdBy = props.createdBy ?? null;
    this.approvedBy = props.approvedBy ?? null;
    this.stockAdjustmentId = props.stockAdjustmentId ?? null;
    this.notes = props.notes ?? null;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateCycleCountInput): CycleCount {
    const id = ObjectId.generate().value;
    const now = new Date();

    const cycleCount = new CycleCount({
      id,
      countNumber: input.countNumber.trim().toUpperCase(),
      locationId: input.locationId,
      status: "DRAFT",
      assignedCounter: input.assignedCounter?.trim() ?? null,
      scheduledDate: input.scheduledDate ?? now,
      completedAt: null,
      approvedAt: null,
      createdBy: input.createdBy?.trim() ?? "SYSTEM",
      approvedBy: null,
      stockAdjustmentId: null,
      notes: input.notes?.trim() ?? null,
      lines: [],
      createdAt: now,
      updatedAt: now,
    });

    if (input.lines && input.lines.length > 0) {
      for (const line of input.lines) {
        cycleCount.addLine(line);
      }
    }

    return cycleCount;
  }

  public addLine(input: {
    componentId: string;
    systemQuantity: number;
    countedQuantity?: number;
    unitOfMeasure?: string;
    notes?: string | null;
  }): void {
    if (this.status !== "DRAFT" && this.status !== "ASSIGNED") {
      throw new ImmutableCycleCountError();
    }

    const lineId = ObjectId.generate().value;
    const now = new Date();
    const counted = input.countedQuantity ?? input.systemQuantity;
    const variance = Math.round((counted - input.systemQuantity) * 10000) / 10000;

    this.lines.push({
      id: lineId,
      cycleCountId: this.id,
      componentId: input.componentId,
      systemQuantity: input.systemQuantity,
      countedQuantity: counted,
      variance,
      unitOfMeasure: input.unitOfMeasure || "pcs",
      notes: input.notes?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.updatedAt = now;
  }

  public updateHeader(input: {
    locationId?: string;
    assignedCounter?: string | null;
    scheduledDate?: Date | null;
    notes?: string | null;
  }): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableCycleCountError();
    }
    if (input.locationId) this.locationId = input.locationId;
    if (input.assignedCounter !== undefined)
      this.assignedCounter = input.assignedCounter;
    if (input.scheduledDate !== undefined)
      this.scheduledDate = input.scheduledDate;
    if (input.notes !== undefined) this.notes = input.notes;
    this.updatedAt = new Date();
  }

  public assignCounter(counter: string): void {
    if (this.status !== "DRAFT" && this.status !== "ASSIGNED") {
      throw new InvalidCycleCountStatusTransitionError(this.status, "ASSIGNED");
    }
    this.assignedCounter = counter.trim();
    this.status = "ASSIGNED";
    this.updatedAt = new Date();
  }

  public startCounting(): void {
    if (
      this.status !== "DRAFT" &&
      this.status !== "ASSIGNED" &&
      this.status !== "COUNTING"
    ) {
      throw new InvalidCycleCountStatusTransitionError(this.status, "COUNTING");
    }
    this.status = "COUNTING";
    this.updatedAt = new Date();
  }

  public recordPhysicalCounts(counts: RecordPhysicalCountInput[]): void {
    if (this.status !== "COUNTING" && this.status !== "ASSIGNED" && this.status !== "DRAFT") {
      throw new InvalidCycleCountStatusTransitionError(this.status, "REVIEW");
    }

    for (const c of counts) {
      if (c.countedQuantity < 0) {
        throw new InvalidCountedQuantityError(
          "Counted quantity cannot be negative.",
        );
      }
      const line = this.lines.find((l) => l.id === c.lineId);
      if (line) {
        line.countedQuantity = c.countedQuantity;
        line.variance =
          Math.round((c.countedQuantity - line.systemQuantity) * 10000) / 10000;
        if (c.notes !== undefined) line.notes = c.notes;
        line.updatedAt = new Date();
      }
    }

    this.status = "REVIEW";
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  public approve(approvedBy: string, stockAdjustmentId?: string): void {
    if (this.status !== "REVIEW" && this.status !== "COUNTING") {
      throw new InvalidCycleCountStatusTransitionError(this.status, "APPROVED");
    }
    this.status = "APPROVED";
    this.approvedBy = approvedBy.trim();
    this.approvedAt = new Date();
    if (stockAdjustmentId) {
      this.stockAdjustmentId = stockAdjustmentId;
    }
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === "APPROVED" || this.status === "CANCELLED") {
      throw new ImmutableCycleCountError();
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }

  public static rehydrate(props: CycleCountProps): CycleCount {
    return new CycleCount(props);
  }
}
