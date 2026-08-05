export type ProductionRecommendationStatus =
  "PENDING" | "ACCEPTED" | "REJECTED" | "IMPLEMENTED";

export interface CreateProductionRecommendationProps {
  planningRunId: string;
  productId: string;
  suggestedQuantity: number;
  suggestedStart: Date;
  suggestedCompletion: Date;
  manufacturingRoute?: string;
}

export interface RehydrateProductionRecommendationProps {
  id: string;
  planningRunId: string;
  productId: string;
  suggestedQuantity: number;
  suggestedStart: Date;
  suggestedCompletion: Date;
  manufacturingRoute?: string;
  status: ProductionRecommendationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class InvalidProductionRecommendationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidProductionRecommendationError";
  }
}

export class ProductionRecommendation {
  public readonly id: string;
  private _planningRunId: string;
  private _productId: string;
  private _suggestedQuantity: number;
  private _suggestedStart: Date;
  private _suggestedCompletion: Date;
  private _manufacturingRoute?: string;
  private _status: ProductionRecommendationStatus;
  private _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: RehydrateProductionRecommendationProps) {
    this.id = props.id;
    this._planningRunId = props.planningRunId;
    this._productId = props.productId;
    this._suggestedQuantity = props.suggestedQuantity;
    this._suggestedStart = props.suggestedStart;
    this._suggestedCompletion = props.suggestedCompletion;
    this._manufacturingRoute = props.manufacturingRoute;
    this._status = props.status;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(
    props: CreateProductionRecommendationProps,
  ): ProductionRecommendation {
    if (!props.planningRunId || props.planningRunId.trim().length === 0) {
      throw new InvalidProductionRecommendationError(
        "Planning run ID is required.",
      );
    }
    if (!props.productId || props.productId.trim().length === 0) {
      throw new InvalidProductionRecommendationError("Product ID is required.");
    }
    if (props.suggestedQuantity <= 0) {
      throw new InvalidProductionRecommendationError(
        "Suggested quantity must be greater than zero.",
      );
    }
    if (props.suggestedStart > props.suggestedCompletion) {
      throw new InvalidProductionRecommendationError(
        "Suggested start date cannot be after completion date.",
      );
    }

    const now = new Date();
    return new ProductionRecommendation({
      id: crypto.randomUUID(),
      planningRunId: props.planningRunId,
      productId: props.productId,
      suggestedQuantity: props.suggestedQuantity,
      suggestedStart: props.suggestedStart,
      suggestedCompletion: props.suggestedCompletion,
      manufacturingRoute: props.manufacturingRoute,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    });
  }

  public static rehydrate(
    props: RehydrateProductionRecommendationProps,
  ): ProductionRecommendation {
    return new ProductionRecommendation(props);
  }

  public get planningRunId(): string {
    return this._planningRunId;
  }

  public get productId(): string {
    return this._productId;
  }

  public get suggestedQuantity(): number {
    return this._suggestedQuantity;
  }

  public get suggestedStart(): Date {
    return this._suggestedStart;
  }

  public get suggestedCompletion(): Date {
    return this._suggestedCompletion;
  }

  public get manufacturingRoute(): string | undefined {
    return this._manufacturingRoute;
  }

  public get status(): ProductionRecommendationStatus {
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
      throw new InvalidProductionRecommendationError(
        `Cannot accept recommendation in status ${this._status}.`,
      );
    }
    this._status = "ACCEPTED";
    this._updatedAt = new Date();
  }

  public reject(): void {
    if (this._status !== "PENDING") {
      throw new InvalidProductionRecommendationError(
        `Cannot reject recommendation in status ${this._status}.`,
      );
    }
    this._status = "REJECTED";
    this._updatedAt = new Date();
  }

  public markImplemented(): void {
    if (this._status !== "ACCEPTED") {
      throw new InvalidProductionRecommendationError(
        `Cannot implement recommendation in status ${this._status}.`,
      );
    }
    this._status = "IMPLEMENTED";
    this._updatedAt = new Date();
  }
}
