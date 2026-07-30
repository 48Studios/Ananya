import { ObjectId } from "@ananya/core";
import {
  IdenticalTransferLocationsError,
  ImmutableTransferError,
  InvalidTransferQuantityError,
  InvalidTransferStatusTransitionError,
} from "./transfer.errors";

export type TransferStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "DISPATCHED"
  | "RECEIVED"
  | "CANCELLED";

export interface WarehouseTransferLineProps {
  id: string;
  transferId: string;
  componentId: string;
  quantity: number;
  unitOfMeasure?: string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarehouseTransferProps {
  id: string;
  transferNumber: string;
  sourceLocationId: string;
  destinationLocationId: string;
  status: TransferStatus;
  requestedDate?: Date | null;
  dispatchedAt?: Date | null;
  receivedAt?: Date | null;
  requestedBy?: string | null;
  notes?: string | null;
  lines?: WarehouseTransferLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWarehouseTransferInput {
  transferNumber: string;
  sourceLocationId: string;
  destinationLocationId: string;
  requestedDate?: Date | null;
  requestedBy?: string | null;
  notes?: string | null;
  lines?: {
    componentId: string;
    quantity: number;
    unitOfMeasure?: string;
    notes?: string | null;
  }[];
}

export interface AddTransferLineInput {
  componentId: string;
  quantity: number;
  unitOfMeasure?: string;
  notes?: string | null;
}

export interface UpdateWarehouseTransferHeaderInput {
  sourceLocationId?: string;
  destinationLocationId?: string;
  requestedDate?: Date | null;
  notes?: string | null;
}

export class WarehouseTransfer {
  public readonly id: string;
  public readonly transferNumber: string;
  public sourceLocationId: string;
  public destinationLocationId: string;
  public status: TransferStatus;
  public requestedDate?: Date | null;
  public dispatchedAt?: Date | null;
  public receivedAt?: Date | null;
  public requestedBy?: string | null;
  public notes?: string | null;
  public lines: WarehouseTransferLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: WarehouseTransferProps) {
    this.id = props.id;
    this.transferNumber = props.transferNumber;
    this.sourceLocationId = props.sourceLocationId;
    this.destinationLocationId = props.destinationLocationId;
    this.status = props.status;
    this.requestedDate = props.requestedDate ?? null;
    this.dispatchedAt = props.dispatchedAt ?? null;
    this.receivedAt = props.receivedAt ?? null;
    this.requestedBy = props.requestedBy ?? null;
    this.notes = props.notes ?? null;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    input: CreateWarehouseTransferInput,
  ): WarehouseTransfer {
    if (input.sourceLocationId === input.destinationLocationId) {
      throw new IdenticalTransferLocationsError();
    }

    const id = ObjectId.generate().value;
    const now = new Date();

    const transfer = new WarehouseTransfer({
      id,
      transferNumber: input.transferNumber.trim().toUpperCase(),
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      status: "DRAFT",
      requestedDate: input.requestedDate ?? now,
      dispatchedAt: null,
      receivedAt: null,
      requestedBy: input.requestedBy?.trim() ?? null,
      notes: input.notes?.trim() ?? null,
      lines: [],
      createdAt: now,
      updatedAt: now,
    });

    if (input.lines && input.lines.length > 0) {
      for (const line of input.lines) {
        transfer.addLine(line);
      }
    }

    return transfer;
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
      unitOfMeasure: input.unitOfMeasure || "pcs",
      notes: input.notes?.trim() ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.updatedAt = now;
  }

  public updateHeader(input: UpdateWarehouseTransferHeaderInput): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableTransferError();
    }
    if (
      input.sourceLocationId &&
      input.destinationLocationId &&
      input.sourceLocationId === input.destinationLocationId
    ) {
      throw new IdenticalTransferLocationsError();
    }
    if (input.sourceLocationId) this.sourceLocationId = input.sourceLocationId;
    if (input.destinationLocationId)
      this.destinationLocationId = input.destinationLocationId;
    if (input.requestedDate !== undefined)
      this.requestedDate = input.requestedDate;
    if (input.notes !== undefined) this.notes = input.notes;
    this.updatedAt = new Date();
  }

  public submit(): void {
    if (this.status !== "DRAFT") {
      throw new InvalidTransferStatusTransitionError(
        this.status,
        "SUBMITTED",
      );
    }
    if (this.lines.length === 0) {
      throw new InvalidTransferQuantityError(
        "Transfer must contain at least one component line item before submitting.",
      );
    }
    this.status = "SUBMITTED";
    this.updatedAt = new Date();
  }

  public dispatch(): void {
    if (this.status !== "SUBMITTED" && this.status !== "DRAFT") {
      throw new InvalidTransferStatusTransitionError(
        this.status,
        "DISPATCHED",
      );
    }
    this.status = "DISPATCHED";
    this.dispatchedAt = new Date();
    this.updatedAt = new Date();
  }

  public receive(): void {
    if (this.status !== "DISPATCHED" && this.status !== "SUBMITTED") {
      throw new InvalidTransferStatusTransitionError(
        this.status,
        "RECEIVED",
      );
    }
    this.status = "RECEIVED";
    this.receivedAt = new Date();
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === "RECEIVED" || this.status === "CANCELLED") {
      throw new ImmutableTransferError();
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }

  public static rehydrate(props: WarehouseTransferProps): WarehouseTransfer {
    return new WarehouseTransfer(props);
  }
}
