import { db, type DbExecutor } from '@ananya/database';
import {
  spatialLayouts,
  spatialLayoutMappings,
  spatialLayoutRevisions,
  type SpatialLayoutRecord,
  type SpatialLayoutMappingRecord,
  type SpatialLayoutRevisionRecord,
} from '@ananya/database/schema';
import { eq, and, desc } from '@ananya/database/query';
import type {
  SpatialLayoutRepository,
  SpatialLayoutWithMappings,
  SpatialLayoutMappingItem,
  SpatialLayoutRevisionRecordProps,
  SpatialLayoutStatus,
} from '@ananya/inventory';
import type { ParametricStorageConfig } from '@ananya/inventory';

function rowToLayoutWithMappings(
  layoutRow: SpatialLayoutRecord,
  mappingRows: SpatialLayoutMappingRecord[],
): SpatialLayoutWithMappings {
  return {
    id: layoutRow.id,
    parentLocationId: layoutRow.parentLocationId,
    code: layoutRow.code,
    name: layoutRow.name,
    description: layoutRow.description,
    templateType: layoutRow.templateType,
    engineVersion: layoutRow.engineVersion,
    config: layoutRow.config as unknown as ParametricStorageConfig,
    revision: layoutRow.revision,
    status: layoutRow.status as SpatialLayoutStatus,
    totalCompartments: layoutRow.totalCompartments,
    metadata: layoutRow.metadata,
    createdBy: layoutRow.createdBy,
    updatedBy: layoutRow.updatedBy,
    createdAt: layoutRow.createdAt,
    updatedAt: layoutRow.updatedAt,
    mappings: mappingRows.map((m): SpatialLayoutMappingItem => ({
      id: m.id,
      slotId: m.slotId,
      slotCode: m.slotCode,
      locationId: m.locationId,
      logicalRow: m.logicalRow,
      logicalCol: m.logicalCol,
      isStale: m.isStale,
      staleReason: m.staleReason,
      acknowledgedChangeSignature: m.acknowledgedChangeSignature,
      mappedAt: m.mappedAt,
      updatedAt: m.updatedAt,
    })),
  };
}

function revisionRowToProps(
  row: SpatialLayoutRevisionRecord,
): SpatialLayoutRevisionRecordProps {
  return {
    id: row.id,
    layoutId: row.layoutId,
    revisionNumber: row.revisionNumber,
    configSnapshot: row.configSnapshot as unknown as ParametricStorageConfig,
    mappingsSnapshot: row.mappingsSnapshot,
    diffSummary: row.diffSummary,
    changeDescription: row.changeDescription,
    authorId: row.authorId,
    createdAt: row.createdAt,
  };
}

export class DrizzleSpatialLayoutRepository implements SpatialLayoutRepository {
  constructor(private readonly client: DbExecutor = db) {}

  async findById(id: string): Promise<SpatialLayoutWithMappings | null> {
    const [layout] = await this.client
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.id, id))
      .limit(1);

    if (!layout) {
      return null;
    }

    const mappings = await this.client
      .select()
      .from(spatialLayoutMappings)
      .where(eq(spatialLayoutMappings.layoutId, id))
      .orderBy(
        spatialLayoutMappings.logicalRow,
        spatialLayoutMappings.logicalCol,
        spatialLayoutMappings.slotId,
      );

    return rowToLayoutWithMappings(layout, mappings);
  }

  async findByParentLocationId(
    parentLocationId: string,
  ): Promise<SpatialLayoutWithMappings[]> {
    const layouts = await this.client
      .select()
      .from(spatialLayouts)
      .where(eq(spatialLayouts.parentLocationId, parentLocationId))
      .orderBy(desc(spatialLayouts.createdAt));

    const results: SpatialLayoutWithMappings[] = [];
    for (const layout of layouts) {
      const mappings = await this.client
        .select()
        .from(spatialLayoutMappings)
        .where(eq(spatialLayoutMappings.layoutId, layout.id))
        .orderBy(
          spatialLayoutMappings.logicalRow,
          spatialLayoutMappings.logicalCol,
          spatialLayoutMappings.slotId,
        );
      results.push(rowToLayoutWithMappings(layout, mappings));
    }

    return results;
  }

  async findActiveByParentLocationId(
    parentLocationId: string,
  ): Promise<SpatialLayoutWithMappings | null> {
    const [layout] = await this.client
      .select()
      .from(spatialLayouts)
      .where(
        and(
          eq(spatialLayouts.parentLocationId, parentLocationId),
          eq(spatialLayouts.status, 'PUBLISHED'),
        ),
      )
      .limit(1);

    if (!layout) {
      return null;
    }

    const mappings = await this.client
      .select()
      .from(spatialLayoutMappings)
      .where(eq(spatialLayoutMappings.layoutId, layout.id))
      .orderBy(
        spatialLayoutMappings.logicalRow,
        spatialLayoutMappings.logicalCol,
        spatialLayoutMappings.slotId,
      );

    return rowToLayoutWithMappings(layout, mappings);
  }

  async findRevisions(
    layoutId: string,
  ): Promise<SpatialLayoutRevisionRecordProps[]> {
    const rows = await this.client
      .select()
      .from(spatialLayoutRevisions)
      .where(eq(spatialLayoutRevisions.layoutId, layoutId))
      .orderBy(desc(spatialLayoutRevisions.revisionNumber));

    return rows.map(revisionRowToProps);
  }

  async findRevisionByNumber(
    layoutId: string,
    revisionNumber: number,
  ): Promise<SpatialLayoutRevisionRecordProps | null> {
    const [row] = await this.client
      .select()
      .from(spatialLayoutRevisions)
      .where(
        and(
          eq(spatialLayoutRevisions.layoutId, layoutId),
          eq(spatialLayoutRevisions.revisionNumber, revisionNumber),
        ),
      )
      .limit(1);

    return row ? revisionRowToProps(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.client.delete(spatialLayouts).where(eq(spatialLayouts.id, id));
  }
}
