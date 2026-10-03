import type {
  SpatialLayoutWithMappings,
  SpatialLayoutRevisionRecordProps,
} from "./spatial-layout.types";

export interface SpatialLayoutRepository {
  findById(id: string): Promise<SpatialLayoutWithMappings | null>;
  findByParentLocationId(parentLocationId: string): Promise<SpatialLayoutWithMappings[]>;
  findActiveByParentLocationId(parentLocationId: string): Promise<SpatialLayoutWithMappings | null>;
  findRevisions(layoutId: string): Promise<SpatialLayoutRevisionRecordProps[]>;
  findRevisionByNumber(
    layoutId: string,
    revisionNumber: number,
  ): Promise<SpatialLayoutRevisionRecordProps | null>;
  delete(id: string): Promise<void>;
}
