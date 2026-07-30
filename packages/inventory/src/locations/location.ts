import { ObjectId } from "@ananya/core";
import {
  InvalidLocationCodeError,
  InvalidLocationNameError,
  InvalidLocationKindError,
} from "./location.errors";

export interface LocationProps {
  id: string;
  code: string;
  name: string;
  kind: string;
  parentId: string | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLocationInput {
  code: string;
  name: string;
  kind: string;
  parentId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateLocationInput {
  code?: string;
  name?: string;
  kind?: string;
  parentId?: string | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export class Location {
  public readonly id: string;
  public readonly code: string;
  public readonly name: string;
  public readonly kind: string;
  public readonly parentId: string | null;
  public readonly isActive: boolean;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: LocationProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.kind = props.kind;
    this.parentId = props.parentId;
    this.isActive = props.isActive;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Creates a new Location aggregate.
   * Owns identity generation, timestamps, defaults, normalization, and invariants.
   */
  public static create(input: CreateLocationInput): Location {
    // Normalize code: trim and uppercase
    const code = input.code.trim().toUpperCase();

    // Normalize name: trim
    const name = input.name.trim();

    // Normalize kind: trim and lowercase
    const kind = input.kind.trim().toLowerCase();

    // Validate code
    if (!code) {
      throw new InvalidLocationCodeError("Location code is required");
    }

    // Validate name
    if (!name) {
      throw new InvalidLocationNameError("Location name is required");
    }

    // Validate kind
    if (!kind) {
      throw new InvalidLocationKindError("Location kind is required");
    }

    // Generate identity and timestamps
    const id = ObjectId.generate().value;
    const createdAt = new Date();
    const updatedAt = createdAt;

    return new Location({
      id,
      code,
      name,
      kind,
      parentId: input.parentId ?? null,
      isActive: true, // Default to active
      metadata: input.metadata ?? {},
      createdAt,
      updatedAt,
    });
  }

  /**
   * Updates existing Location aggregate parameters maintaining invariants.
   */
  public update(input: UpdateLocationInput): Location {
    const code = input.code !== undefined ? input.code.trim().toUpperCase() : this.code;
    const name = input.name !== undefined ? input.name.trim() : this.name;
    const kind = input.kind !== undefined ? input.kind.trim().toLowerCase() : this.kind;

    if (!code) {
      throw new InvalidLocationCodeError("Location code is required");
    }
    if (!name) {
      throw new InvalidLocationNameError("Location name is required");
    }
    if (!kind) {
      throw new InvalidLocationKindError("Location kind is required");
    }

    return new Location({
      id: this.id,
      code,
      name,
      kind,
      parentId: input.parentId !== undefined ? input.parentId : this.parentId,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      metadata: input.metadata !== undefined ? input.metadata : this.metadata,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  /**
   * Rehydrates an existing Location from persistence.
   * Reconstructs state exactly as stored without validation or normalization.
   * Used only by repositories when loading from the database.
   */
  public static rehydrate(props: LocationProps): Location {
    return new Location(props);
  }
}
