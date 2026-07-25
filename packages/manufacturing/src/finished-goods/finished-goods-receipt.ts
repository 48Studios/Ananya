import { ObjectId } from "@ananya/core";
import { DomainError } from "@ananya/core";

export class ImmutableFgrError extends DomainError {
  constructor() {
    super("Posted Finished Goods Receipt is immutable.");
    this.name = "ImmutableFgrError";
  }
}

export class InvalidFgrQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFgrQuantityError";
  }
}

export type FgrStatus = "DRAFT" | "POSTED";

export interface FinishedGoodsReceiptLineProps {
  id: string;
  fgrId: string;
  componentId: string;
  locationId: string;
  quantityProduced: number;
  quantityScrapped: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinishedGoodsReceiptProps {
  id: string;
  fgrNumber: string;
  productionOrderId: string;
  status: FgrStatus;
  postedAt?: Date | null;
  lines?: FinishedGoodsReceiptLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFgrInput {
  fgrNumber: string;
  productionOrderId: string;
}

export interface AddFgrLineInput {
  componentId: string;
  locationId: string;
  quantityProduced: number;
  quantityScrapped?: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
}

export class FinishedGoodsReceipt {
  public readonly id: string;
  public readonly fgrNumber: string;
  public readonly productionOrderId: string;
  public status: FgrStatus;
  public postedAt?: Date | null;
  public readonly lines: FinishedGoodsReceiptLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: FinishedGoodsReceiptProps) {
    this.id = props.id;
    this.fgrNumber = props.fgrNumber;
    this.productionOrderId = props.productionOrderId;
    this.status = props.status;
    this.postedAt = props.postedAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateFgrInput): FinishedGoodsReceipt {
    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new FinishedGoodsReceipt({
      id,
      fgrNumber: input.fgrNumber.trim().toUpperCase(),
      productionOrderId: input.productionOrderId,
      status: "DRAFT",
      postedAt: null,
      lines: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public addLine(input: AddFgrLineInput): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableFgrError();
    }
    const produced = input.quantityProduced;
    const scrapped = input.quantityScrapped ?? 0;
    if (produced < 0 || scrapped < 0) {
      throw new InvalidFgrQuantityError(
        "Produced and scrapped quantities must be non-negative.",
      );
    }
    if (produced + scrapped <= 0) {
      throw new InvalidFgrQuantityError(
        "At least one of produced or scrapped quantity must be positive.",
      );
    }

    const lineId = ObjectId.generate().value;
    const now = new Date();

    this.lines.push({
      id: lineId,
      fgrId: this.id,
      componentId: input.componentId,
      locationId: input.locationId,
      quantityProduced: produced,
      quantityScrapped: scrapped,
      batchNumber: input.batchNumber ?? null,
      serialNumbers: input.serialNumbers ?? null,
      createdAt: now,
      updatedAt: now,
    });

    this.updatedAt = now;
  }

  public post(): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableFgrError();
    }
    this.status = "POSTED";
    this.postedAt = new Date();
    this.updatedAt = new Date();
  }

  public get totalProduced(): number {
    return this.lines.reduce((sum, l) => sum + l.quantityProduced, 0);
  }

  public get totalScrapped(): number {
    return this.lines.reduce((sum, l) => sum + l.quantityScrapped, 0);
  }

  public static rehydrate(
    props: FinishedGoodsReceiptProps,
  ): FinishedGoodsReceipt {
    return new FinishedGoodsReceipt(props);
  }
}
