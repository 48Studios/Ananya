import { ObjectId } from "@ananya/core";
import {
  InvalidManufacturerCodeError,
  InvalidManufacturerNameError,
} from "./manufacturer.errors";

export interface ManufacturerProps {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateManufacturerInput {
  code: string;
  name: string;
}

export interface UpdateManufacturerInput {
  code?: string;
  name?: string;
  isActive?: boolean;
}

export class Manufacturer {
  public readonly id: string;
  public readonly code: string;
  public readonly name: string;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: ManufacturerProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Creates a new Manufacturer aggregate.
   * Owns identity generation, timestamps, defaults, normalization, and invariants.
   */
  public static create(input: CreateManufacturerInput): Manufacturer {
    const code = input.code.trim().toLowerCase();
    const name = input.name.trim();

    if (!code) {
      throw new InvalidManufacturerCodeError("Manufacturer code is required");
    }

    if (!name) {
      throw new InvalidManufacturerNameError("Manufacturer name is required");
    }

    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new Manufacturer({
      id,
      code,
      name,
      isActive: true,
      createdAt,
      updatedAt,
    });
  }

  /**
   * Updates manufacturer parameters maintaining invariants.
   */
  public update(input: UpdateManufacturerInput): Manufacturer {
    const code = input.code !== undefined ? input.code.trim().toLowerCase() : this.code;
    const name = input.name !== undefined ? input.name.trim() : this.name;

    if (!code) {
      throw new InvalidManufacturerCodeError("Manufacturer code is required");
    }

    if (!name) {
      throw new InvalidManufacturerNameError("Manufacturer name is required");
    }

    return new Manufacturer({
      id: this.id,
      code,
      name,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Rehydrates an existing Manufacturer from persistence.
   */
  public static rehydrate(props: ManufacturerProps): Manufacturer {
    return new Manufacturer(props);
  }
}
