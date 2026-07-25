import { ObjectId } from "@ananya/core";
import { DomainError } from "@ananya/core";

export class ImmutableConsumptionError extends DomainError {
  constructor() {
    super("Posted material consumption is immutable.");
    this.name = "ImmutableConsumptionError";
  }
}

export class InvalidConsumptionQuantityError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConsumptionQuantityError";
  }
}

export type ConsumptionStatus = "DRAFT" | "POSTED";

export interface MaterialConsumptionLineProps {
  id: string;
  consumptionId: string;
  componentId: string;
  locationId: string;
  quantityPlanned: number;
  quantityConsumed: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
  consumedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialConsumptionProps {
  id: string;
  consumptionNumber: string;
  productionOrderId: string;
  status: ConsumptionStatus;
  postedAt?: Date | null;
  lines?: MaterialConsumptionLineProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMaterialConsumptionInput {
  consumptionNumber: string;
  productionOrderId: string;
}

export interface AddConsumptionLineInput {
  componentId: string;
  locationId: string;
  quantityPlanned?: number;
  quantityConsumed: number;
  batchNumber?: string | null;
  serialNumbers?: string[] | null;
}

export class MaterialConsumption {
  public readonly id: string;
  public readonly consumptionNumber: string;
  public readonly productionOrderId: string;
  public status: ConsumptionStatus;
  public postedAt?: Date | null;
  public readonly lines: MaterialConsumptionLineProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: MaterialConsumptionProps) {
    this.id = props.id;
    this.consumptionNumber = props.consumptionNumber;
    this.productionOrderId = props.productionOrderId;
    this.status = props.status;
    this.postedAt = props.postedAt;
    this.lines = props.lines ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    input: CreateMaterialConsumptionInput,
  ): MaterialConsumption {
    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new MaterialConsumption({
      id,
      consumptionNumber: input.consumptionNumber.trim().toUpperCase(),
      productionOrderId: input.productionOrderId,
      status: "DRAFT",
      postedAt: null,
      lines: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public addLine(input: AddConsumptionLineInput): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableConsumptionError();
    }
    if (input.quantityConsumed <= 0) {
      throw new InvalidConsumptionQuantityError(
        "Consumed quantity must be greater than zero.",
      );
    }

    const lineId = ObjectId.generate().value;
    const now = new Date();

    this.lines.push({
      id: lineId,
      consumptionId: this.id,
      componentId: input.componentId,
      locationId: input.locationId,
      quantityPlanned: input.quantityPlanned ?? 0,
      quantityConsumed: input.quantityConsumed,
      batchNumber: input.batchNumber ?? null,
      serialNumbers: input.serialNumbers ?? null,
      consumedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    this.updatedAt = now;
  }

  public post(): void {
    if (this.status !== "DRAFT") {
      throw new ImmutableConsumptionError();
    }
    this.status = "POSTED";
    this.postedAt = new Date();
    this.updatedAt = new Date();
  }

  public static rehydrate(
    props: MaterialConsumptionProps,
  ): MaterialConsumption {
    return new MaterialConsumption(props);
  }
}
