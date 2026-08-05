import { ObjectId } from "@ananya/core";

export type MaintenanceStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type ServiceFrequency = "MONTHLY" | "QUARTERLY" | "BIANNUAL" | "ANNUAL";

export interface MaintenanceScheduleProps {
  id: string;
  scheduleNumber: string;
  customerId: string;
  assetName: string;
  serialNumber?: string;
  frequency: ServiceFrequency;
  nextVisitDate: Date;
  assignedTechnician?: string;
  status: MaintenanceStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMaintenanceScheduleProps {
  scheduleNumber: string;
  customerId: string;
  assetName: string;
  serialNumber?: string;
  frequency: ServiceFrequency;
  nextVisitDate: Date;
  assignedTechnician?: string;
  notes?: string;
}

export class MaintenanceSchedule implements MaintenanceScheduleProps {
  public readonly id: string;
  public scheduleNumber: string;
  public customerId: string;
  public assetName: string;
  public serialNumber?: string;
  public frequency: ServiceFrequency;
  public nextVisitDate: Date;
  public assignedTechnician?: string;
  public status: MaintenanceStatus;
  public notes?: string;
  public readonly createdAt: Date;
  public updatedAt: Date;

  private constructor(props: MaintenanceScheduleProps) {
    this.id = props.id;
    this.scheduleNumber = props.scheduleNumber;
    this.customerId = props.customerId;
    this.assetName = props.assetName;
    this.serialNumber = props.serialNumber;
    this.frequency = props.frequency;
    this.nextVisitDate = props.nextVisitDate;
    this.assignedTechnician = props.assignedTechnician;
    this.status = props.status;
    this.notes = props.notes;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    props: CreateMaintenanceScheduleProps,
  ): MaintenanceSchedule {
    if (!props.customerId || props.customerId.trim() === "") {
      throw new Error("Maintenance schedule requires a valid customerId");
    }
    if (!props.assetName || props.assetName.trim() === "") {
      throw new Error("Maintenance asset name is required");
    }

    const now = new Date();
    return new MaintenanceSchedule({
      id: ObjectId.generate().value,
      scheduleNumber: props.scheduleNumber,
      customerId: props.customerId,
      assetName: props.assetName.trim(),
      serialNumber: props.serialNumber,
      frequency: props.frequency,
      nextVisitDate: props.nextVisitDate,
      assignedTechnician: props.assignedTechnician,
      status: "ACTIVE",
      notes: props.notes?.trim(),
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(
    props: MaintenanceScheduleProps,
  ): MaintenanceSchedule {
    return new MaintenanceSchedule(props);
  }

  public pause(): void {
    if (this.status !== "ACTIVE") {
      throw new Error(`Only ACTIVE schedules can be paused`);
    }
    this.status = "PAUSED";
    this.updatedAt = new Date();
  }

  public resume(): void {
    if (this.status !== "PAUSED") {
      throw new Error(`Only PAUSED schedules can be resumed`);
    }
    this.status = "ACTIVE";
    this.updatedAt = new Date();
  }

  public completeVisit(): void {
    if (this.status !== "ACTIVE") {
      throw new Error(`Only ACTIVE maintenance schedules can complete visits`);
    }
    const nextDate = new Date(this.nextVisitDate);
    switch (this.frequency) {
      case "MONTHLY":
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case "QUARTERLY":
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case "BIANNUAL":
        nextDate.setMonth(nextDate.getMonth() + 6);
        break;
      case "ANNUAL":
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }
    this.nextVisitDate = nextDate;
    this.updatedAt = new Date();
  }

  public completePlan(): void {
    if (this.status === "CANCELLED") {
      throw new Error("Cancelled schedules cannot be completed");
    }
    this.status = "COMPLETED";
    this.updatedAt = new Date();
  }

  public cancel(): void {
    if (this.status === "COMPLETED") {
      throw new Error("Completed schedules cannot be cancelled");
    }
    this.status = "CANCELLED";
    this.updatedAt = new Date();
  }
}
