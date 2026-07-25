import { ObjectId } from "@ananya/core";
import {
  ImmutableStockCountError,
  InvalidCountQuantityError,
  InvalidStockCountStatusTransitionError,
} from "./stock-count.errors";

export type StockCountStatus =
  | "DRAFT"
  | "ASSIGNED"
  | "COUNTING"
  | "SUBMITTED"
  | "APPROVED"
  | "POSTED"
  | "CANCELLED";

export interface StockCountLineProps {
  id: string;
  stockCountId: string;
  componentId: string;
  binId: string;
  expectedQuantity: number;
  countedQuantity: number;
  variance: number;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockCountProps {
  id: string;
  countNumber: string;
  warehouseId: string;
  assignedUser?: string | null;
  status: StockCountStatus;
  postedAt?: Date | null;
  lines?: StockCountLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStockCountInput {
  countNumber: string;
  warehouseId: string;
  assignedUser?: string | null;
}

export interface AddCountLineInput {
  componentId: string;
  binId: string;
  expectedQuantity?: number;
  countedQuantity: number;
  notes?: string | null;
}

export class StockCount {
  public readonly id: string;
  public readonly countNumber: string;
  public readonly warehouseId: string;
  public assignedUser?: string | null;
  public status: StockCountStatus;
  public postedAt?: Date | null;
  public readonly lines: StockCountLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: StockCountProps) {
    this.id = props.id;
    this.countNumber = props.countNumber;
    this.warehouseId = props.warehouseId;
    this.assignedUser = props.assignedUser;
    this.status = props.status;
    this.postedAt = props.postedAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateStockCountInput): StockCount {
    const id = ObjectId.generate().value;
    const now = new Date();

    return new StockCount({
      id,
      countNumber: input.countNumber.trim().toUpperCase(),
      warehouseId: input.warehouseId,
      assignedUser: input.assignedUser?.trim() ?? null,
      status: "DRAFT",
      postedAt: null,
      lines: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public assignUser(user: string): void {
    if (this.status === "POSTED" || this.status === "CANCELLED") {
      throw new ImmutableStockCountError();
    }
    this.assignedUser = user;
    this.status = "ASSIGNED";
    this.updatedAt = new Date();
  }

  public addLine(input: AddCountLineInput): void {
    if (this.status === "POSTED" || this.status === "CANCELLED") {
      throw new ImmutableStockCountError();
    }
    if (input.countedQuantity < 0) {
      throw new InvalidCountQuantityError(
        "Counted quantity cannot be negative.",
      );
    }

    const lineId = ObjectId.generate().value;
    const now = new Date();
    const expected = input.expectedQuantity ?? 0;
    const variance = input.countedQuantity - expected;

    this.lines.push({
      id: lineId,
      stockCountId: this.id,
      componentId: input.componentId,
      binId: input.binId,
      expectedQuantity: expected,
      countedQuantity: input.countedQuantity,
      variance,
      notes: input.notes?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    });

    if (this.status === "DRAFT" || this.status === "ASSIGNED") {
      this.status = "COUNTING";
    }
    this.updatedAt = now;
  }

  public submit(): void {
    if (this.status !== "COUNTING" && this.status !== "ASSIGNED") {
      throw new InvalidStockCountStatusTransitionError(
        this.status,
        "SUBMITTED",
      );
    }
    this.status = "SUBMITTED";
    this.updatedAt = new Date();
  }

  public approve(): void {
    if (this.status !== "SUBMITTED") {
      throw new InvalidStockCountStatusTransitionError(
        this.status,
        "APPROVED",
      );
    }
    this.status = "APPROVED";
    this.updatedAt = new Date();
  }

  public post(): void {
    if (this.status !== "APPROVED") {
      throw new InvalidStockCountStatusTransitionError(this.status, "POSTED");
    }
    this.status = "POSTED";
    this.postedAt = new Date();
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === "POSTED" || this.status === "CANCELLED") {
      throw new ImmutableStockCountError();
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }

  public static rehydrate(props: StockCountProps): StockCount {
    return new StockCount(props);
  }
}
