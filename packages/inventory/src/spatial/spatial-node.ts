import { ObjectId } from "@ananya/core";
import { SpatialNodeCannotParentToSelfError } from "./spatial.errors";

export interface SpatialNodeProps {
  id: string;
  locationId: string;
  modelId: string | null;
  parentSpatialNodeId: string | null;
  anchorId: string | null;
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  isVisible: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSpatialNodeInput {
  locationId: string;
  modelId?: string | null;
  parentSpatialNodeId?: string | null;
  anchorId?: string | null;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  isVisible?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateSpatialNodeInput {
  modelId?: string | null;
  parentSpatialNodeId?: string | null;
  anchorId?: string | null;
  positionX?: number;
  positionY?: number;
  positionZ?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  isVisible?: boolean;
  metadata?: Record<string, unknown>;
}

export class SpatialNode {
  public readonly id: string;
  public readonly locationId: string;
  public readonly modelId: string | null;
  public readonly parentSpatialNodeId: string | null;
  public readonly anchorId: string | null;
  public readonly positionX: number;
  public readonly positionY: number;
  public readonly positionZ: number;
  public readonly rotationX: number;
  public readonly rotationY: number;
  public readonly rotationZ: number;
  public readonly scaleX: number;
  public readonly scaleY: number;
  public readonly scaleZ: number;
  public readonly isVisible: boolean;
  public readonly metadata: Record<string, unknown>;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: SpatialNodeProps) {
    this.id = props.id;
    this.locationId = props.locationId;
    this.modelId = props.modelId;
    this.parentSpatialNodeId = props.parentSpatialNodeId;
    this.anchorId = props.anchorId;
    this.positionX = props.positionX;
    this.positionY = props.positionY;
    this.positionZ = props.positionZ;
    this.rotationX = props.rotationX;
    this.rotationY = props.rotationY;
    this.rotationZ = props.rotationZ;
    this.scaleX = props.scaleX;
    this.scaleY = props.scaleY;
    this.scaleZ = props.scaleZ;
    this.isVisible = props.isVisible;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(input: CreateSpatialNodeInput): SpatialNode {
    if (!input.locationId || !input.locationId.trim()) {
      throw new Error("Location ID is required for a spatial node");
    }

    const id = ObjectId.generate().value;
    const now = new Date();

    if (input.parentSpatialNodeId && input.parentSpatialNodeId === id) {
      throw new SpatialNodeCannotParentToSelfError(id);
    }

    return new SpatialNode({
      id,
      locationId: input.locationId.trim(),
      modelId: input.modelId ?? null,
      parentSpatialNodeId: input.parentSpatialNodeId ?? null,
      anchorId: input.anchorId ?? null,
      positionX: input.positionX ?? 0,
      positionY: input.positionY ?? 0,
      positionZ: input.positionZ ?? 0,
      rotationX: input.rotationX ?? 0,
      rotationY: input.rotationY ?? 0,
      rotationZ: input.rotationZ ?? 0,
      scaleX: input.scaleX ?? 1.0,
      scaleY: input.scaleY ?? 1.0,
      scaleZ: input.scaleZ ?? 1.0,
      isVisible: input.isVisible ?? true,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });
  }

  public update(input: UpdateSpatialNodeInput): SpatialNode {
    if (
      input.parentSpatialNodeId !== undefined &&
      input.parentSpatialNodeId === this.id
    ) {
      throw new SpatialNodeCannotParentToSelfError(this.id);
    }

    return new SpatialNode({
      id: this.id,
      locationId: this.locationId,
      modelId:
        input.modelId !== undefined ? input.modelId : this.modelId,
      parentSpatialNodeId:
        input.parentSpatialNodeId !== undefined
          ? input.parentSpatialNodeId
          : this.parentSpatialNodeId,
      anchorId:
        input.anchorId !== undefined ? input.anchorId : this.anchorId,
      positionX:
        input.positionX !== undefined ? input.positionX : this.positionX,
      positionY:
        input.positionY !== undefined ? input.positionY : this.positionY,
      positionZ:
        input.positionZ !== undefined ? input.positionZ : this.positionZ,
      rotationX:
        input.rotationX !== undefined ? input.rotationX : this.rotationX,
      rotationY:
        input.rotationY !== undefined ? input.rotationY : this.rotationY,
      rotationZ:
        input.rotationZ !== undefined ? input.rotationZ : this.rotationZ,
      scaleX: input.scaleX !== undefined ? input.scaleX : this.scaleX,
      scaleY: input.scaleY !== undefined ? input.scaleY : this.scaleY,
      scaleZ: input.scaleZ !== undefined ? input.scaleZ : this.scaleZ,
      isVisible:
        input.isVisible !== undefined ? input.isVisible : this.isVisible,
      metadata: input.metadata !== undefined ? input.metadata : this.metadata,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }

  public static rehydrate(props: SpatialNodeProps): SpatialNode {
    return new SpatialNode(props);
  }
}
