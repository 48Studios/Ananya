import { ObjectId } from "@ananya/core";
import {
  InvalidProductionOrderStatusTransitionError,
  InvalidProductionQuantityError,
} from "./production-order.errors";

export type ProductionOrderStatus =
  | "DRAFT"
  | "RELEASED"
  | "MATERIAL_ALLOCATED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED";

export interface ProductionOrderOperationProps {
  id: string;
  productionOrderId: string;
  operationName: string;
  sequence: number;
  status: string;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductionOrderProps {
  id: string;
  productionNumber: string;
  bomId: string;
  componentId: string;
  status: ProductionOrderStatus;
  quantityPlanned: number;
  quantityCompleted: number;
  quantityScrapped: number;
  startDate?: Date | null;
  endDate?: Date | null;
  operations?: ProductionOrderOperationProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductionOrderInput {
  productionNumber: string;
  bomId: string;
  componentId: string;
  quantityPlanned: number;
  startDate?: Date | null;
  endDate?: Date | null;
}

export class ProductionOrder {
  public readonly id: string;
  public readonly productionNumber: string;
  public readonly bomId: string;
  public readonly componentId: string;
  public status: ProductionOrderStatus;
  public readonly quantityPlanned: number;
  public quantityCompleted: number;
  public quantityScrapped: number;
  public startDate?: Date | null;
  public endDate?: Date | null;
  public readonly operations: ProductionOrderOperationProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: ProductionOrderProps) {
    this.id = props.id;
    this.productionNumber = props.productionNumber;
    this.bomId = props.bomId;
    this.componentId = props.componentId;
    this.status = props.status;
    this.quantityPlanned = props.quantityPlanned;
    this.quantityCompleted = props.quantityCompleted;
    this.quantityScrapped = props.quantityScrapped;
    this.startDate = props.startDate;
    this.endDate = props.endDate;
    this.operations = props.operations ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateProductionOrderInput): ProductionOrder {
    if (input.quantityPlanned <= 0) {
      throw new InvalidProductionQuantityError(
        "Planned quantity must be greater than zero.",
      );
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();

    return new ProductionOrder({
      id,
      productionNumber: input.productionNumber.trim().toUpperCase(),
      bomId: input.bomId,
      componentId: input.componentId,
      status: "DRAFT",
      quantityPlanned: input.quantityPlanned,
      quantityCompleted: 0,
      quantityScrapped: 0,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      operations: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public release(): void {
    if (this.status !== "DRAFT") {
      throw new InvalidProductionOrderStatusTransitionError(
        this.status,
        "RELEASED",
      );
    }
    this.status = "RELEASED";
    this.updatedAt = new Date();
  }

  public allocateMaterials(): void {
    if (this.status !== "RELEASED") {
      throw new InvalidProductionOrderStatusTransitionError(
        this.status,
        "MATERIAL_ALLOCATED",
      );
    }
    this.status = "MATERIAL_ALLOCATED";
    this.updatedAt = new Date();
  }

  public start(): void {
    if (
      this.status !== "RELEASED" &&
      this.status !== "MATERIAL_ALLOCATED"
    ) {
      throw new InvalidProductionOrderStatusTransitionError(
        this.status,
        "IN_PROGRESS",
      );
    }
    this.status = "IN_PROGRESS";
    this.startDate = this.startDate ?? new Date();
    this.updatedAt = new Date();
  }

  public complete(): void {
    if (this.status !== "IN_PROGRESS") {
      throw new InvalidProductionOrderStatusTransitionError(
        this.status,
        "COMPLETED",
      );
    }
    this.status = "COMPLETED";
    this.endDate = this.endDate ?? new Date();
    this.updatedAt = new Date();
  }

  public close(): void {
    if (this.status !== "COMPLETED") {
      throw new InvalidProductionOrderStatusTransitionError(
        this.status,
        "CLOSED",
      );
    }
    this.status = "CLOSED";
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (["COMPLETED", "CLOSED", "CANCELLED"].includes(this.status)) {
      throw new InvalidProductionOrderStatusTransitionError(
        this.status,
        "CANCELLED",
      );
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }

  public addCompletedQuantity(produced: number, scrapped: number): void {
    this.quantityCompleted += produced;
    this.quantityScrapped += scrapped;
    this.updatedAt = new Date();
  }

  public static rehydrate(props: ProductionOrderProps): ProductionOrder {
    return new ProductionOrder(props);
  }
}
