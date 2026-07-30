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

export type ProductionOrderPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

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
  locationId?: string | null;
  status: ProductionOrderStatus;
  priority?: ProductionOrderPriority;
  quantityPlanned: number;
  quantityCompleted: number;
  quantityScrapped: number;
  startDate?: Date | null;
  endDate?: Date | null;
  notes?: string | null;
  createdBy?: string | null;
  operations?: ProductionOrderOperationProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductionOrderInput {
  productionNumber: string;
  bomId: string;
  componentId: string;
  locationId?: string | null;
  priority?: ProductionOrderPriority;
  quantityPlanned: number;
  startDate?: Date | null;
  endDate?: Date | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface UpdateProductionOrderInput {
  locationId?: string | null;
  priority?: ProductionOrderPriority;
  quantityPlanned?: number;
  startDate?: Date | null;
  endDate?: Date | null;
  notes?: string | null;
}

export class ProductionOrder {
  public readonly id: string;
  public readonly productionNumber: string;
  public readonly bomId: string;
  public readonly componentId: string;
  public locationId?: string | null;
  public status: ProductionOrderStatus;
  public priority: ProductionOrderPriority;
  public quantityPlanned: number;
  public quantityCompleted: number;
  public quantityScrapped: number;
  public startDate?: Date | null;
  public endDate?: Date | null;
  public notes?: string | null;
  public createdBy?: string | null;
  public readonly operations: ProductionOrderOperationProps[];
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: ProductionOrderProps) {
    this.id = props.id;
    this.productionNumber = props.productionNumber;
    this.bomId = props.bomId;
    this.componentId = props.componentId;
    this.locationId = props.locationId ?? null;
    this.status = props.status;
    this.priority = props.priority ?? "NORMAL";
    this.quantityPlanned = props.quantityPlanned;
    this.quantityCompleted = props.quantityCompleted;
    this.quantityScrapped = props.quantityScrapped;
    this.startDate = props.startDate ?? null;
    this.endDate = props.endDate ?? null;
    this.notes = props.notes ?? null;
    this.createdBy = props.createdBy ?? null;
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
      locationId: input.locationId ?? null,
      status: "DRAFT",
      priority: input.priority ?? "NORMAL",
      quantityPlanned: input.quantityPlanned,
      quantityCompleted: 0,
      quantityScrapped: 0,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      notes: input.notes?.trim() ?? null,
      createdBy: input.createdBy?.trim() ?? null,
      operations: [],
      createdAt,
      updatedAt: createdAt,
    });
  }

  public updateHeader(input: UpdateProductionOrderInput): void {
    if (this.status !== "DRAFT") {
      throw new InvalidProductionOrderStatusTransitionError(
        this.status,
        "DRAFT (Edit)",
      );
    }
    if (input.quantityPlanned !== undefined) {
      if (input.quantityPlanned <= 0) {
        throw new InvalidProductionQuantityError(
          "Planned quantity must be greater than zero.",
        );
      }
      this.quantityPlanned = input.quantityPlanned;
    }
    if (input.locationId !== undefined) this.locationId = input.locationId;
    if (input.priority !== undefined) this.priority = input.priority;
    if (input.startDate !== undefined) this.startDate = input.startDate;
    if (input.endDate !== undefined) this.endDate = input.endDate;
    if (input.notes !== undefined) this.notes = input.notes;
    this.updatedAt = new Date();
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
      this.status !== "MATERIAL_ALLOCATED" &&
      this.status !== "DRAFT"
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

  public pause(): void {
    if (this.status !== "IN_PROGRESS") {
      throw new InvalidProductionOrderStatusTransitionError(
        this.status,
        "PAUSED",
      );
    }
    this.updatedAt = new Date();
  }

  public resume(): void {
    this.status = "IN_PROGRESS";
    this.updatedAt = new Date();
  }

  public recordOutput(produced: number, scrapped: number = 0): void {
    this.quantityCompleted += produced;
    this.quantityScrapped += scrapped;
    if (this.quantityCompleted >= this.quantityPlanned) {
      this.status = "COMPLETED";
      this.endDate = this.endDate ?? new Date();
    } else {
      this.status = "IN_PROGRESS";
    }
    this.updatedAt = new Date();
  }

  public complete(producedQty?: number): void {
    this.status = "COMPLETED";
    if (producedQty !== undefined) {
      this.quantityCompleted = producedQty;
    } else if (this.quantityCompleted === 0) {
      this.quantityCompleted = this.quantityPlanned;
    }
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
