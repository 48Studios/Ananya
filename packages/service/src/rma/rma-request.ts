import { ObjectId } from "@ananya/core";

export type RmaStatus =
  | "REQUESTED"
  | "APPROVED"
  | "RECEIVED"
  | "INSPECTED"
  | "PROCESSED"
  | "CLOSED"
  | "REJECTED";

export type RmaDisposition = "REPAIR" | "REPLACE" | "SCRAP" | "RETURN";

export interface RmaRequestProps {
  id: string;
  rmaNumber: string;
  customerId: string;
  salesOrderId?: string;
  itemDescription: string;
  serialNumber?: string;
  reason: string;
  status: RmaStatus;
  disposition?: RmaDisposition;
  inspectionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRmaRequestProps {
  rmaNumber: string;
  customerId: string;
  salesOrderId?: string;
  itemDescription: string;
  serialNumber?: string;
  reason: string;
}

export class RmaRequest implements RmaRequestProps {
  public readonly id: string;
  public rmaNumber: string;
  public customerId: string;
  public salesOrderId?: string;
  public itemDescription: string;
  public serialNumber?: string;
  public reason: string;
  public status: RmaStatus;
  public disposition?: RmaDisposition;
  public inspectionNotes?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: RmaRequestProps) {
    this.id = props.id;
    this.rmaNumber = props.rmaNumber;
    this.customerId = props.customerId;
    this.salesOrderId = props.salesOrderId;
    this.itemDescription = props.itemDescription;
    this.serialNumber = props.serialNumber;
    this.reason = props.reason;
    this.status = props.status;
    this.disposition = props.disposition;
    this.inspectionNotes = props.inspectionNotes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateRmaRequestProps): RmaRequest {
    if (!props.customerId || props.customerId.trim() === "") {
      throw new Error("RMA request requires a valid customerId");
    }
    if (!props.itemDescription || props.itemDescription.trim() === "") {
      throw new Error("RMA item description is required");
    }

    const now = new Date();
    return new RmaRequest({
      id: ObjectId.generate().value,
      rmaNumber: props.rmaNumber,
      customerId: props.customerId,
      salesOrderId: props.salesOrderId,
      itemDescription: props.itemDescription.trim(),
      serialNumber: props.serialNumber,
      reason: props.reason.trim(),
      status: "REQUESTED",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: RmaRequestProps): RmaRequest {
    return new RmaRequest(props);
  }

  public approve(): void {
    if (this.status !== "REQUESTED") {
      throw new Error(`Cannot approve RMA in status ${this.status}`);
    }
    this.status = "APPROVED";
    this.updatedAt = new Date();
  }

  public receive(): void {
    if (this.status !== "APPROVED") {
      throw new Error(`Cannot receive item for RMA in status ${this.status}`);
    }
    this.status = "RECEIVED";
    this.updatedAt = new Date();
  }

  public inspect(disposition: RmaDisposition, notes?: string): void {
    if (this.status !== "RECEIVED") {
      throw new Error(`Cannot inspect item for RMA in status ${this.status}`);
    }
    this.disposition = disposition;
    this.inspectionNotes = notes?.trim();
    this.status = "INSPECTED";
    this.updatedAt = new Date();
  }

  public process(): void {
    if (this.status !== "INSPECTED") {
      throw new Error(`Cannot process RMA without completion of inspection`);
    }
    this.status = "PROCESSED";
    this.updatedAt = new Date();
  }

  public close(): void {
    if (this.status === "REJECTED") {
      throw new Error("Rejected RMA requests cannot be closed");
    }
    this.status = "CLOSED";
    this.updatedAt = new Date();
  }

  public reject(): void {
    if (this.status === "CLOSED" || this.status === "PROCESSED") {
      throw new Error(`Cannot reject RMA in status ${this.status}`);
    }
    this.status = "REJECTED";
    this.updatedAt = new Date();
  }
}
