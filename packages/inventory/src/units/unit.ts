import { ObjectId } from "@ananya/core";
import { InvalidUnitNameError, InvalidUnitCategoryError } from "./unit.errors";

export interface UnitProps {
  id: string;
  name: string;
  category: string;
  isBaseUnit: boolean;
  conversionFactor?: number | null;
  precision: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUnitInput {
  name: string;
  category: string;
  isBaseUnit: boolean;
  conversionFactor?: number | null;
  precision: number;
}

export interface UpdateUnitInput {
  name?: string;
  category?: string;
  isBaseUnit?: boolean;
  conversionFactor?: number | null;
  precision?: number;
  isActive?: boolean;
}

export class Unit {
  public readonly id: string;
  public readonly name: string;
  public readonly category: string;
  public readonly isBaseUnit: boolean;
  public readonly conversionFactor?: number | null;
  public readonly precision: number;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: UnitProps) {
    this.id = props.id;
    this.name = props.name;
    this.category = props.category;
    this.isBaseUnit = props.isBaseUnit;
    this.conversionFactor = props.conversionFactor;
    this.precision = props.precision;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Creates a new Unit aggregate.
   * Owns identity generation, timestamps, defaults, normalization, and invariants.
   */
  public static create(input: CreateUnitInput): Unit {
    // Normalize name: trim
    const name = input.name.trim();

    // Normalize category: trim
    const category = input.category.trim();

    // Validate required fields
    if (!name) {
      throw new InvalidUnitNameError("Unit name is required");
    }

    if (!category) {
      throw new InvalidUnitCategoryError("Unit category is required");
    }

    // Validate conversion factor for non-base units
    if (
      !input.isBaseUnit &&
      (input.conversionFactor === undefined || input.conversionFactor === null)
    ) {
      throw new InvalidUnitCategoryError(
        "Non-base units must have a conversion factor",
      );
    }

    // Validate conversion factor is positive
    if (
      input.conversionFactor !== undefined &&
      input.conversionFactor !== null &&
      input.conversionFactor <= 0
    ) {
      throw new InvalidUnitCategoryError(
        "Conversion factor must be greater than zero",
      );
    }

    // Generate identity and timestamps
    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new Unit({
      id,
      name,
      category,
      isBaseUnit: input.isBaseUnit,
      conversionFactor: input.conversionFactor,
      precision: input.precision,
      isActive: true, // Default to active
      createdAt,
      updatedAt,
    });
  }

  /**
   * Rehydrates an existing Unit from persistence.
   * Reconstructs state exactly as stored without validation or normalization.
   * Used only by repositories when loading from the database.
   */
  public static rehydrate(props: UnitProps): Unit {
    return new Unit(props);
  }

  /**
   * Updates existing Unit props while validating business invariants.
   */
  public update(input: UpdateUnitInput): Unit {
    const name = input.name !== undefined ? input.name.trim() : this.name;
    const category =
      input.category !== undefined ? input.category.trim() : this.category;
    const isBaseUnit =
      input.isBaseUnit !== undefined ? input.isBaseUnit : this.isBaseUnit;
    const conversionFactor =
      input.conversionFactor !== undefined
        ? input.conversionFactor
        : this.conversionFactor;
    const precision =
      input.precision !== undefined ? input.precision : this.precision;
    const isActive =
      input.isActive !== undefined ? input.isActive : this.isActive;

    if (!name) {
      throw new InvalidUnitNameError("Unit name is required");
    }

    if (!category) {
      throw new InvalidUnitCategoryError("Unit category is required");
    }

    if (
      !isBaseUnit &&
      (conversionFactor === undefined || conversionFactor === null)
    ) {
      throw new InvalidUnitCategoryError(
        "Non-base units must have a conversion factor",
      );
    }

    if (
      conversionFactor !== undefined &&
      conversionFactor !== null &&
      conversionFactor <= 0
    ) {
      throw new InvalidUnitCategoryError(
        "Conversion factor must be greater than zero",
      );
    }

    return new Unit({
      id: this.id,
      name,
      category,
      isBaseUnit,
      conversionFactor,
      precision,
      isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Converts a quantity from this unit to the base unit.
   * Only applicable for non-base units with a conversion factor.
   */
  public convertToBase(quantity: number): number {
    if (this.isBaseUnit) {
      return quantity;
    }

    if (this.conversionFactor === undefined || this.conversionFactor === null) {
      throw new Error(
        `Cannot convert from ${this.name}: no conversion factor defined`,
      );
    }

    return quantity * this.conversionFactor;
  }

  /**
   * Converts a quantity from the base unit to this unit.
   * Only applicable for non-base units with a conversion factor.
   */
  public convertFromBase(quantity: number): number {
    if (this.isBaseUnit) {
      return quantity;
    }

    if (this.conversionFactor === undefined || this.conversionFactor === null) {
      throw new Error(
        `Cannot convert to ${this.name}: no conversion factor defined`,
      );
    }

    return quantity / this.conversionFactor;
  }
}
