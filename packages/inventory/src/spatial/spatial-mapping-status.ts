import type { SpatialLayoutStatus } from "./spatial-layout.types";

/**
 * Canonical status of a location's own placement inside a parent spatial frame.
 *
 * A location is placed by a `spatial_node` row. Only a location with a parent
 * can be placed inside another location's frame, so a top-level facility is
 * reported as a ROOT rather than as an unmapped — that is a property of the
 * hierarchy, not a missing mapping.
 */
export type SpatialMappingStatus = "MAPPED" | "PARTIAL" | "UNMAPPED" | "ROOT";

/**
 * Canonical state of a location's own spatial layout (the container it
 * configures for its direct children). This is orthogonal to the location's
 * own mapping: a container can be fully configured while itself sitting in no
 * parent frame.
 */
export type SpatialContainerStatus =
  | "NONE"
  | "DRAFT"
  | "PUBLISHED"
  | "ARCHIVED";

export interface SpatialMappingStatusInput {
  /** Parent location id; null for a top-level facility. */
  parentId: string | null;
  /** Whether a spatial node exists for this location. */
  hasSpatialNode: boolean;
  /** Number of direct child locations. */
  directChildCount: number;
  /** Number of direct child locations that carry a spatial node. */
  mappedDirectChildCount: number;
  /** Statuses of the layouts this location is the parent of. */
  layoutStatuses?: readonly SpatialLayoutStatus[];
}

export interface SpatialMappingStatusResult {
  status: SpatialMappingStatus;
  /** A parent exists, so the location can be placed in a parent frame. */
  isMappingEligible: boolean;
  hasSpatialNode: boolean;
  directChildCount: number;
  mappedDirectChildCount: number;
  unmappedDirectChildCount: number;
  /** Status of this location's own layout configuration. */
  containerStatus: SpatialContainerStatus;
}

/**
 * Resolves the container configuration state from the layout statuses of a
 * location. A published layout is the operational configuration and therefore
 * wins over a coexisting draft (builder edit in progress) or archived history.
 */
export function resolveSpatialContainerStatus(
  layoutStatuses: readonly SpatialLayoutStatus[] = [],
): SpatialContainerStatus {
  if (layoutStatuses.includes("PUBLISHED")) return "PUBLISHED";
  if (layoutStatuses.includes("DRAFT")) return "DRAFT";
  if (layoutStatuses.includes("ARCHIVED")) return "ARCHIVED";
  return "NONE";
}

/**
 * The single authoritative derivation of a location's spatial mapping status.
 *
 * - `MAPPED`   — the location has a spatial node and every direct child does too
 * - `PARTIAL`  — the location has a spatial node but some direct children do not
 * - `UNMAPPED` — the location has no spatial node and has a parent (eligible)
 * - `ROOT`     — the location has no spatial node and no parent (a facility root
 *                cannot be placed inside a parent frame; not a missing mapping)
 *
 * Container configuration (`containerStatus`) is reported separately so a
 * location that configures its children through a layout is never collapsed
 * into a bare "unmapped" flag.
 */
export function computeSpatialMappingStatus(
  input: SpatialMappingStatusInput,
): SpatialMappingStatusResult {
  const {
    parentId,
    hasSpatialNode,
    directChildCount,
    mappedDirectChildCount,
    layoutStatuses = [],
  } = input;

  const isMappingEligible = parentId !== null;
  const unmappedDirectChildCount = Math.max(
    0,
    directChildCount - mappedDirectChildCount,
  );

  let status: SpatialMappingStatus;
  if (hasSpatialNode) {
    status =
      directChildCount > 0 && unmappedDirectChildCount > 0
        ? "PARTIAL"
        : "MAPPED";
  } else {
    status = isMappingEligible ? "UNMAPPED" : "ROOT";
  }

  return {
    status,
    isMappingEligible,
    hasSpatialNode,
    directChildCount,
    mappedDirectChildCount,
    unmappedDirectChildCount,
    containerStatus: resolveSpatialContainerStatus(layoutStatuses),
  };
}
