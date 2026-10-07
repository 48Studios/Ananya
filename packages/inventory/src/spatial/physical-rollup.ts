import { classifyLocationHierarchyRelationship } from "./location-model";

/**
 * RFC-0069 Phase 4 — physical stock rollup over `containerId`.
 *
 * The physical-stock question is "what stock is physically inside this
 * location?" and must follow **physical containment** (`containerId`), not the
 * organizational hierarchy (`parentId`).
 *
 * ## Staged transition (RFC-0069 §16 Phase 2)
 *
 * The column is only partially populated until the Phase 3 backfill runs, so a
 * consumer that switched unconditionally to `containerId` would read zero
 * rollups for every un-backfilled row. The staged rule is therefore:
 *
 *     effectiveContainerId =
 *         containerId                                   # physical truth, when set
 *      ?? parentId, but ONLY while the parent/child pair is not a
 *         hierarchy violation (canonical / context-root / legacy-compatible)
 *      ?? null                                          # no physical container
 *
 * A violation edge (`cabinet → bin`, `shelf → shelf`) is a relationship that is
 * *not* physically representable, so it is NEVER used as a physical fallback —
 * the location is treated as having no physical container instead. This is what
 * makes organizational `parentId` stop affecting physical aggregation for every
 * physically-invalid edge even before the backfill.
 *
 * Phase 5 deletes the one fallback branch; the `containerId` branch and the
 * violation guard are the permanent behaviour.
 *
 * This module is deliberately the SINGLE physical-rollup authority: it reuses
 * the canonical classifier and introduces no second containment vocabulary.
 */

export interface PhysicalRollupLocation {
  readonly id: string;
  readonly kind: string;
  readonly parentId: string | null;
  readonly containerId: string | null;
}

export interface PhysicalRollupOptions {
  /**
   * Transition compatibility: when `containerId` is null, fall back to a
   * physically-valid `parentId`. Defaults to `true` while the database is only
   * partially backfilled. Phase 5 sets this to `false` (or removes the branch).
   */
  readonly legacyParentFallback?: boolean;
}

/**
 * Resolves the physical container of one location under the staged rule above.
 * Pure and cycle-agnostic (it resolves a single edge; traversal is separate).
 */
export function resolvePhysicalContainerId(
  location: PhysicalRollupLocation,
  parentById: ReadonlyMap<string, PhysicalRollupLocation>,
  options: PhysicalRollupOptions = {},
): string | null {
  if (location.containerId !== null) return location.containerId;
  if (options.legacyParentFallback === false) return null;
  if (location.parentId === null) return null;

  const parent = parentById.get(location.parentId);
  // A dangling parent cannot be proven physically valid → no fallback.
  if (!parent) return null;

  const relationship = classifyLocationHierarchyRelationship(
    parent.kind,
    location.kind,
  );
  // Violations are not physically representable; never used as a container.
  return relationship.violation ? null : location.parentId;
}

/**
 * Collects `rootId` and every transitively physically-contained descendant.
 *
 * Traversal is breadth-first over the RESOLVED physical container edges, with a
 * visited set, so a malformed container cycle terminates instead of looping
 * forever. `rootId` is always included, so a location with no physical
 * children still aggregates its own stock.
 */
export function collectPhysicalSubtreeIds(
  rootId: string,
  locations: readonly PhysicalRollupLocation[],
  options: PhysicalRollupOptions = {},
): string[] {
  const parentById = new Map(locations.map((location) => [location.id, location]));

  // Build physical container → children index once.
  const childrenByContainer = new Map<string, string[]>();
  for (const location of locations) {
    const containerId = resolvePhysicalContainerId(location, parentById, options);
    if (containerId === null) continue;
    const siblings = childrenByContainer.get(containerId);
    if (siblings) siblings.push(location.id);
    else childrenByContainer.set(containerId, [location.id]);
  }

  const visited = new Set<string>([rootId]);
  const collected: string[] = [rootId];
  const queue: string[] = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    for (const childId of childrenByContainer.get(currentId) ?? []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      collected.push(childId);
      queue.push(childId);
    }
  }

  return collected;
}