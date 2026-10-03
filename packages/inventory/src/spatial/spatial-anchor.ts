import { ObjectId } from "@ananya/core";
import {
  InvalidSpatialAnchorCodeError,
  InvalidSpatialAnchorNameError,
} from "./spatial.errors";

export interface SpatialAnchorProps {
  id: string;
  modelId: string;
  code: string;
  name: string;
  anchorType: string;
  localPositionX: number;
  localPositionY: number;
  localPositionZ: number;
  localRotationX: number;
  localRotationY: number;
  localRotationZ: number;
  boundingWidthMm: number | null;
  boundingHeightMm: number | null;
  boundingDepthMm: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSpatialAnchorInput {
  modelId: string;
  code: string;
  name: string;
  anchorType?: string;
  localPositionX?: number;
  localPositionY?: number;
  localPositionZ?: number;
  localRotationX?: number;
  localRotationY?: number;
  localRotationZ?: number;
  boundingWidthMm?: number | null;
  boundingHeightMm?: number | null;
  boundingDepthMm?: number | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateSpatialAnchorInput {
  code?: string;
  name?: string;
  anchorType?: string;
  localPositionX?: number;
  localPositionY?: number;
  localPositionZ?: number;
  localRotationX?: number;
  localRotationY?: number;
  localRotationZ?: number;
  boundingWidthMm?: number | null;
  boundingHeightMm?: number | null;
  boundingDepthMm?: number | null;
  metadata?: Record<string, unknown>;
}

export class SpatialAnchor {
  public readonly id: string;
  public readonly modelId: string;
  public readonly code: string;
  public readonly name: string;
  public readonly anchorType: string;
  public readonly localPositionX: number;
  public readonly localPositionY: number;
  public readonly localPositionZ: number;
  public readonly localRotationX: number;
  public readonly localRotationY: number;
  public readonly localRotationZ: number;
  public readonly boundingWidthMm: number | null;
  public readonly boundingHeightMm: number | null;
  public readonly boundingDepthMm: number | null;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: SpatialAnchorProps) {
    this.id = props.id;
    this.modelId = props.modelId;
    this.code = props.code;
    this.name = props.name;
    this.anchorType = props.anchorType;
    this.localPositionX = props.localPositionX;
    this.localPositionY = props.localPositionY;
    this.localPositionZ = props.localPositionZ;
    this.localRotationX = props.localRotationX;
    this.localRotationY = props.localRotationY;
    this.localRotationZ = props.localRotationZ;
    this.boundingWidthMm = props.boundingWidthMm;
    this.boundingHeightMm = props.boundingHeightMm;
    this.boundingDepthMm = props.boundingDepthMm;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateSpatialAnchorInput): SpatialAnchor {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    const anchorType = input.anchorType
      ? input.anchorType.trim().toUpperCase()
      : "BIN";

    if (!code) {
      throw new InvalidSpatialAnchorCodeError();
    }
    if (!name) {
      throw new InvalidSpatialAnchorNameError();
    }

    const id = ObjectId.generate().value;
    const now = new Date();

    return new SpatialAnchor({
      id,
      modelId: input.modelId,
      code,
      name,
      anchorType,
      localPositionX: input.localPositionX ?? 0,
      localPositionY: input.localPositionY ?? 0,
      localPositionZ: input.localPositionZ ?? 0,
      localRotationX: input.localRotationX ?? 0,
      localRotationY: input.localRotationY ?? 0,
      localRotationZ: input.localRotationZ ?? 0,
      boundingWidthMm: input.boundingWidthMm ?? null,
      boundingHeightMm: input.boundingHeightMm ?? null,
      boundingDepthMm: input.boundingDepthMm ?? null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });
  }

  public update(input: UpdateSpatialAnchorInput): SpatialAnchor {
    const code =
      input.code !== undefined ? input.code.trim().toUpperCase() : this.code;
    const name = input.name !== undefined ? input.name.trim() : this.name;
    const anchorType =
      input.anchorType !== undefined
        ? input.anchorType.trim().toUpperCase()
        : this.anchorType;

    if (!code) {
      throw new InvalidSpatialAnchorCodeError();
    }
    if (!name) {
      throw new InvalidSpatialAnchorNameError();
    }

    return new SpatialAnchor({
      id: this.id,
      modelId: this.modelId,
      code,
      name,
      anchorType,
      localPositionX:
        input.localPositionX !== undefined
          ? input.localPositionX
          : this.localPositionX,
      localPositionY:
        input.localPositionY !== undefined
          ? input.localPositionY
          : this.localPositionY,
      localPositionZ:
        input.localPositionZ !== undefined
          ? input.localPositionZ
          : this.localPositionZ,
      localRotationX:
        input.localRotationX !== undefined
          ? input.localRotationX
          : this.localRotationX,
      localRotationY:
        input.localRotationY !== undefined
          ? input.localRotationY
          : this.localRotationY,
      localRotationZ:
        input.localRotationZ !== undefined
          ? input.localRotationZ
          : this.localRotationZ,
      boundingWidthMm:
        input.boundingWidthMm !== undefined
          ? input.boundingWidthMm
          : this.boundingWidthMm,
      boundingHeightMm:
        input.boundingHeightMm !== undefined
          ? input.boundingHeightMm
          : this.boundingHeightMm,
      boundingDepthMm:
        input.boundingDepthMm !== undefined
          ? input.boundingDepthMm
          : this.boundingDepthMm,
      metadata: input.metadata !== undefined ? input.metadata : this.metadata,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  public static rehydrate(props: SpatialAnchorProps): SpatialAnchor {
    return new SpatialAnchor(props);
  }
}
