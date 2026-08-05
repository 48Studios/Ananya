import { ObjectId } from "@ananya/core";

export type FulfillmentStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PICKING"
  | "PACKED"
  | "SHIPPED"
  | "COMPLETED"
  | "CANCELLED";

export interface FulfillmentRequestLineProps {
  id: string;
  fulfillmentRequestId: string;
  salesOrderLineId: string;
  componentId: string;
  requestedQuantity: number;
  fulfilledQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FulfillmentRequestProps {
  id: string;
  requestNumber: string;
  salesOrderId: string;
  warehouseId: string;
  status: FulfillmentStatus;
  carrierName?: string | null;
  trackingNumber?: string | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  lines?: FulfillmentRequestLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFulfillmentRequestInput {
  requestNumber: string;
  salesOrderId: string;
  warehouseId: string;
}

export interface AddFulfillmentLineInput {
  salesOrderLineId: string;
  componentId: string;
  requestedQuantity: number;
}

export class FulfillmentRequest {
  public readonly id: string;
  public readonly requestNumber: string;
  public readonly salesOrderId: string;
  public readonly warehouseId: string;
  public status: FulfillmentStatus;
  public carrierName?: string | null;
  public trackingNumber?: string | null;
  public shippedAt?: Date | null;
  public deliveredAt?: Date | null;
  public readonly lines: FulfillmentRequestLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: FulfillmentRequestProps) {
    this.id = props.id;
    this.requestNumber = props.requestNumber;
    this.salesOrderId = props.salesOrderId;
    this.warehouseId = props.warehouseId;
    this.status = props.status;
    this.carrierName = props.carrierName;
    this.trackingNumber = props.trackingNumber;
    this.shippedAt = props.shippedAt;
    this.deliveredAt = props.deliveredAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(input: CreateFulfillmentRequestInput): FulfillmentRequest {
    const now = new Date();
    return new FulfillmentRequest({
      id: ObjectId.generate().value,
      requestNumber: input.requestNumber.toUpperCase(),
      salesOrderId: input.salesOrderId,
      warehouseId: input.warehouseId,
      status: "PENDING",
      lines: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: FulfillmentRequestProps): FulfillmentRequest {
    return new FulfillmentRequest(props);
  }

  addLine(input: AddFulfillmentLineInput): FulfillmentRequestLineProps {
    if (this.status !== "PENDING") {
      throw new Error("Can only add lines to PENDING fulfillment requests.");
    }
    const now = new Date();
    const line: FulfillmentRequestLineProps = {
      id: ObjectId.generate().value,
      fulfillmentRequestId: this.id,
      salesOrderLineId: input.salesOrderLineId,
      componentId: input.componentId,
      requestedQuantity: input.requestedQuantity,
      fulfilledQuantity: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.lines.push(line);
    this.updatedAt = now;
    return line;
  }

  accept(): void {
    if (this.status !== "PENDING") {
      throw new Error("Only PENDING requests can be accepted by Warehouse.");
    }
    this.status = "ACCEPTED";
    this.updatedAt = new Date();
  }

  startPicking(): void {
    if (this.status !== "ACCEPTED") {
      throw new Error("Only ACCEPTED requests can enter PICKING status.");
    }
    this.status = "PICKING";
    this.updatedAt = new Date();
  }

  pack(): void {
    if (this.status !== "PICKING") {
      throw new Error("Only PICKING requests can be PACKED.");
    }
    this.status = "PACKED";
    this.updatedAt = new Date();
  }

  ship(carrierName: string, trackingNumber: string): void {
    if (this.status !== "PACKED") {
      throw new Error("Only PACKED requests can be SHIPPED.");
    }
    this.status = "SHIPPED";
    this.carrierName = carrierName;
    this.trackingNumber = trackingNumber;
    this.shippedAt = new Date();
    this.updatedAt = new Date();
  }

  complete(): void {
    if (this.status !== "SHIPPED") {
      throw new Error("Only SHIPPED requests can be COMPLETED.");
    }
    this.status = "COMPLETED";
    this.deliveredAt = new Date();
    this.lines.forEach((l) => (l.fulfilledQuantity = l.requestedQuantity));
    this.updatedAt = new Date();
  }

  cancel(): void {
    if (this.status === "COMPLETED") {
      throw new Error("Cannot cancel COMPLETED fulfillment request.");
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }
}
