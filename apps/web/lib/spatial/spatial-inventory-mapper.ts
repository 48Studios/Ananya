import type { LocationOperationalViewChildDto } from "../api/spatial-api";
import type { InventoryProjectionDto } from "../api/inventory-projections-api";
import type { ComponentDto } from "../api/components-api";
import {
  getRelativeLocationPath,
  type LocationHierarchyEntry,
} from "../location-provenance";

export interface ComponentStockItem {
  componentId: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  isDirect: boolean;
  subLocationName?: string;
  subLocationId?: string;
}

export type InventoryProvenanceStatus =
  | "empty"
  | "direct-only"
  | "descendant-only"
  | "mixed";

export type OccupancyLevel =
  | "empty"
  | "low"
  | "moderate"
  | "high"
  | "over-capacity"
  | "unspecified";

export interface CellStockSummary {
  locationId: string;
  locationCode: string;
  locationName: string;
  isMapped: boolean;
  directProjections: InventoryProjectionDto[];
  descendantProjections: Array<{
    projection: InventoryProjectionDto;
    relativePath: LocationHierarchyEntry[];
  }>;
  totalQuantity: number;
  distinctComponentsCount: number;
  hasStock: boolean;
  components: ComponentStockItem[];

  // Phase 7 Unit-safe & Provenance extensions
  directComponentCount: number;
  descendantComponentCount: number;
  directUnitsByMeasure: Record<string, number>;
  descendantUnitsByMeasure: Record<string, number>;
  totalUnitsByMeasure: Record<string, number>;
  directUnitsBreakdown: string;
  descendantUnitsBreakdown: string;
  provenanceStatus: InventoryProvenanceStatus;

  // Capacity metadata (only populated when explicitly configured in location metadata)
  capacity: number | null;
  capacityUnit: string | null;
  fillRatio: number | null;
  occupancyLevel: OccupancyLevel;
}

export interface SpatialOperationalStats {
  totalLocations: number;
  occupiedLocations: number;
  emptyLocations: number;
  mappedLocations: number;
  unmappedLocations: number;
  totalUnits: number;
  totalUnitsBreakdown: string;
  parentDirectUnits: number;
}

export interface MappedSpatialInventory {
  parentDirectProjections: InventoryProjectionDto[];
  parentDirectQuantity: number;
  parentDirectUnitsByMeasure: Record<string, number>;
  parentDirectUnitsBreakdown: string;
  parentDirectComponents: ComponentStockItem[];
  parentProvenanceStatus: InventoryProvenanceStatus;
  cellStockMap: Map<string, CellStockSummary>;
  stats: SpatialOperationalStats;
}

/**
 * Formats a unit-to-quantity record into a human-readable string without
 * combining incompatible units (e.g. "500 pcs, 2 reels").
 */
export function formatUnitsBreakdown(
  units: Record<string, number> | undefined | null,
  emptyFallback = "0 units",
): string {
  if (!units) return emptyFallback;
  const entries = Object.entries(units).filter(([, qty]) => qty > 0);
  if (entries.length === 0) return emptyFallback;
  return entries
    .map(([unit, qty]) => `${qty.toLocaleString()} ${unit}`)
    .join(", ");
}

/**
 * Extracts explicit capacity from location metadata.
 * Returns null if capacity is not explicitly defined (does NOT infer from geometry).
 */
export function extractLocationCapacity(
  metadata?: Record<string, unknown> | null,
): {
  capacity: number | null;
  capacityUnit: string | null;
} {
  if (!metadata || typeof metadata !== "object") {
    return { capacity: null, capacityUnit: null };
  }
  const rawCap =
    metadata.capacity ??
    metadata.maxCapacity ??
    metadata.max_capacity ??
    metadata.targetCapacity ??
    null;
  const num = rawCap !== null && rawCap !== undefined ? Number(rawCap) : null;
  const unit =
    (typeof metadata.capacityUnit === "string" ? metadata.capacityUnit : null) ??
    (typeof metadata.capacity_unit === "string" ? metadata.capacity_unit : null);

  return {
    capacity: num !== null && !isNaN(num) && num > 0 ? num : null,
    capacityUnit: unit,
  };
}

