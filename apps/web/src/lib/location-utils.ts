import type { Location } from "@ananya/inventory";

/**
 * Builds a human-readable location path from a list of locations and a location ID.
 * Returns an array of location names from root parent down to target child.
 */
export function formatLocationPath(
  locations: Location[],
  locationId?: string | null,
): string[] {
  if (!locationId) return ["Unassigned"];

  const locationMap = new Map<string, Location>();
  locations.forEach((loc) => locationMap.set(loc.id, loc));

  const path: string[] = [];
  let current: Location | undefined = locationMap.get(locationId);
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.name);

    if (current.parentId) {
      current = locationMap.get(current.parentId);
    } else {
      break;
    }
  }

  return path.length > 0 ? path : ["Unknown Location"];
}

/**
 * Formats location path array into a display string with separator ' › '
 */
export function formatLocationPathString(
  locations: Location[],
  locationId?: string | null,
): string {
  return formatLocationPath(locations, locationId).join(" › ");
}
