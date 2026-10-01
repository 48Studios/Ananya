import type { SpatialModel } from "./spatial-model";
import type { SpatialAnchor } from "./spatial-anchor";
import type { SpatialNode } from "./spatial-node";

export interface FindManySpatialModelsOptions {
  isActive?: boolean;
}

export interface SpatialModelRepository {
  findById(id: string): Promise<SpatialModel | null>;
  findByCode(code: string): Promise<SpatialModel | null>;
  findMany(options?: FindManySpatialModelsOptions): Promise<SpatialModel[]>;
  save(model: SpatialModel): Promise<SpatialModel>;
  update(model: SpatialModel): Promise<SpatialModel>;
  delete(id: string): Promise<void>;
  isInUse(id: string): Promise<boolean>;
}

export interface SpatialAnchorRepository {
  findById(id: string): Promise<SpatialAnchor | null>;
  findByModelId(modelId: string): Promise<SpatialAnchor[]>;
  findByModelAndCode(
    modelId: string,
    code: string,
  ): Promise<SpatialAnchor | null>;
  save(anchor: SpatialAnchor): Promise<SpatialAnchor>;
  update(anchor: SpatialAnchor): Promise<SpatialAnchor>;
  delete(id: string): Promise<void>;
}

export interface SpatialNodeRepository {
  findById(id: string): Promise<SpatialNode | null>;
  findByLocationId(locationId: string): Promise<SpatialNode | null>;
  findByParentId(parentId: string): Promise<SpatialNode[]>;
  findMany(): Promise<SpatialNode[]>;
  save(node: SpatialNode): Promise<SpatialNode>;
  update(node: SpatialNode): Promise<SpatialNode>;
  delete(id: string): Promise<void>;
}
