import { apiClient } from "../api-client";
import type { InventoryProjectionDto } from "./inventory-projections-api";

export interface SpatialModelDto {
  id: string;
  code: string;
  name: string;
  format: string;
  assetUri?: string | null;
  assetReference?: string | null;
  thumbnailUri?: string | null;
  widthMm: number | null;
  heightMm: number | null;
  depthMm: number | null;
  isActive: boolean;
  metadata: Record<string, unknown>;
  anchors?: SpatialAnchorDto[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SpatialAnchorDto {
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
  createdAt?: string;
  updatedAt?: string;
}

export interface SpatialNodeDto {
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
  createdAt?: string;
  updatedAt?: string;
}

export interface LocationSpatialMappingSummaryDto {
  status: SpatialMappingStatusDto;
  isMappingEligible: boolean;
  hasSpatialNode: boolean;
  directChildCount: number;
  mappedDirectChildCount: number;
  unmappedDirectChildCount: number;
  containerStatus: SpatialContainerStatusDto;
  publishedLayout: {
    id: string;
    code: string;
    revision: number;
    totalCompartments: number;
    containerDimensionsMm: {
      widthMm: number;
      heightMm: number;
      depthMm: number;
    } | null;
  } | null;
  slotMapping: {
    layoutId: string;
    layoutCode: string;
    layoutStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    slotCode: string;
    isStale: boolean;
  } | null;
}

export type SpatialMappingStatusDto = "MAPPED" | "PARTIAL" | "UNMAPPED" | "ROOT";

export type SpatialContainerStatusDto =
  | "NONE"
  | "DRAFT"
  | "PUBLISHED"
  | "ARCHIVED";

export interface LocationSpatialContextDto {
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
  };
  node: SpatialNodeDto | null;
  model: SpatialModelDto | null;
  anchor: SpatialAnchorDto | null;
  parentSpatialNode: SpatialNodeDto | null;
  mapping: LocationSpatialMappingSummaryDto;
}

export interface LocationOperationalViewChildDto {
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
    isActive: boolean;
    metadata?: Record<string, unknown>;
  };
  node: SpatialNodeDto | null;
  model: SpatialModelDto | null;
  anchor: SpatialAnchorDto | null;
}

export interface LocationOperationalViewDto {
  parent: {
    location: {
      id: string;
      code: string;
      name: string;
      kind: string;
      parentId: string | null;
      isActive: boolean;
      metadata?: Record<string, unknown>;
    };
    node: SpatialNodeDto | null;
    model: SpatialModelDto | null;
    anchors: SpatialAnchorDto[];
    mapping: LocationSpatialMappingSummaryDto;
  };
  children: LocationOperationalViewChildDto[];
  descendantLocations: Array<{
    id: string;
    code: string;
    name: string;
    parentId: string | null;
  }>;
  projections: InventoryProjectionDto[];
}

export interface LocationLocateTargetDto {
  locationId: string;
  locationCode: string;
  locationName: string;
  path: string;
  spatialRootLocationId: string;
  spatialRootLocationCode: string;
  focusLocationId: string;
  focusLocationCode: string;
  hasSpatialView: boolean;
  locateUrl: string;
}

export interface ComponentLocateTargetDto extends LocationLocateTargetDto {
  componentId: string;
  onHand: number;
  available: number;
}

export interface ComponentLocateResolutionDto {
  componentId: string;
  targets: ComponentLocateTargetDto[];
  totalOnHand: number;
  totalAvailable: number;
}

export interface LocationMappingChildItemDto {
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
    isActive: boolean;
  };
  node: SpatialNodeDto | null;
  anchor: SpatialAnchorDto | null;
  isMapped: boolean;
}

export interface LocationMappingContextDto {
  location: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
    isActive: boolean;
  };
  node: SpatialNodeDto | null;
  model: SpatialModelDto | null;
  anchor: SpatialAnchorDto | null;
  parentLocation: {
    id: string;
    code: string;
    name: string;
    kind: string;
    parentId: string | null;
  } | null;
  parentSpatialNode: SpatialNodeDto | null;
  parentModel: SpatialModelDto | null;
  parentAnchors: SpatialAnchorDto[];
  parentAnchorOccupancy: Array<{
    anchorId: string;
    anchorCode: string;
    occupiedByLocationId: string;
    occupiedByLocationCode: string;
  }>;
  modelAnchors: SpatialAnchorDto[];
  children: LocationMappingChildItemDto[];
  availableModels: SpatialModelDto[];
  mapping: LocationSpatialMappingSummaryDto;
}

