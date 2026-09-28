export interface LocationHierarchyEntry {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Returns the path from an ancestor location to a descendant, excluding the
 * ancestor itself. Returns null when the source is not a known descendant.
 */
export function getRelativeLocationPath(
  locationId: string,
  ancestorId: string,
  locations: readonly LocationHierarchyEntry[],
): LocationHierarchyEntry[] | null {
  if (locationId === ancestorId) return [];

  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const pathFromDescendant: LocationHierarchyEntry[] = [];
  const visited = new Set<string>();
  let current = locationsById.get(locationId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    pathFromDescendant.push(current);

    if (current.parentId === ancestorId) {
      return pathFromDescendant.reverse();
    }

    current = current.parentId
      ? locationsById.get(current.parentId)
      : undefined;
  }

  return null;
}
