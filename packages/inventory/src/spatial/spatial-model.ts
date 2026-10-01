import { ObjectId } from "@ananya/core";
import {
  InvalidSpatialModelCodeError,
  InvalidSpatialModelNameError,
  InvalidSpatialDimensionsError,
} from "./spatial.errors";

export interface SpatialModelProps {
  id: string;
  code: string;
  name: string;
  description: string | null;
  format: string;
  assetUri: string | null;
  thumbnailUri: string | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSpatialModelInput {
  code: string;
  name: string;
  description?: string | null;
  format?: string;
  assetUri?: string | null;
  thumbnailUri?: string | null;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateSpatialModelInput {
  code?: string;
  name?: string;
  description?: string | null;
  format?: string;
  assetUri?: string | null;
  thumbnailUri?: string | null;
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
}

export class SpatialModel {
  public readonly id: string;
  public readonly code: string;
  public readonly name: string;
  public readonly description: string | null;
  public readonly format: string;
  public readonly assetUri: string | null;
  public readonly thumbnailUri: string | null;
  public readonly widthMm: number;
  public readonly heightMm: number;
  public readonly depthMm: number;
  public readonly metadata: Record<string, unknown>;
  public readonly isActive: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: SpatialModelProps) {
    this.id = props.id;
    this.code = props.code;
    this.name = props.name;
    this.description = props.description;
    this.format = props.format;
    this.assetUri = props.assetUri;
    this.thumbnailUri = props.thumbnailUri;
    this.widthMm = props.widthMm;
    this.heightMm = props.heightMm;
    this.depthMm = props.depthMm;
    this.metadata = props.metadata;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateSpatialModelInput): SpatialModel {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const format = input.format ? input.format.trim().toUpperCase() : "GLB";

    if (!code) {
      throw new InvalidSpatialModelCodeError();
    }
    if (!name) {
      throw new InvalidSpatialModelNameError();
    }
    if (
      typeof input.widthMm !== "number" ||
      isNaN(input.widthMm) ||
      input.widthMm <= 0 ||
      typeof input.heightMm !== "number" ||
      isNaN(input.heightMm) ||
      input.heightMm <= 0 ||
      typeof input.depthMm !== "number" ||
      isNaN(input.depthMm) ||
      input.depthMm <= 0
    ) {
      throw new InvalidSpatialDimensionsError();
    }

    const id = ObjectId.generate().value;
    const now = new Date();

    return new SpatialModel({
      id,
      code,
      name,
      description: input.description ?? null,
      format,
      assetUri: input.assetUri ?? null,
      thumbnailUri: input.thumbnailUri ?? null,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      depthMm: input.depthMm,
      metadata: input.metadata ?? {},
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  public update(input: UpdateSpatialModelInput): SpatialModel {
    const code =
      input.code !== undefined ? input.code.trim().toUpperCase() : this.code;
    const name = input.name !== undefined ? input.name.trim() : this.name;
    const format =
      input.format !== undefined
        ? input.format.trim().toUpperCase()
        : this.format;
    const widthMm = input.widthMm !== undefined ? input.widthMm : this.widthMm;
    const heightMm =
      input.heightMm !== undefined ? input.heightMm : this.heightMm;
    const depthMm = input.depthMm !== undefined ? input.depthMm : this.depthMm;

    if (!code) {
      throw new InvalidSpatialModelCodeError();
    }
    if (!name) {
      throw new InvalidSpatialModelNameError();
    }
    if (
      typeof widthMm !== "number" ||
      isNaN(widthMm) ||
      widthMm <= 0 ||
      typeof heightMm !== "number" ||
      isNaN(heightMm) ||
      heightMm <= 0 ||
      typeof depthMm !== "number" ||
      isNaN(depthMm) ||
      depthMm <= 0
    ) {
      throw new InvalidSpatialDimensionsError();
    }

    return new SpatialModel({
      id: this.id,
      code,
      name,
      description:
        input.description !== undefined
          ? input.description
          : this.description,
      format,
      assetUri:
        input.assetUri !== undefined ? input.assetUri : this.assetUri,
      thumbnailUri:
        input.thumbnailUri !== undefined
          ? input.thumbnailUri
          : this.thumbnailUri,
      widthMm,
      heightMm,
      depthMm,
      metadata: input.metadata !== undefined ? input.metadata : this.metadata,
      isActive: input.isActive !== undefined ? input.isActive : this.isActive,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  public static rehydrate(props: SpatialModelProps): SpatialModel {
    return new SpatialModel(props);
  }
}
