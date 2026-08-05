export type PlanningRunStatus = "DRAFT" | "RUNNING" | "COMPLETED" | "CANCELLED";

export interface CreatePlanningRunProps {
  runNumber: string;
  horizonDays: number;
  startedBy: string;
}

export interface RehydratePlanningRunProps {
  id: string;
  runNumber: string;
  horizonDays: number;
  status: PlanningRunStatus;
  startedBy: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class InvalidPlanningRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlanningRunError";
  }
}

export class PlanningRun {
  public readonly id: string;
  private _runNumber: string;
  private _horizonDays: number;
  private _status: PlanningRunStatus;
  private _startedBy: string;
  private _completedAt?: Date;
  private _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: RehydratePlanningRunProps) {
    this.id = props.id;
    this._runNumber = props.runNumber;
    this._horizonDays = props.horizonDays;
    this._status = props.status;
    this._startedBy = props.startedBy;
    this._completedAt = props.completedAt;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreatePlanningRunProps): PlanningRun {
    if (!props.runNumber || props.runNumber.trim().length === 0) {
      throw new InvalidPlanningRunError("Run number cannot be empty.");
    }
    if (props.horizonDays <= 0) {
      throw new InvalidPlanningRunError(
        "Planning horizon must be greater than zero days.",
      );
    }
    if (!props.startedBy || props.startedBy.trim().length === 0) {
      throw new InvalidPlanningRunError("Started by user must be specified.");
    }

    const now = new Date();
    return new PlanningRun({
      id: crypto.randomUUID(),
      runNumber: props.runNumber.trim().toUpperCase(),
      horizonDays: props.horizonDays,
      status: "DRAFT",
      startedBy: props.startedBy.trim(),
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(props: RehydratePlanningRunProps): PlanningRun {
    return new PlanningRun(props);
  }

  public get runNumber(): string {
    return this._runNumber;
  }

  public get horizonDays(): number {
    return this._horizonDays;
  }

  public get status(): PlanningRunStatus {
    return this._status;
  }

  public get startedBy(): string {
    return this._startedBy;
  }

  public get completedAt(): Date | undefined {
    return this._completedAt;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public start(): void {
    if (this._status !== "DRAFT") {
      throw new InvalidPlanningRunError(
        `Cannot start planning run in status ${this._status}.`,
      );
    }
    this._status = "RUNNING";
    this._updatedAt = new Date();
  }

  public complete(): void {
    if (this._status !== "RUNNING" && this._status !== "DRAFT") {
      throw new InvalidPlanningRunError(
        `Cannot complete planning run in status ${this._status}.`,
      );
    }
    const now = new Date();
    this._status = "COMPLETED";
    this._completedAt = now;
    this._updatedAt = now;
  }

  public cancel(): void {
    if (this._status === "COMPLETED") {
      throw new InvalidPlanningRunError(
        "Cannot cancel a completed planning run.",
      );
    }
    this._status = "CANCELLED";
    this._updatedAt = new Date();
  }
}