export interface CreateSpatialModelDto {
  code: string;
  name: string;
  description?: string;
  format?: string;
  assetUri?: string;
  thumbnailUri?: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export type UpdateSpatialModelDto = Partial<CreateSpatialModelDto>;

export interface CreateSpatialAnchorDto {
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

export type UpdateSpatialAnchorDto = Partial<CreateSpatialAnchorDto>;

export interface UpdateSpatialAnchorItemPayload extends UpdateSpatialAnchorDto {
  id: string;
  expectedUpdatedAt?: string;
}

export interface BulkSaveSpatialAnchorsPayload {
  expectedModelUpdatedAt?: string;
  creates?: CreateSpatialAnchorDto[];
  updates?: UpdateSpatialAnchorItemPayload[];
  deleteIds?: string[];
}

export interface BulkSaveSpatialAnchorsResult {
  anchors: SpatialAnchorDto[];
  modelUpdatedAt: string;
}

export interface CreateSpatialNodeDto {
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

export type UpdateSpatialNodeDto = Partial<CreateSpatialNodeDto>;

export const spatialApi = {
  // Operational & Context Views
  getLocationOperationalView: (
    locationId: string,
  ): Promise<LocationOperationalViewDto> =>
    apiClient.get<LocationOperationalViewDto>(
      `/spatial/locations/${locationId}/operational-view`,
    ),

  getLocationMappingContext: (
    locationId: string,
  ): Promise<LocationMappingContextDto> =>
    apiClient.get<LocationMappingContextDto>(
      `/spatial/locations/${locationId}/mapping-context`,
    ),

  getLocationSpatialContext: (
    locationId: string,
  ): Promise<LocationSpatialContextDto> =>
    apiClient.get<LocationSpatialContextDto>(
      `/spatial/locations/${locationId}`,
    ),

  // Models
  getModels: (activeOnly = false): Promise<SpatialModelDto[]> =>
    apiClient.get<SpatialModelDto[]>(
      `/spatial/models${activeOnly ? "?isActive=true" : ""}`,
    ),

  getModelById: (id: string): Promise<SpatialModelDto> =>
    apiClient.get<SpatialModelDto>(`/spatial/models/${id}`),

  createModel: (dto: CreateSpatialModelDto): Promise<SpatialModelDto> =>
    apiClient.post<SpatialModelDto>("/spatial/models", dto),

  updateModel: (
    id: string,
    dto: UpdateSpatialModelDto,
  ): Promise<SpatialModelDto> =>
    apiClient.patch<SpatialModelDto>(`/spatial/models/${id}`, dto),

  deleteModel: (id: string): Promise<void> =>
    apiClient.delete<void>(`/spatial/models/${id}`),

  // Anchors
  getAnchorsByModel: (modelId: string): Promise<SpatialAnchorDto[]> =>
    apiClient.get<SpatialAnchorDto[]>(`/spatial/models/${modelId}/anchors`),

  getModelAnchors: (modelId: string): Promise<SpatialAnchorDto[]> =>
    apiClient.get<SpatialAnchorDto[]>(`/spatial/models/${modelId}/anchors`),

  getAnchorById: (id: string): Promise<SpatialAnchorDto> =>
    apiClient.get<SpatialAnchorDto>(`/spatial/anchors/${id}`),

  createAnchor: (
    modelId: string,
    dto: CreateSpatialAnchorDto,
  ): Promise<SpatialAnchorDto> =>
    apiClient.post<SpatialAnchorDto>(`/spatial/models/${modelId}/anchors`, dto),

  updateAnchor: (
    id: string,
    dto: UpdateSpatialAnchorDto,
  ): Promise<SpatialAnchorDto> =>
    apiClient.patch<SpatialAnchorDto>(`/spatial/anchors/${id}`, dto),

  deleteAnchor: (id: string): Promise<void> =>
    apiClient.delete<void>(`/spatial/anchors/${id}`),

  bulkSaveAnchors: (
    modelId: string,
    payload: BulkSaveSpatialAnchorsPayload,
  ): Promise<BulkSaveSpatialAnchorsResult> =>
    apiClient.post<BulkSaveSpatialAnchorsResult>(
      `/spatial/models/${modelId}/anchors/bulk-save`,
      payload,
    ),

  // Nodes
  getAllNodes: (): Promise<SpatialNodeDto[]> =>
    apiClient.get<SpatialNodeDto[]>("/spatial/nodes"),

  getNodeById: (id: string): Promise<SpatialNodeDto> =>
    apiClient.get<SpatialNodeDto>(`/spatial/nodes/${id}`),

  getNodeByLocation: (locationId: string): Promise<SpatialNodeDto | null> =>
    apiClient.get<SpatialNodeDto | null>(
      `/spatial/nodes/location/${locationId}`,
    ),

  createNode: (dto: CreateSpatialNodeDto): Promise<SpatialNodeDto> =>
    apiClient.post<SpatialNodeDto>("/spatial/nodes", dto),

  updateNode: (
    id: string,
    dto: UpdateSpatialNodeDto,
  ): Promise<SpatialNodeDto> =>
    apiClient.patch<SpatialNodeDto>(`/spatial/nodes/${id}`, dto),

  deleteNode: (id: string): Promise<void> =>
    apiClient.delete<void>(`/spatial/nodes/${id}`),

  // Search -> Locate Target Resolution
  resolveComponentLocate: (
    componentId: string,
  ): Promise<ComponentLocateResolutionDto> =>
    apiClient.get<ComponentLocateResolutionDto>(
      `/spatial/locate-targets/component/${componentId}`,
    ),

  resolveLocationLocate: (
    locationId: string,
    componentId?: string,
  ): Promise<LocationLocateTargetDto> =>
    apiClient.get<LocationLocateTargetDto>(
      `/spatial/locate-targets/location/${locationId}${
        componentId ? `?componentId=${encodeURIComponent(componentId)}` : ""
      }`,
    ),
};

export * from "./spatial-layouts-api";
