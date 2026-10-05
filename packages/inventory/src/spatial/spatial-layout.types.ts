import type { GeneratedCompartment, ParametricStorageConfig } from "./parametric";

export type SpatialLayoutStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export const INCOMPATIBLE_COMPARTMENT_KINDS = new Set([
  "warehouse",
  "room",
  "building",
  "facility",
  "zone",
]);

export interface SpatialLayoutMappingItem {
  id?: string;
  slotId: string;
  slotCode: string;
  locationId: string;
  logicalRow: number;
  logicalCol: number;
  isStale?: boolean;
  staleReason?: string | null;
  acknowledgedChangeSignature?: string | null;
  mappedAt?: Date;
  updatedAt?: Date;
}

export interface SpatialLayoutProps {
  id: string;
  parentLocationId: string;
  code: string;
  name: string;
  description: string | null;
  templateType: string;
  engineVersion: string;
  config: ParametricStorageConfig;
  revision: number;
  status: SpatialLayoutStatus;
  totalCompartments: number;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpatialLayoutWithMappings extends SpatialLayoutProps {
  mappings: SpatialLayoutMappingItem[];
}

/**
 * A slot mapping together with the status of the layout that owns it.
 *
 * Answers "is this location mapped into a parent's layout, and is that mapping
 * published, still a draft, or historical?" without loading every layout of
 * every ancestor.
 */
export interface SpatialLayoutMappingWithStatus extends SpatialLayoutMappingItem {
  layoutId: string;
  layoutCode: string;
  layoutStatus: SpatialLayoutStatus;
}

export interface SpatialLayoutRevisionRecordProps {
  id: string;
  layoutId: string;
  revisionNumber: number;
  configSnapshot: ParametricStorageConfig;
  mappingsSnapshot: Array<{
    slotId: string;
    slotCode: string;
    locationId: string;
    locationCode: string;
    isStale: boolean;
    staleReason?: string | null;
    acknowledgedChangeSignature?: string | null;
  }>;
  diffSummary: Record<string, unknown>;
  changeDescription: string | null;
  authorId: string | null;
  createdAt: Date;
}

/**
 * Computes a deterministic configuration signature for a slot's physical meaning and topology.
 * Binds acknowledgment to the exact reviewed configuration rather than a transient boolean.
 */
export function computeSlotAcknowledgmentSignature(
  compartment: GeneratedCompartment,
  reason: string,
): string {
  return `${compartment.slotId}:${compartment.code}:${compartment.logicalIndex.row}:${compartment.logicalIndex.col}:${compartment.kind}:${(compartment.metadata?.templateType as string) ?? ""}:${reason}`;
}

/**
 * Collects the ancestor chain for one mapped location: every location id on the
 * path from the mapped location up to (but excluding) the layout parent.
 *
 * The returned ids are exactly the rows whose concurrent mutation can invalidate
 * a descendant-membership verdict without touching either endpoint: reparenting
 * any link in this chain moves the mapped location out of (or into) the parent
 * hierarchy. Callers validating hierarchy inside a transaction must hold row
 * locks on every id in this chain — not just the parent and the mapped
 * location — and re-verify membership after locking.
 *
 * Cycle-safe: visited ids are never revisited, so a corrupt parentId cycle
 * terminates instead of looping forever. The parent itself is excluded because
 * callers already lock it as the hierarchy root.
 */
export function getAncestorChainIds(
  parentById: ReadonlyMap<string, string | null>,
  parentLocationId: string,
  mappedLocationId: string,
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>([parentLocationId]);
  let current: string | null | undefined = mappedLocationId;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current === parentLocationId) {
      return chain;
    }
    chain.push(current);
    current = parentById.get(current);
    if (current === undefined) {
      // Location row absent from the snapshot: the chain cannot be proven, so
      // report the links collected so far and let the caller fail closed.
      return chain;
    }
  }
  return chain;
}

/**
 * Recursively retrieves all descendant location IDs under a given parent location.
 * Uses a cycle-safe breadth-first traversal over parentId relations.
 * Does NOT include the root parent location itself.
 */
export function getDescendantLocationIds(
  locations: Array<{ id: string; parentId: string | null }>,
  rootParentId: string | null | undefined,
): Set<string> {
  if (!rootParentId || !locations || locations.length === 0) {
    return new Set<string>();
  }

  const childrenMap = new Map<string, string[]>();
  for (const loc of locations) {
    if (loc.parentId) {
      const list = childrenMap.get(loc.parentId) || [];
      list.push(loc.id);
      childrenMap.set(loc.parentId, list);
    }
  }

  const descendantIds = new Set<string>();
  const queue = [...(childrenMap.get(rootParentId) || [])];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (!descendantIds.has(currentId)) {
      descendantIds.add(currentId);
      const grandChildren = childrenMap.get(currentId);
      if (grandChildren) {
        for (const gcId of grandChildren) {
          if (!descendantIds.has(gcId)) {
            queue.push(gcId);
          }
        }
      }
    }
  }

  return descendantIds;
}
