import { ObjectId } from "@ananya/core";
import {
  InvalidComponentSkuError,
  InvalidComponentNameError,
  InvalidUnitError,
} from "./component.errors";

export interface ComponentProps {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateComponentInput {
  sku: string;
  name: string;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit: string;
}

export interface UpdateComponentInput {
  sku?: string;
  name?: string;
  description?: string | null;
  manufacturerId?: string | null;
  categoryId?: string | null;
  defaultLocationId?: string | null;
  unit?: string;
  isActive?: boolean;
}

export interface FindManyComponentsOptions {}

export class Component {
  public readonly id: string;
  public readonly sku: string;
  public readonly name: string;
  public readonly description?: string | null;
  public readonly manufacturerId?: string | null;
  public readonly categoryId?: string | null;
  public readonly defaultLocationId?: string | null;
  public readonly unit: string;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: ComponentProps) {
    this.id = props.id;
    this.sku = props.sku;
    this.name = props.name;
    this.description = props.description;
    this.manufacturerId = props.manufacturerId;
    this.categoryId = props.categoryId;
    this.defaultLocationId = props.defaultLocationId;
    this.unit = props.unit;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Creates a new Component aggregate.
   * Owns identity generation, timestamps, defaults, normalization, and invariants.
   */
  public static create(input: CreateComponentInput): Component {
    const sku = input.sku.trim().toLowerCase();
    const name = input.name.trim();
    const unit = input.unit.trim();

    if (!sku) {
      throw new InvalidComponentSkuError("SKU is required");
    }

    if (!name) {
      throw new InvalidComponentNameError("Name is required");
    }

    if (!unit) {
      throw new InvalidUnitError("Unit is required");
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new Component({
      id,
      sku,
      name,
      description: input.description?.trim() ?? null,
      manufacturerId: input.manufacturerId ?? null,
      categoryId: input.categoryId ?? null,
      defaultLocationId: input.defaultLocationId ?? null,
      unit,
      isActive: true,
      createdAt,
      updatedAt,
    });
  }

  /**
   * Updates component properties maintaining invariants.
   */
  public update(input: UpdateComponentInput): Component {
    const sku =
      input.sku !== undefined ? input.sku.trim().toLowerCase() : this.sku;
    const name = input.name !== undefined ? input.name.trim() : this.name;
    const unit = input.unit !== undefined ? input.unit.trim() : this.unit;

    if (!sku) {
      throw new InvalidComponentSkuError("SKU is required");
    }

    if (!name) {
      throw new InvalidComponentNameError("Name is required");
    }

    if (!unit) {
      throw new InvalidUnitError("Unit is required");
    }

    return new Component({
      id: this.id,
      sku,
      name,
      description:
        input.description !== undefined
          ? (input.description?.trim() ?? null)
          : this.description,
      manufacturerId:
        input.manufacturerId !== undefined
          ? input.manufacturerId
          : this.manufacturerId,
      categoryId:
        input.categoryId !== undefined ? input.categoryId : this.categoryId,
      defaultLocationId:
        input.defaultLocationId !== undefined
          ? input.defaultLocationId
          : this.defaultLocationId,
      unit,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Rehydrates an existing Component from persistence.
   */
  public static rehydrate(props: ComponentProps): Component {
    return new Component(props);
  }
}
