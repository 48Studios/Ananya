export interface CreateCapacityPlanProps {
  planningRunId: string;
  workCenterId: string;
  workCenterName: string;
  availableCapacityHours: number;
  plannedCapacityHours: number;
}

export interface RehydrateCapacityPlanProps {
  id: string;
  planningRunId: string;
  workCenterId: string;
  workCenterName: string;
  availableCapacityHours: number;
  plannedCapacityHours: number;
  utilizationPercentage: number;
  isOverloaded: boolean;
  createdAt: Date;
}

export class InvalidCapacityPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCapacityPlanError';
  }
}

export class CapacityPlan {
  public readonly id: string;
  private _planningRunId: string;
  private _workCenterId: string;
  private _workCenterName: string;
  private _availableCapacityHours: number;
  private _plannedCapacityHours: number;
  private _utilizationPercentage: number;
  private _isOverloaded: boolean;
  private _createdAt: Date;

  private constructor(props: RehydrateCapacityPlanProps) {
    this.id = props.id;
    this._planningRunId = props.planningRunId;
    this._workCenterId = props.workCenterId;
    this._workCenterName = props.workCenterName;
    this._availableCapacityHours = props.availableCapacityHours;
    this._plannedCapacityHours = props.plannedCapacityHours;
    this._utilizationPercentage = props.utilizationPercentage;
    this._isOverloaded = props.isOverloaded;
    this._createdAt = props.createdAt;
  }

  public static create(props: CreateCapacityPlanProps): CapacityPlan {
    if (!props.planningRunId || props.planningRunId.trim().length === 0) {
      throw new InvalidCapacityPlanError('Planning run ID is required.');
    }
    if (!props.workCenterId || props.workCenterId.trim().length === 0) {
      throw new InvalidCapacityPlanError('Work center ID is required.');
    }
    if (!props.workCenterName || props.workCenterName.trim().length === 0) {
      throw new InvalidCapacityPlanError('Work center name is required.');
    }
    if (props.availableCapacityHours <= 0) {
      throw new InvalidCapacityPlanError('Available capacity must be greater than zero hours.');
    }

    const util = (props.plannedCapacityHours / props.availableCapacityHours) * 100;
    const overloaded = props.plannedCapacityHours > props.availableCapacityHours;

    return new CapacityPlan({
      id: crypto.randomUUID(),
      planningRunId: props.planningRunId,
      workCenterId: props.workCenterId,
      workCenterName: props.workCenterName.trim(),
      availableCapacityHours: props.availableCapacityHours,
      plannedCapacityHours: props.plannedCapacityHours,
      utilizationPercentage: Math.round(util * 100) / 100,
      isOverloaded: overloaded,
      createdAt: new Date(),
    });
  }

  public static rehydrate(props: RehydrateCapacityPlanProps): CapacityPlan {
    return new CapacityPlan(props);
  }

  public get planningRunId(): string {
    return this._planningRunId;
  }

  public get workCenterId(): string {
    return this._workCenterId;
  }

  public get workCenterName(): string {
    return this._workCenterName;
  }

  public get availableCapacityHours(): number {
    return this._availableCapacityHours;
  }

  public get plannedCapacityHours(): number {
    return this._plannedCapacityHours;
  }

  public get utilizationPercentage(): number {
    return this._utilizationPercentage;
  }

  public get isOverloaded(): boolean {
    return this._isOverloaded;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }
}
