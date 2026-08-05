export type PurchaseRecommendationStatus =
  "PENDING" | "ACCEPTED" | "REJECTED" | "IMPLEMENTED";

export interface CreatePurchaseRecommendationProps {
  planningRunId: string;
  componentId: string;
  supplierId?: string;
  suggestedQuantity: number;
  requiredDate: Date;
  recommendationReason: string;
}

export interface RehydratePurchaseRecommendationProps {
  id: string;
  planningRunId: string;
  componentId: string;
  supplierId?: string;
  suggestedQuantity: number;
  requiredDate: Date;
  recommendationReason: string;
  status: PurchaseRecommendationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class InvalidPurchaseRecommendationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPurchaseRecommendationError";
  }
}

export class PurchaseRecommendation {
  public readonly id: string;
  private _planningRunId: string;
  private _componentId: string;
  private _supplierId?: string;
  private _suggestedQuantity: number;
  private _requiredDate: Date;
  private _recommendationReason: string;
  private _status: PurchaseRecommendationStatus;
  private _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: RehydratePurchaseRecommendationProps) {
    this.id = props.id;
    this._planningRunId = props.planningRunId;
    this._componentId = props.componentId;
    this._supplierId = props.supplierId;
    this._suggestedQuantity = props.suggestedQuantity;
    this._requiredDate = props.requiredDate;
    this._recommendationReason = props.recommendationReason;
    this._status = props.status;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(
    props: CreatePurchaseRecommendationProps,
  ): PurchaseRecommendation {
    if (!props.planningRunId || props.planningRunId.trim().length === 0) {
      throw new InvalidPurchaseRecommendationError(
        "Planning run ID is required.",
      );
    }
    if (!props.componentId || props.componentId.trim().length === 0) {
      throw new InvalidPurchaseRecommendationError("Component ID is required.");
    }
    if (props.suggestedQuantity <= 0) {
      throw new InvalidPurchaseRecommendationError(
        "Suggested quantity must be greater than zero.",
      );
    }
    if (
      !props.recommendationReason ||
      props.recommendationReason.trim().length === 0
    ) {
      throw new InvalidPurchaseRecommendationError(
        "Recommendation reason is required.",
      );
    }

    const now = new Date();
    return new PurchaseRecommendation({
      id: crypto.randomUUID(),
      planningRunId: props.planningRunId,
      componentId: props.componentId,
      supplierId: props.supplierId,
      suggestedQuantity: props.suggestedQuantity,
      requiredDate: props.requiredDate,
      recommendationReason: props.recommendationReason.trim(),
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(
    props: RehydratePurchaseRecommendationProps,
  ): PurchaseRecommendation {
    return new PurchaseRecommendation(props);
  }

  public get planningRunId(): string {
    return this._planningRunId;
  }

  public get componentId(): string {
    return this._componentId;
  }

  public get supplierId(): string | undefined {
    return this._supplierId;
  }

  public get suggestedQuantity(): number {
    return this._suggestedQuantity;
  }

  public get requiredDate(): Date {
    return this._requiredDate;
  }

  public get recommendationReason(): string {
    return this._recommendationReason;
  }

  public get status(): PurchaseRecommendationStatus {
    return this._status;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public accept(): void {
    if (this._status !== "PENDING") {
      throw new InvalidPurchaseRecommendationError(
        `Cannot accept recommendation in status ${this._status}.`,
      );
    }
    this._status = "ACCEPTED";
    this._updatedAt = new Date();
  }

  public reject(): void {
    if (this._status !== "PENDING") {
      throw new InvalidPurchaseRecommendationError(
        `Cannot reject recommendation in status ${this._status}.`,
      );
    }
    this._status = "REJECTED";
    this._updatedAt = new Date();
  }

  public markImplemented(): void {
    if (this._status !== "ACCEPTED") {
      throw new InvalidPurchaseRecommendationError(
        `Cannot implement recommendation in status ${this._status}.`,
      );
    }
    this._status = "IMPLEMENTED";
    this._updatedAt = new Date();
  }
}
