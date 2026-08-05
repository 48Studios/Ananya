import { ObjectId } from "@ananya/core";
import { InvalidSupplierReturnStatusError } from "./supplier-return.errors";

export type SupplierReturnStatus =
  "DRAFT" | "APPROVED" | "DISPATCHED" | "COMPLETED" | "CANCELLED";

export interface SupplierReturnLineProps {
  id: string;
  supplierReturnId: string;
  componentId: string;
  locationId: string;
  quantityReturned: number;
  unitPrice: number;
  reason: string;
  batchNumber?: string | null;
  serialNumbers: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierReturnProps {
  id: string;
  returnNumber: string;
  supplierId: string;
  purchaseOrderId?: string | null;
  rmaNumber?: string | null;
  status: SupplierReturnStatus;
  totalAmount: number;
  dispatchedAt?: Date | null;
  lines?: SupplierReturnLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierReturnInput {
  returnNumber: string;
  supplierId: string;
  purchaseOrderId?: string | null;
  rmaNumber?: string | null;
}

export interface AddSupplierReturnLineInput {
  componentId: string;
  locationId: string;
  quantityReturned: number;
  unitPrice: number;
  reason: string;
  batchNumber?: string | null;
  serialNumbers?: string[];
}

export class SupplierReturn {
  public readonly id: string;
  public readonly returnNumber: string;
  public readonly supplierId: string;
  public purchaseOrderId?: string | null;
  public rmaNumber?: string | null;
  public status: SupplierReturnStatus;
  public totalAmount: number;
  public dispatchedAt?: Date | null;
  public readonly lines: SupplierReturnLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: SupplierReturnProps) {
    this.id = props.id;
    this.returnNumber = props.returnNumber;
    this.supplierId = props.supplierId;
    this.purchaseOrderId = props.purchaseOrderId;
    this.rmaNumber = props.rmaNumber;
    this.status = props.status;
    this.totalAmount = props.totalAmount;
    this.dispatchedAt = props.dispatchedAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateSupplierReturnInput): SupplierReturn {
    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new SupplierReturn({
      id,
      returnNumber: input.returnNumber.trim().toUpperCase(),
      supplierId: input.supplierId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      rmaNumber: input.rmaNumber?.trim() ?? null,
      status: "DRAFT",
      totalAmount: 0,
      lines: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public addLine(input: AddSupplierReturnLineInput): void {
    if (this.status !== "DRAFT") {
      throw new InvalidSupplierReturnStatusError(
        "Cannot modify lines of non-DRAFT return.",
      );
    }

    const lineId = ObjectId.generate().value;
    const createdAt = new Date();

    const line: SupplierReturnLineProps = {
      id: lineId,
      supplierReturnId: this.id,
      componentId: input.componentId,
      locationId: input.locationId,
      quantityReturned: input.quantityReturned,
      unitPrice: input.unitPrice,
      reason: input.reason.trim(),
      batchNumber: input.batchNumber?.trim() ?? null,
      serialNumbers: input.serialNumbers ?? [],
      createdAt,
      updatedAt: createdAt,
    };

    this.lines.push(line);
    this.recalculateTotal();
  }

  public approve(rmaNumber?: string): void {
    if (this.status !== "DRAFT") {
      throw new InvalidSupplierReturnStatusError(
        "Return must be DRAFT to approve.",
      );
    }
    if (rmaNumber) {
      this.rmaNumber = rmaNumber.trim();
    }
    this.status = "APPROVED";
    this.updatedAt = new Date();
  }

  public dispatch(): void {
    if (this.status !== "APPROVED") {
      throw new InvalidSupplierReturnStatusError(
        "Return must be APPROVED before dispatch.",
      );
    }
    this.status = "DISPATCHED";
    this.dispatchedAt = new Date();
    this.updatedAt = new Date();
  }

  public recalculateTotal(): void {
    this.totalAmount = this.lines.reduce(
      (sum, l) => sum + l.unitPrice * l.quantityReturned,
      0,
    );
  }

  public static rehydrate(props: SupplierReturnProps): SupplierReturn {
    return new SupplierReturn(props);
  }
}
