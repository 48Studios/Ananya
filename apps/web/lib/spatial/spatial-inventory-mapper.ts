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
}

export interface SpatialOperationalStats {
  totalLocations: number;
  occupiedLocations: number;
  emptyLocations: number;
  mappedLocations: number;
  unmappedLocations: number;
  totalUnits: number;
  parentDirectUnits: number;
}

export interface MappedSpatialInventory {
  parentDirectProjections: InventoryProjectionDto[];
  parentDirectQuantity: number;
  parentDirectComponents: ComponentStockItem[];
  cellStockMap: Map<string, CellStockSummary>;
  stats: SpatialOperationalStats;
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
    });
  }

  const parentDirectProjections: InventoryProjectionDto[] = [];
  let parentDirectQuantity = 0;

  // Process all projections in the subtree
  for (const proj of projections) {
    const qty = Number(proj.quantity || 0);

    // 1. Direct inventory on parent location
    if (proj.locationId === parentId) {
      parentDirectProjections.push(proj);
      parentDirectQuantity += qty;
      continue;
    }

    // 2. Relative path from parent to projection location
    const path = getRelativeLocationPath(
      proj.locationId,
      parentId,
      descendantLocations,
    );

    if (!path || path.length === 0) {
      // Direct on parent (or unresolvable ancestor)
      if (proj.locationId === parentId) {
        parentDirectProjections.push(proj);
        parentDirectQuantity += qty;
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

  for (const summary of cellStockMap.values()) {
    summary.hasStock = summary.totalQuantity > 0;
    const uniqueCompIds = new Set(summary.components.map((c) => c.componentId));
    summary.distinctComponentsCount = uniqueCompIds.size;

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

  const stats: SpatialOperationalStats = {
    totalLocations: children.length,
    occupiedLocations: occupiedCount,
    emptyLocations: children.length - occupiedCount,
    mappedLocations: mappedCount,
    unmappedLocations: children.length - mappedCount,
    totalUnits,
    parentDirectUnits: parentDirectQuantity,
  };

  return {
    parentDirectProjections,
    parentDirectQuantity,
    parentDirectComponents,
    cellStockMap,
    stats,
  };
}
