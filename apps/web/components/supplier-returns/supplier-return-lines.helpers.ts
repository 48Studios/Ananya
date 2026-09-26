import type { ComponentDto } from "@/lib/api/components-api";
import type { LocationDto } from "@/lib/api/locations-api";
import type {
  PurchaseOrderDto,
  PurchaseOrderLineDto,
} from "@/lib/api/purchase-orders-api";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";

/**
 * Filters component catalog items for a supplier return.
 * If the return is tied to a purchase order with line items, ONLY components
 * that are on that purchase order are returned.
 */
export function filterComponentsForSupplierReturn(
  components: ComponentDto[],
  purchaseOrder?: PurchaseOrderDto | null,
): ComponentDto[] {
  if (purchaseOrder?.lines && purchaseOrder.lines.length > 0) {
    const poComponentIds = new Set(
      purchaseOrder.lines.map((line) => line.componentId),
    );
    return components.filter((comp) => poComponentIds.has(comp.id));
  }
  return components;
}

/**
 * Finds the corresponding Purchase Order line for a given component.
 */
export function findPoLineForComponent(
  componentId: string,
  purchaseOrder?: PurchaseOrderDto | null,
): PurchaseOrderLineDto | undefined {
  if (!componentId || !purchaseOrder?.lines) return undefined;
  return purchaseOrder.lines.find((line) => line.componentId === componentId);
}

/**
 * Generates SearchableSelect options for components eligible for return.
 * Includes PO quantity context when a PO is linked.
 */
export function buildReturnComponentOptions(
  components: ComponentDto[],
  purchaseOrder?: PurchaseOrderDto | null,
): SearchableSelectOption[] {
  const filtered = filterComponentsForSupplierReturn(components, purchaseOrder);
  return filtered.map((c) => {
    const poLine = findPoLineForComponent(c.id, purchaseOrder);
    const sublabel = poLine
      ? `SKU: ${c.sku} • PO Qty: ${poLine.quantityOrdered}`
      : `SKU: ${c.sku}`;
    const chip = poLine
      ? `PO: ${poLine.quantityOrdered}`
      : c.manufacturerPartNumber || c.unit || undefined;

    return {
      value: c.id,
      label: c.name,
      sublabel,
      chip,
    };
  });
}

/**
 * Filters locations to ONLY those that currently hold stock of the selected component.
 * If no component is selected, returns an empty list.
 */
export function filterLocationsHoldingComponent(
  locations: LocationDto[],
  componentId: string,
  componentStockMap: Record<string, number>,
): LocationDto[] {
  if (!componentId) return [];
  return locations.filter((loc) => (componentStockMap[loc.id] ?? 0) > 0);
}

/**
 * Builds SearchableSelect options for locations that currently store the component.
 */
export function buildReturnLocationOptions(
  locations: LocationDto[],
  componentId: string,
  componentStockMap: Record<string, number>,
): SearchableSelectOption[] {
  const holding = filterLocationsHoldingComponent(
    locations,
    componentId,
    componentStockMap,
  );
  return holding.map((loc) => {
    const stock = componentStockMap[loc.id] ?? 0;
    return {
      value: loc.id,
      label: loc.name,
      sublabel: loc.code ? `Code: ${loc.code}` : undefined,
      chip: `${stock} in stock`,
    };
  });
}

/**
 * Calculates the maximum return quantity allowed.
 * Takes the minimum between the Purchase Order line quantity and available stock at location.
 */
export function calculateReturnQuantityCeiling(
  poQuantityOrdered?: number | null,
  locationStock?: number | null,
): number | undefined {
  const hasPo = poQuantityOrdered != null && !isNaN(poQuantityOrdered);
  const hasStock = locationStock != null && !isNaN(locationStock);

  if (hasPo && hasStock) {
    return Math.min(poQuantityOrdered, locationStock);
  }
  if (hasPo) return poQuantityOrdered;
  if (hasStock) return locationStock;
  return undefined;
}

/**
 * Validates the entered return quantity against PO and location boundaries.
 */
export function validateReturnQuantity(
  qty: number,
  poQuantityOrdered?: number | null,
  locationStock?: number | null,
): string | null {
  if (isNaN(qty) || qty <= 0) {
    return "Please enter a valid return quantity greater than 0.";
  }
  if (
    poQuantityOrdered != null &&
    !isNaN(poQuantityOrdered) &&
    qty > poQuantityOrdered
  ) {
    return `Return quantity (${qty}) cannot exceed Purchase Order quantity ordered (${poQuantityOrdered}).`;
  }
  if (locationStock != null && !isNaN(locationStock) && qty > locationStock) {
    return `Insufficient stock at the selected location. Available: ${locationStock}, requested: ${qty}.`;
  }
  return null;
}

/**
 * Resolves the unit price autofilled from the linked Purchase Order line item.
 */
export function getAutofillUnitPrice(
  componentId: string,
  purchaseOrder?: PurchaseOrderDto | null,
): number | null {
  const poLine = findPoLineForComponent(componentId, purchaseOrder);
  if (poLine && typeof poLine.unitPrice === "number") {
    return poLine.unitPrice;
  }
  return null;
}
