import { ObjectId } from "@ananya/core";

export type WorkOrderStatus =
  "CREATED" | "ASSIGNED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type WorkOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface WorkOrderProps {
  id: string;
  workOrderNumber: string;
  serviceRequestId: string;
  assignedTechnician?: string;
  title: string;
  description?: string;
  plannedHours: number;
  actualHours: number;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWorkOrderProps {
  workOrderNumber: string;
  serviceRequestId: string;
  assignedTechnician?: string;
  title: string;
  description?: string;
  plannedHours: number;
  priority?: WorkOrderPriority;
}

export class WorkOrder implements WorkOrderProps {
  public readonly id: string;
  public workOrderNumber: string;
  public serviceRequestId: string;
  public assignedTechnician?: string;
  public title: string;
  public description?: string;
  public plannedHours: number;
  public actualHours: number;
  public priority: WorkOrderPriority;
  public status: WorkOrderStatus;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: WorkOrderProps) {
    this.id = props.id;
    this.workOrderNumber = props.workOrderNumber;
    this.serviceRequestId = props.serviceRequestId;
    this.assignedTechnician = props.assignedTechnician;
    this.title = props.title;
    this.description = props.description;
    this.plannedHours = props.plannedHours;
    this.actualHours = props.actualHours;
    this.priority = props.priority;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(props: CreateWorkOrderProps): WorkOrder {
    if (!props.serviceRequestId || props.serviceRequestId.trim() === "") {
      throw new Error("Work Order requires a valid serviceRequestId");
    }
    if (!props.title || props.title.trim() === "") {
      throw new Error("Work Order title is required");
    }
    if (props.plannedHours < 0) {
      throw new Error("Planned hours cannot be negative");
    }

    const now = new Date();
    return new WorkOrder({
      id: ObjectId.generate().value,
      workOrderNumber: props.workOrderNumber,
      serviceRequestId: props.serviceRequestId,
      assignedTechnician: props.assignedTechnician,
      title: props.title.trim(),
      description: props.description?.trim(),
      plannedHours: props.plannedHours,
      actualHours: 0,
      priority: props.priority || "MEDIUM",
      status: props.assignedTechnician ? "ASSIGNED" : "CREATED",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: WorkOrderProps): WorkOrder {
    return new WorkOrder(props);
  }

  public assign(technician: string): void {
    if (this.status === "COMPLETED" || this.status === "CANCELLED") {
      throw new Error(`Cannot assign work order in status ${this.status}`);
    }
    this.assignedTechnician = technician;
    this.status = "ASSIGNED";
    this.updatedAt = new Date();
  }

  public start(): void {
    if (this.status === "COMPLETED" || this.status === "CANCELLED") {
      throw new Error(`Cannot start work order in status ${this.status}`);
    }
    this.status = "IN_PROGRESS";
    this.updatedAt = new Date();
  }

  public pause(): void {
    if (this.status !== "IN_PROGRESS") {
      throw new Error(`Only work orders IN_PROGRESS can be paused`);
    }
    this.status = "PAUSED";
    this.updatedAt = new Date();
  }

  public logHours(hours: number): void {
    if (this.status === "COMPLETED" || this.status === "CANCELLED") {
      throw new Error(
        `Cannot log hours against work order in status ${this.status}`,
      );
    }
    if (hours <= 0) {
      throw new Error("Hours logged must be positive");
    }
    this.actualHours += hours;
    this.updatedAt = new Date();
  }

  public complete(): void {
    if (this.status === "CANCELLED") {
      throw new Error("Cancelled work orders cannot be completed");
    }
    this.status = "COMPLETED";
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === "COMPLETED") {
      throw new Error("Completed work orders cannot be cancelled");
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }
}
