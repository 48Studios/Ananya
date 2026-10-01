import { db, type DbExecutor } from '@ananya/database';
import {
  spatialModels,
  spatialAnchors,
  spatialNodes,
  type SpatialModelRecord,
  type SpatialAnchorRecord,
  type SpatialNodeRecord,
} from '@ananya/database/schema';
import { eq, and } from '@ananya/database/query';
import {
  SpatialModel,
  SpatialAnchor,
  SpatialNode,
  type SpatialModelRepository,
  type SpatialAnchorRepository,
  type SpatialNodeRepository,
  type FindManySpatialModelsOptions,
} from '@ananya/inventory';

function modelToDomain(row: SpatialModelRecord): SpatialModel {
  return SpatialModel.rehydrate({
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    format: row.format,
    assetUri: row.assetUri,
    thumbnailUri: row.thumbnailUri,
    widthMm: Number(row.widthMm),
    heightMm: Number(row.heightMm),
    depthMm: Number(row.depthMm),
    metadata: row.metadata,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function modelToRow(model: SpatialModel): SpatialModelRecord {
  return {
    id: model.id,
    code: model.code,
    name: model.name,
    description: model.description,
    format: model.format,
    assetUri: model.assetUri,
    thumbnailUri: model.thumbnailUri,
    widthMm: String(model.widthMm),
    heightMm: String(model.heightMm),
    depthMm: String(model.depthMm),
    metadata: model.metadata,
    isActive: model.isActive,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

function anchorToDomain(row: SpatialAnchorRecord): SpatialAnchor {
  return SpatialAnchor.rehydrate({
    id: row.id,
    modelId: row.modelId,
    code: row.code,
    name: row.name,
    anchorType: row.anchorType,
    localPositionX: Number(row.localPositionX),
    localPositionY: Number(row.localPositionY),
    localPositionZ: Number(row.localPositionZ),
    localRotationX: Number(row.localRotationX),
    localRotationY: Number(row.localRotationY),
    localRotationZ: Number(row.localRotationZ),
    boundingWidthMm:
      row.boundingWidthMm !== null ? Number(row.boundingWidthMm) : null,
    boundingHeightMm:
      row.boundingHeightMm !== null ? Number(row.boundingHeightMm) : null,
    boundingDepthMm:
      row.boundingDepthMm !== null ? Number(row.boundingDepthMm) : null,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function anchorToRow(anchor: SpatialAnchor): SpatialAnchorRecord {
  return {
    id: anchor.id,
    modelId: anchor.modelId,
    code: anchor.code,
    name: anchor.name,
    anchorType: anchor.anchorType,
    localPositionX: String(anchor.localPositionX),
    localPositionY: String(anchor.localPositionY),
    localPositionZ: String(anchor.localPositionZ),
    localRotationX: String(anchor.localRotationX),
    localRotationY: String(anchor.localRotationY),
    localRotationZ: String(anchor.localRotationZ),
    boundingWidthMm:
      anchor.boundingWidthMm !== null ? String(anchor.boundingWidthMm) : null,
    boundingHeightMm:
      anchor.boundingHeightMm !== null ? String(anchor.boundingHeightMm) : null,
    boundingDepthMm:
      anchor.boundingDepthMm !== null ? String(anchor.boundingDepthMm) : null,
    metadata: anchor.metadata,
    createdAt: anchor.createdAt,
    updatedAt: anchor.updatedAt,
  };
}

function nodeToDomain(row: SpatialNodeRecord): SpatialNode {
  return SpatialNode.rehydrate({
    id: row.id,
    locationId: row.locationId,
    modelId: row.modelId,
    parentSpatialNodeId: row.parentSpatialNodeId,
    anchorId: row.anchorId,
    positionX: Number(row.positionX),
    positionY: Number(row.positionY),
    positionZ: Number(row.positionZ),
    rotationX: Number(row.rotationX),
    rotationY: Number(row.rotationY),
    rotationZ: Number(row.rotationZ),
    scaleX: Number(row.scaleX),
    scaleY: Number(row.scaleY),
    scaleZ: Number(row.scaleZ),
    isVisible: row.isVisible,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function nodeToRow(node: SpatialNode): SpatialNodeRecord {
  return {
    id: node.id,
    locationId: node.locationId,
    modelId: node.modelId,
    parentSpatialNodeId: node.parentSpatialNodeId,
    anchorId: node.anchorId,
    positionX: String(node.positionX),
    positionY: String(node.positionY),
    positionZ: String(node.positionZ),
    rotationX: String(node.rotationX),
    rotationY: String(node.rotationY),
    rotationZ: String(node.rotationZ),
    scaleX: String(node.scaleX),
    scaleY: String(node.scaleY),
    scaleZ: String(node.scaleZ),
    isVisible: node.isVisible,
    metadata: node.metadata,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

export class DrizzleSpatialModelRepository implements SpatialModelRepository {
  constructor(private readonly client: DbExecutor = db) {}

  async findById(id: string): Promise<SpatialModel | null> {
    const [row] = await this.client
      .select()
      .from(spatialModels)
      .where(eq(spatialModels.id, id))
      .limit(1);

    return row ? modelToDomain(row) : null;
  }

  async findByCode(code: string): Promise<SpatialModel | null> {
    const [row] = await this.client
      .select()
      .from(spatialModels)
      .where(eq(spatialModels.code, code))
      .limit(1);

    return row ? modelToDomain(row) : null;
  }

  async findMany(
    options?: FindManySpatialModelsOptions,
  ): Promise<SpatialModel[]> {
    let query = this.client.select().from(spatialModels);

    if (options?.isActive !== undefined) {
      query = query.where(
        eq(spatialModels.isActive, options.isActive),
      ) as typeof query;
    }

    const rows = await query.orderBy(spatialModels.code);
    return rows.map(modelToDomain);
  }

  async save(model: SpatialModel): Promise<SpatialModel> {
    const [row] = await this.client
      .insert(spatialModels)
      .values(modelToRow(model))
      .returning();

    if (!row) {
      throw new Error('Failed to insert spatial model');
    }

    return modelToDomain(row);
  }

  async update(model: SpatialModel): Promise<SpatialModel> {
    const [row] = await this.client
      .update(spatialModels)
      .set(modelToRow(model))
      .where(eq(spatialModels.id, model.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update spatial model: ${model.id}`);
    }

    return modelToDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.client.delete(spatialModels).where(eq(spatialModels.id, id));
  }

  async isInUse(id: string): Promise<boolean> {
    const [row] = await this.client
      .select({ id: spatialNodes.id })
      .from(spatialNodes)
      .where(eq(spatialNodes.modelId, id))
      .limit(1);

    return !!row;
  }
}

export class DrizzleSpatialAnchorRepository implements SpatialAnchorRepository {
  constructor(private readonly client: DbExecutor = db) {}

  async findById(id: string): Promise<SpatialAnchor | null> {
    const [row] = await this.client
      .select()
      .from(spatialAnchors)
      .where(eq(spatialAnchors.id, id))
      .limit(1);

    return row ? anchorToDomain(row) : null;
  }

  async findByModelId(modelId: string): Promise<SpatialAnchor[]> {
    const rows = await this.client
      .select()
      .from(spatialAnchors)
      .where(eq(spatialAnchors.modelId, modelId))
      .orderBy(spatialAnchors.code);

    return rows.map(anchorToDomain);
  }

  async findByModelAndCode(
    modelId: string,
    code: string,
  ): Promise<SpatialAnchor | null> {
    const [row] = await this.client
      .select()
      .from(spatialAnchors)
      .where(
        and(eq(spatialAnchors.modelId, modelId), eq(spatialAnchors.code, code)),
      )
      .limit(1);

    return row ? anchorToDomain(row) : null;
  }

  async save(anchor: SpatialAnchor): Promise<SpatialAnchor> {
    const [row] = await this.client
      .insert(spatialAnchors)
      .values(anchorToRow(anchor))
      .returning();

    if (!row) {
      throw new Error('Failed to insert spatial anchor');
    }

    return anchorToDomain(row);
  }

  async update(anchor: SpatialAnchor): Promise<SpatialAnchor> {
    const [row] = await this.client
      .update(spatialAnchors)
      .set(anchorToRow(anchor))
      .where(eq(spatialAnchors.id, anchor.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update spatial anchor: ${anchor.id}`);
    }

    return anchorToDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.client.delete(spatialAnchors).where(eq(spatialAnchors.id, id));
  }
}

export class DrizzleSpatialNodeRepository implements SpatialNodeRepository {
  constructor(private readonly client: DbExecutor = db) {}

  async findById(id: string): Promise<SpatialNode | null> {
    const [row] = await this.client
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.id, id))
      .limit(1);

    return row ? nodeToDomain(row) : null;
  }

  async findByLocationId(locationId: string): Promise<SpatialNode | null> {
    const [row] = await this.client
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.locationId, locationId))
      .limit(1);

    return row ? nodeToDomain(row) : null;
  }

  async findByParentId(parentId: string): Promise<SpatialNode[]> {
    const rows = await this.client
      .select()
      .from(spatialNodes)
      .where(eq(spatialNodes.parentSpatialNodeId, parentId));

    return rows.map(nodeToDomain);
  }

  async findMany(): Promise<SpatialNode[]> {
    const rows = await this.client.select().from(spatialNodes);
    return rows.map(nodeToDomain);
  }

  async save(node: SpatialNode): Promise<SpatialNode> {
    const [row] = await this.client
      .insert(spatialNodes)
      .values(nodeToRow(node))
      .returning();

    if (!row) {
      throw new Error('Failed to insert spatial node');
    }

    return nodeToDomain(row);
  }

  async update(node: SpatialNode): Promise<SpatialNode> {
    const [row] = await this.client
      .update(spatialNodes)
      .set(nodeToRow(node))
      .where(eq(spatialNodes.id, node.id))
      .returning();

    if (!row) {
      throw new Error(`Failed to update spatial node: ${node.id}`);
    }

    return nodeToDomain(row);
  }

  async delete(id: string): Promise<void> {
    await this.client.delete(spatialNodes).where(eq(spatialNodes.id, id));
  }
}
