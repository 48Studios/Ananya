export type RequirementSource =
  | 'SALES_ORDER'
  | 'MANUFACTURING'
  | 'PROJECT'
  | 'FORECAST';

export interface CreateMaterialRequirementProps {
  planningRunId: string;
  componentId: string;
  requiredQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  requiredDate: Date;
  source: RequirementSource;
  sourceReferenceId?: string;
}

export interface RehydrateMaterialRequirementProps {
  id: string;
  planningRunId: string;
  componentId: string;
  requiredQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  shortageQuantity: number;
  requiredDate: Date;
  source: RequirementSource;
  sourceReferenceId?: string;
  createdAt: Date;
}

export class InvalidMaterialRequirementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMaterialRequirementError';
  }
}

export class MaterialRequirement {
  public readonly id: string;
  private _planningRunId: string;
  private _componentId: string;
  private _requiredQuantity: number;
  private _availableQuantity: number;
  private _reservedQuantity: number;
  private _shortageQuantity: number;
  private _requiredDate: Date;
  private _source: RequirementSource;
  private _sourceReferenceId?: string;
  private _createdAt: Date;

  private constructor(props: RehydrateMaterialRequirementProps) {
    this.id = props.id;
    this._planningRunId = props.planningRunId;
    this._componentId = props.componentId;
    this._requiredQuantity = props.requiredQuantity;
    this._availableQuantity = props.availableQuantity;
    this._reservedQuantity = props.reservedQuantity;
    this._shortageQuantity = props.shortageQuantity;
    this._requiredDate = props.requiredDate;
    this._source = props.source;
    this._sourceReferenceId = props.sourceReferenceId;
    this._createdAt = props.createdAt;
  }

  public static create(
    props: CreateMaterialRequirementProps,
  ): MaterialRequirement {
    if (!props.planningRunId || props.planningRunId.trim().length === 0) {
      throw new InvalidMaterialRequirementError('Planning run ID is required.');
    }
    if (!props.componentId || props.componentId.trim().length === 0) {
      throw new InvalidMaterialRequirementError('Component ID is required.');
    }
    if (props.requiredQuantity <= 0) {
      throw new InvalidMaterialRequirementError('Required quantity must be greater than zero.');
    }

    const netAvailable = Math.max(0, props.availableQuantity - props.reservedQuantity);
    const shortage = Math.max(0, props.requiredQuantity - netAvailable);

    return new MaterialRequirement({
      id: crypto.randomUUID(),
      planningRunId: props.planningRunId,
      componentId: props.componentId,
      requiredQuantity: props.requiredQuantity,
      availableQuantity: props.availableQuantity,
      reservedQuantity: props.reservedQuantity,
      shortageQuantity: shortage,
      requiredDate: props.requiredDate,
      source: props.source,
      sourceReferenceId: props.sourceReferenceId,
      createdAt: new Date(),
    });
  }

  public static rehydrate(
    props: RehydrateMaterialRequirementProps,
  ): MaterialRequirement {
    return new MaterialRequirement(props);
  }

  public get planningRunId(): string {
    return this._planningRunId;
  }

  public get componentId(): string {
    return this._componentId;
  }

  public get requiredQuantity(): number {
    return this._requiredQuantity;
  }

  public get availableQuantity(): number {
    return this._availableQuantity;
  }

  public get reservedQuantity(): number {
    return this._reservedQuantity;
  }

  public get shortageQuantity(): number {
    return this._shortageQuantity;
  }

  public get requiredDate(): Date {
    return this._requiredDate;
  }

  public get source(): RequirementSource {
    return this._source;
  }

  public get sourceReferenceId(): string | undefined {
    return this._sourceReferenceId;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }
}
