/**
 * Shared label maps for procurement views.
 *
 * The API returns ids (`supplierId`, `purchaseOrderId`); these resolve them to
 * human labels and skip anything blank, so a page can render an honest
 * placeholder instead of a UUID or a blank cell.
 */
function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toSupplierNameMap(
  suppliers: Array<{ id: string; name?: string; code?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const supplier of suppliers ?? []) {
    const label = clean(supplier.name) ?? clean(supplier.code);
    if (label) map.set(supplier.id, label);
  }
  return map;
}

export function toPurchaseOrderNumberMap(
  orders: Array<{ id: string; poNumber?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const order of orders ?? []) {
    const number = clean(order.poNumber);
    if (number) map.set(order.id, number);
  }
  return map;
}

export function toComponentLabelMap(
  components:
    | Array<{ id: string; sku?: string; name?: string }>
    | undefined
    | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const component of components ?? []) {
    const sku = clean(component.sku);
    const name = clean(component.name);
    const label = sku && name ? `${sku} — ${name}` : (sku ?? name);
    if (label) map.set(component.id, label);
  }
  return map;
}
