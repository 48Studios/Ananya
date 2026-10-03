import type { WarehousePolicyDto } from "./api/warehouse-policies-api";

/**
 * A warehouse policy as the UI displays it.
 *
 * The API returns `warehouseId` and bin ids; the labels are resolved from the
 * warehouses and locations APIs and stay `null` when unavailable.
 */
export interface WarehousePolicyRow {
  id: string;
  warehouseId: string;
  warehouseLabel: string | null;
  directedPicking: boolean;
  directedPutaway: boolean;
  enforceBinCapacity: boolean;
  allowNegativeInventory: boolean;
  defaultReceivingBin: string | null;
  defaultProductionBin: string | null;
  defaultShippingBin: string | null;
  defaultReceivingBinId: string | null;
  defaultProductionBinId: string | null;
  defaultShippingBinId: string | null;
  createdAt: string;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toWarehousePolicyRow(
  policy: WarehousePolicyDto,
  labels?: {
    warehouseNames?: ReadonlyMap<string, string>;
    locationNames?: ReadonlyMap<string, string>;
  },
): WarehousePolicyRow {
  const binLabel = (id: string | null | undefined) =>
    clean(id ? labels?.locationNames?.get(id) : null) ?? clean(id);
  return {
    id: policy.id,
    warehouseId: policy.warehouseId,
    warehouseLabel:
      clean(labels?.warehouseNames?.get(policy.warehouseId)) ?? null,
    directedPicking: Boolean(policy.directedPicking),
    directedPutaway: Boolean(policy.directedPutaway),
    enforceBinCapacity: Boolean(policy.enforceBinCapacity),
    allowNegativeInventory: Boolean(policy.allowNegativeInventory),
    defaultReceivingBin: binLabel(policy.defaultReceivingBinId),
    defaultProductionBin: binLabel(policy.defaultProductionBinId),
    defaultShippingBin: binLabel(policy.defaultShippingBinId),
    defaultReceivingBinId: clean(policy.defaultReceivingBinId),
    defaultProductionBinId: clean(policy.defaultProductionBinId),
    defaultShippingBinId: clean(policy.defaultShippingBinId),
    createdAt: policy.createdAt,
  };
}

export function buildWarehousePolicyRows(
  policies: WarehousePolicyDto[] | undefined | null,
  labels?: {
    warehouseNames?: ReadonlyMap<string, string>;
    locationNames?: ReadonlyMap<string, string>;
  },
): WarehousePolicyRow[] {
  if (!policies?.length) return [];
  return policies.map((policy) => toWarehousePolicyRow(policy, labels));
}

export function toWarehouseNameMap(
  warehouses: Array<{ id: string; name?: string; code?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const warehouse of warehouses ?? []) {
    const label = clean(warehouse.name) ?? clean(warehouse.code);
    if (label) map.set(warehouse.id, label);
  }
  return map;
}

export function toLocationNameMap(
  locations: Array<{ id: string; code?: string; name?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const location of locations ?? []) {
    const code = clean(location.code);
    const name = clean(location.name);
    const label = code && name ? `${code} — ${name}` : (code ?? name);
    if (label) map.set(location.id, label);
  }
  return map;
}

export function describeRules(row: WarehousePolicyRow): string[] {
  const rules: string[] = [];
  if (row.directedPicking) rules.push("Directed picking");
  if (row.directedPutaway) rules.push("Directed putaway");
  if (row.enforceBinCapacity) rules.push("Enforce bin capacity");
  if (row.allowNegativeInventory) rules.push("Allow negative inventory");
  return rules;
}
