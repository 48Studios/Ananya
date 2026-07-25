import { ObjectId } from "@ananya/core";
import {
  IdenticalTransferBinsError,
  ImmutableTransferError,
  InvalidTransferQuantityError,
  InvalidTransferStatusTransitionError,
} from "./transfer.errors";

export type TransferStatus =
  | "DRAFT"
  | "APPROVED"
  | "IN_TRANSIT"
  | "COMPLETED"
  | "CANCELLED";

export interface WarehouseTransferLineProps {
  id: string;
  transferId: string;
  componentId: string;
  quantity: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarehouseTransferProps {
  id: string;
  transferNumber: string;
  sourceBinId: string;
  destinationBinId: string;
  status: TransferStatus;
  completedAt?: Date | null;
  lines?: WarehouseTransferLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWarehouseTransferInput {
  transferNumber: string;
  sourceBinId: string;
  destinationBinId: string;
}

export interface AddTransferLineInput {
  componentId: string;
  quantity: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
}

export class WarehouseTransfer {
  public readonly id: string;
  public readonly transferNumber: string;
  public readonly sourceBinId: string;
  public readonly destinationBinId: string;
  public status: TransferStatus;
  public completedAt?: Date | null;
  public readonly lines: WarehouseTransferLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: WarehouseTransferProps) {
    this.id = props.id;
    this.transferNumber = props.transferNumber;
    this.sourceBinId = props.sourceBinId;
    this.destinationBinId = props.destinationBinId;
    this.status = props.status;
    this.completedAt = props.completedAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    input: CreateWarehouseTransferInput,
  ): WarehouseTransfer {
    if (input.sourceBinId === input.destinationBinId) {
      throw new IdenticalTransferBinsError();
    }

    const id = ObjectId.generate().value;
    const now = new Date();

    return new WarehouseTransfer({
      id,
      transferNumber: input.transferNumber.trim().toUpperCase(),
      sourceBinId: input.sourceBinId,
      destinationBinId: input.destinationBinId,
      status: "DRAFT",
      completedAt: null,
      lines: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  public addLine(input: AddTransferLineInput): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableTransferError();
    }
    if (input.quantity <= 0) {
      throw new InvalidTransferQuantityError(
        "Transfer quantity must be strictly greater than zero.",
      );
    }

    const lineId = ObjectId.generate().value;
    const now = new Date();

    this.lines.push({
      id: lineId,
      transferId: this.id,
      componentId: input.componentId,
      quantity: input.quantity,
      batchNumber: input.batchNumber ?? null,
      serialNumbers: input.serialNumbers ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.updatedAt = now;
  }

  public approve(): void {
    if (this.status !== "DRAFT") {
      throw new InvalidTransferStatusTransitionError(
        this.status,
        "APPROVED",
      );
    }
    this.status = "APPROVED";
    this.updatedAt = new Date();
  }

  public dispatch(): void {
    if (this.status !== "APPROVED") {
      throw new InvalidTransferStatusTransitionError(
        this.status,
        "IN_TRANSIT",
      );
    }
    this.status = "IN_TRANSIT";
    this.updatedAt = new Date();
  }

  public complete(): void {
    if (this.status !== "APPROVED" && this.status !== "IN_TRANSIT") {
      throw new InvalidTransferStatusTransitionError(
        this.status,
        "COMPLETED",
      );
    }
    this.status = "COMPLETED";
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === "COMPLETED" || this.status === "CANCELLED") {
      throw new ImmutableTransferError();
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }

  public static rehydrate(props: WarehouseTransferProps): WarehouseTransfer {
    return new WarehouseTransfer(props);
  }
}
