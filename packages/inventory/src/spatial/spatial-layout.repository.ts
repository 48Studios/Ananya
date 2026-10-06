import type {
  SpatialLayoutMappingWithStatus,
  SpatialLayoutWithMappings,
  SpatialLayoutRevisionRecordProps,
} from "./spatial-layout.types";

export interface SpatialLayoutRepository {
  findById(id: string): Promise<SpatialLayoutWithMappings | null>;
  /**
   * Loads every layout with its mappings. Used by read models that compute
   * mapping status across the whole location tree in one pass.
   */
  findAll(): Promise<SpatialLayoutWithMappings[]>;
  findByParentLocationId(parentLocationId: string): Promise<SpatialLayoutWithMappings[]>;
  findActiveByParentLocationId(parentLocationId: string): Promise<SpatialLayoutWithMappings | null>;
  /**
   * Finds every slot mapping that targets the given location, with the owning
   * layout's status. A location is normally mapped into at most one current
   * layout, but draft and archived layouts may coexist.
   */
  findMappingsByLocationId(
    locationId: string,
  ): Promise<SpatialLayoutMappingWithStatus[]>;
  findMappingsByLocationIds?(
    locationIds: string[],
  ): Promise<SpatialLayoutMappingWithStatus[]>;
  findRevisions(layoutId: string): Promise<SpatialLayoutRevisionRecordProps[]>;
  findRevisionByNumber(
    layoutId: string,
    revisionNumber: number,
  ): Promise<SpatialLayoutRevisionRecordProps | null>;
  delete(id: string): Promise<void>;
}