export function mapSpatialInventory(
  parentId: string,
  children: LocationOperationalViewChildDto[],
  descendantLocations: readonly LocationHierarchyEntry[],
  projections: InventoryProjectionDto[],
  componentMap: Map<string, ComponentDto>,
): MappedSpatialInventory {
  const cellStockMap = new Map<string, CellStockSummary>();

  // Initialize summary for each child location
  for (const child of children) {
    const { capacity, capacityUnit } = extractLocationCapacity(
      child.location.metadata,
    );

    cellStockMap.set(child.location.id, {
      locationId: child.location.id,
      locationCode: child.location.code,
      locationName: child.location.name,
      isMapped: child.node !== null,
      directProjections: [],
      descendantProjections: [],
      totalQuantity: 0,
      distinctComponentsCount: 0,
      hasStock: false,
      components: [],
      directComponentCount: 0,
      descendantComponentCount: 0,
      directUnitsByMeasure: {},
      descendantUnitsByMeasure: {},
      totalUnitsByMeasure: {},
      directUnitsBreakdown: "0 units",
      descendantUnitsBreakdown: "0 units",
      provenanceStatus: "empty",
      capacity,
      capacityUnit,
      fillRatio: null,
      occupancyLevel: "empty",
    });
  }

  const parentDirectProjections: InventoryProjectionDto[] = [];
  let parentDirectQuantity = 0;
  const parentDirectUnitsByMeasure: Record<string, number> = {};

  // Process all projections in the subtree
  for (const proj of projections) {
    const qty = Number(proj.quantity || 0);

    // 1. Direct inventory on parent location
    if (proj.locationId === parentId) {
      parentDirectProjections.push(proj);
      parentDirectQuantity += qty;
      const component = componentMap.get(proj.componentId);
      const unit = proj.unitOfMeasure || component?.unit || "units";
      parentDirectUnitsByMeasure[unit] =
        (parentDirectUnitsByMeasure[unit] || 0) + qty;
      continue;
    }

    // 2. Relative path from parent to projection location
    const path = getRelativeLocationPath(
      proj.locationId,
      parentId,
      descendantLocations,
    );

    if (!path || path.length === 0) {
      if (proj.locationId === parentId) {
        parentDirectProjections.push(proj);
        parentDirectQuantity += qty;
        const component = componentMap.get(proj.componentId);
        const unit = proj.unitOfMeasure || component?.unit || "units";
        parentDirectUnitsByMeasure[unit] =
          (parentDirectUnitsByMeasure[unit] || 0) + qty;
      }
      continue;
    }

    // path[0] is the direct child of the parent
    const directChild = path[0];
    if (!directChild) continue;
    const directChildId = directChild.id;
    const cellSummary = cellStockMap.get(directChildId);

    if (!cellSummary) {
      // Projection belongs to a child not in the direct children list
      continue;
    }

    const component = componentMap.get(proj.componentId);
    const sku = component ? component.sku : proj.componentId;
    const name = component ? component.name : "Inventory Item";
    const unit = proj.unitOfMeasure || component?.unit || "units";

    if (path.length === 1) {
      // Direct inventory in this child compartment
      cellSummary.directProjections.push(proj);
      cellSummary.totalQuantity += qty;
      cellSummary.directUnitsByMeasure[unit] =
        (cellSummary.directUnitsByMeasure[unit] || 0) + qty;
      cellSummary.totalUnitsByMeasure[unit] =
        (cellSummary.totalUnitsByMeasure[unit] || 0) + qty;
      cellSummary.components.push({
        componentId: proj.componentId,
        sku,
        name,
        quantity: qty,
        unit,
        isDirect: true,
      });
    } else {
      // Descendant inventory in a nested sub-location under this child
      const leafSubLocation = path[path.length - 1];
      if (!leafSubLocation) continue;

      cellSummary.descendantProjections.push({
        projection: proj,
        relativePath: path.slice(1),
      });
      cellSummary.totalQuantity += qty;
      cellSummary.descendantUnitsByMeasure[unit] =
        (cellSummary.descendantUnitsByMeasure[unit] || 0) + qty;
      cellSummary.totalUnitsByMeasure[unit] =
        (cellSummary.totalUnitsByMeasure[unit] || 0) + qty;
      cellSummary.components.push({
        componentId: proj.componentId,
        sku,
        name,
        quantity: qty,
        unit,
        isDirect: false,
        subLocationName: leafSubLocation.name,
        subLocationId: leafSubLocation.id,
      });
    }
  }

  // Finalize stats and unique counts
  let occupiedCount = 0;
  let mappedCount = 0;
  let totalUnits = parentDirectQuantity;
  const overallUnitsByMeasure: Record<string, number> = {
    ...parentDirectUnitsByMeasure,
  };

  for (const summary of cellStockMap.values()) {
    summary.hasStock = summary.totalQuantity > 0;
    const uniqueCompIds = new Set(summary.components.map((c) => c.componentId));
    summary.distinctComponentsCount = uniqueCompIds.size;
    summary.directComponentCount = summary.components.filter(
      (c) => c.isDirect,
    ).length;
    summary.descendantComponentCount = summary.components.filter(
      (c) => !c.isDirect,
    ).length;

    summary.directUnitsBreakdown = formatUnitsBreakdown(
      summary.directUnitsByMeasure,
      "0 units",
    );
    summary.descendantUnitsBreakdown = formatUnitsBreakdown(
      summary.descendantUnitsByMeasure,
      "0 units",
    );

    for (const [unit, qty] of Object.entries(summary.totalUnitsByMeasure)) {
      overallUnitsByMeasure[unit] = (overallUnitsByMeasure[unit] || 0) + qty;
    }

    // Classify Provenance Status
    const hasDirect = Object.keys(summary.directUnitsByMeasure).length > 0;
    const hasDescendant =
      Object.keys(summary.descendantUnitsByMeasure).length > 0;

    if (hasDirect && hasDescendant) {
      summary.provenanceStatus = "mixed";
    } else if (hasDirect) {
      summary.provenanceStatus = "direct-only";
    } else if (hasDescendant) {
      summary.provenanceStatus = "descendant-only";
    } else {
      summary.provenanceStatus = "empty";
    }

    // Classify Occupancy Level without guessing unspecified or incompatible capacities
    if (!summary.hasStock) {
      // Empty location
      summary.fillRatio =
        summary.capacity !== null && summary.capacityUnit ? 0 : null;
      summary.occupancyLevel = "empty";
    } else if (summary.capacity === null || !summary.capacityUnit) {
      // Capacity or capacity unit is unknown: report presence without false percentage
      summary.fillRatio = null;
      summary.occupancyLevel = "unspecified";
    } else {
      // Capacity and capacityUnit are both explicitly configured.
      // Confirm measures are compatible: all stock units must match capacityUnit.
      const targetUnit = summary.capacityUnit.trim().toLowerCase();
      const stockUnitEntries = Object.entries(
        summary.totalUnitsByMeasure,
      ).filter(([, qty]) => qty > 0);

      const hasIncompatibleUnit = stockUnitEntries.some(
        ([unit]) => unit.trim().toLowerCase() !== targetUnit,
      );
      const matchingEntry = stockUnitEntries.find(
        ([unit]) => unit.trim().toLowerCase() === targetUnit,
      );

      if (hasIncompatibleUnit || !matchingEntry) {
        // Incompatible measures or mixed incompatible units:
        // Show presence without implying a false capacity percentage
        summary.fillRatio = null;
        summary.occupancyLevel = "unspecified";
      } else {
        // Stock measure is 100% compatible with configured capacity unit
        const relevantQty = matchingEntry[1];
        summary.fillRatio =
          Math.round((relevantQty / summary.capacity) * 1000) / 1000;

        if (summary.fillRatio > 1.0) {
          summary.occupancyLevel = "over-capacity";
        } else if (summary.fillRatio >= 0.8) {
          summary.occupancyLevel = "high";
        } else if (summary.fillRatio >= 0.5) {
          summary.occupancyLevel = "moderate";
        } else {
          summary.occupancyLevel = "low";
        }
      }
    }

    if (summary.hasStock) occupiedCount++;
    if (summary.isMapped) mappedCount++;
    totalUnits += summary.totalQuantity;
  }

  const parentDirectComponents: ComponentStockItem[] = parentDirectProjections.map(
    (p) => {
      const comp = componentMap.get(p.componentId);
      return {
        componentId: p.componentId,
        sku: comp ? comp.sku : p.componentId,
        name: comp ? comp.name : "Inventory Item",
        quantity: Number(p.quantity || 0),
        unit: p.unitOfMeasure || comp?.unit || "units",
        isDirect: true,
      };
    },
  );

  const parentHasDirect = Object.keys(parentDirectUnitsByMeasure).length > 0;
  const parentProvenanceStatus: InventoryProvenanceStatus = parentHasDirect
    ? "direct-only"
    : "empty";

  const stats: SpatialOperationalStats = {
    totalLocations: children.length,
    occupiedLocations: occupiedCount,
    emptyLocations: children.length - occupiedCount,
    mappedLocations: mappedCount,
    unmappedLocations: children.length - mappedCount,
    totalUnits,
    totalUnitsBreakdown: formatUnitsBreakdown(overallUnitsByMeasure),
    parentDirectUnits: parentDirectQuantity,
  };

  return {
    parentDirectProjections,
    parentDirectQuantity,
    parentDirectUnitsByMeasure,
    parentDirectUnitsBreakdown: formatUnitsBreakdown(parentDirectUnitsByMeasure),
    parentDirectComponents,
    parentProvenanceStatus,
    cellStockMap,
    stats,
  };
}
