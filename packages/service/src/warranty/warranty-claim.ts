import { ObjectId } from "@ananya/core";

export type WarrantyDecision =
  "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface WarrantyClaimProps {
  id: string;
  warrantyNumber: string;
  customerId: string;
  productId: string;
  serialNumber?: string;
  purchaseDate: Date;
  expiryDate: Date;
  claimReason: string;
  decision: WarrantyDecision;
  decisionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWarrantyClaimProps {
  warrantyNumber: string;
  customerId: string;
  productId: string;
  serialNumber?: string;
  purchaseDate: Date;
  expiryDate: Date;
  claimReason: string;
}

export class WarrantyClaim implements WarrantyClaimProps {
  public readonly id: string;
  public warrantyNumber: string;
  public customerId: string;
  public productId: string;
  public serialNumber?: string;
  public purchaseDate: Date;
  public expiryDate: Date;
  public claimReason: string;
  public decision: WarrantyDecision;
  public decisionNotes?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: WarrantyClaimProps) {
    this.id = props.id;
    this.warrantyNumber = props.warrantyNumber;
    this.customerId = props.customerId;
    this.productId = props.productId;
    this.serialNumber = props.serialNumber;
    this.purchaseDate = props.purchaseDate;
    this.expiryDate = props.expiryDate;
    this.claimReason = props.claimReason;
    this.decision = props.decision;
    this.decisionNotes = props.decisionNotes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateWarrantyClaimProps): WarrantyClaim {
    if (!props.customerId || props.customerId.trim() === "") {
      throw new Error("Warranty claim requires a valid customerId");
    }
    if (!props.productId || props.productId.trim() === "") {
      throw new Error("Warranty claim requires a valid productId");
    }
    if (props.expiryDate < props.purchaseDate) {
      throw new Error("Warranty expiry date cannot be before purchase date");
    }

    const now = new Date();
    const isExpired = now > props.expiryDate;
    return new WarrantyClaim({
      id: ObjectId.generate().value,
      warrantyNumber: props.warrantyNumber,
      customerId: props.customerId,
      productId: props.productId,
      serialNumber: props.serialNumber,
      purchaseDate: props.purchaseDate,
      expiryDate: props.expiryDate,
      claimReason: props.claimReason.trim(),
      decision: isExpired ? "EXPIRED" : "SUBMITTED",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: WarrantyClaimProps): WarrantyClaim {
    return new WarrantyClaim(props);
  }

  public review(): void {
    if (this.decision === "EXPIRED") {
      throw new Error("Expired warranty claims cannot be reviewed");
    }
    this.decision = "UNDER_REVIEW";
    this.updatedAt = new Date();
  }

  public approve(notes?: string): void {
    if (this.decision === "EXPIRED") {
      throw new Error("Expired warranty claims cannot be approved");
    }
    this.decision = "APPROVED";
    this.decisionNotes = notes?.trim();
    this.updatedAt = new Date();
  }

  public reject(notes?: string): void {
    if (this.decision === "APPROVED") {
      throw new Error("Approved warranty claims cannot be rejected");
    }
    this.decision = "REJECTED";
    this.decisionNotes = notes?.trim();
    this.updatedAt = new Date();
  }
}
