import { apiClient } from "../api-client";
import type {
  SpatialLayoutWithMappings,
  SpatialLayoutRevisionRecordProps,
} from "@ananya/inventory";

export type SpatialLayoutDto = SpatialLayoutWithMappings;
export type SpatialLayoutRevisionDto = SpatialLayoutRevisionRecordProps;

export interface CreateSpatialLayoutPayload {
  parentLocationId: string;
  code: string;
  name: string;
  description?: string;
  templateType: string;
  engineVersion?: string;
  config: Record<string, unknown>;
  status?: string;
  mappings?: Array<{
    slotId: string;
    slotCode: string;
    locationId: string;
    logicalRow?: number;
    logicalCol?: number;
    isStale?: boolean;
    staleReason?: string | null;
    acknowledgedChangeSignature?: string | null;
  }>;
  metadata?: Record<string, unknown>;
}

export interface UpdateSpatialLayoutPayload {
  expectedRevision: number;
  name?: string;
  description?: string;
  templateType?: string;
  config?: Record<string, unknown>;
  mappings?: Array<{
    slotId: string;
    slotCode: string;
    locationId: string;
    logicalRow?: number;
    logicalCol?: number;
    isStale?: boolean;
    staleReason?: string | null;
    acknowledgedChangeSignature?: string | null;
  }>;
  changeDescription?: string;
  overwriteManualSpatialNodes?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PublishSpatialLayoutPayload {
  expectedRevision: number;
  changeDescription?: string;
  overwriteManualSpatialNodes?: boolean;
}

export interface ArchiveSpatialLayoutPayload {
  expectedRevision: number;
  changeDescription?: string;
}

export const spatialLayoutsApi = {
  /**
   * Fetches all layouts associated with a parent physical container location.
   */
  getByParent: (parentLocationId: string): Promise<SpatialLayoutWithMappings[]> =>
    apiClient.get<SpatialLayoutWithMappings[]>(
      `/spatial/layouts/parent/${encodeURIComponent(parentLocationId)}`,
    ),

  /**
   * Fetches the single active PUBLISHED layout for a parent container, if any.
   */
  getActiveByParent: (
    parentLocationId: string,
  ): Promise<SpatialLayoutWithMappings | null> =>
    apiClient.get<SpatialLayoutWithMappings | null>(
      `/spatial/layouts/parent/${encodeURIComponent(parentLocationId)}/active`,
    ),

  /**
   * Fetches a single layout by its unique ID.
   */
  getById: (id: string): Promise<SpatialLayoutWithMappings> =>
    apiClient.get<SpatialLayoutWithMappings>(
      `/spatial/layouts/${encodeURIComponent(id)}`,
    ),

  /**
   * Creates a new spatial layout in DRAFT status.
   */
  create: (
    payload: CreateSpatialLayoutPayload,
  ): Promise<SpatialLayoutWithMappings> =>
    apiClient.post<SpatialLayoutWithMappings>("/spatial/layouts", payload),

  /**
   * Updates an existing layout configuration and mappings with optimistic concurrency.
   */
  update: (
    id: string,
    payload: UpdateSpatialLayoutPayload,
  ): Promise<SpatialLayoutWithMappings> =>
    apiClient.put<SpatialLayoutWithMappings>(
      `/spatial/layouts/${encodeURIComponent(id)}`,
      payload,
    ),

  /**
   * Explicitly publishes a layout, incrementing revision and synchronizing 3D spatial nodes.
   */
  publish: (
    id: string,
    payload: PublishSpatialLayoutPayload,
  ): Promise<SpatialLayoutWithMappings> =>
    apiClient.post<SpatialLayoutWithMappings>(
      `/spatial/layouts/${encodeURIComponent(id)}/publish`,
      payload,
    ),

  /**
   * Explicitly archives a layout and unbinds builder-managed spatial nodes.
   */
  archive: (
    id: string,
    payload: ArchiveSpatialLayoutPayload,
  ): Promise<SpatialLayoutWithMappings> =>
    apiClient.post<SpatialLayoutWithMappings>(
      `/spatial/layouts/${encodeURIComponent(id)}/archive`,
      payload,
    ),

  /**
   * Hard-deletes a DRAFT layout that has never been published.
   */
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/spatial/layouts/${encodeURIComponent(id)}`),

  /**
   * Fetches the complete revision audit history for a layout.
   */
  getRevisions: (id: string): Promise<SpatialLayoutRevisionRecordProps[]> =>
    apiClient.get<SpatialLayoutRevisionRecordProps[]>(
      `/spatial/layouts/${encodeURIComponent(id)}/revisions`,
    ),

  /**
   * Fetches a specific historical revision snapshot by revision number.
   */
  getRevisionByNumber: (
    id: string,
    revisionNumber: number,
  ): Promise<SpatialLayoutRevisionRecordProps> =>
    apiClient.get<SpatialLayoutRevisionRecordProps>(
      `/spatial/layouts/${encodeURIComponent(id)}/revisions/${revisionNumber}`,
    ),
};
