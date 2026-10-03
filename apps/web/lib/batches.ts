import type { BatchDto } from "./api/batches-api";

/**
 * A batch as the UI displays it.
 *
 * The API returns `componentId`; the component's SKU and name are resolved from
 * the components API and stay `null` when unavailable, so the page can say so
 * instead of showing a blank cell.
 */
export interface BatchRow {
  id: string;
  batchNumber: string;
  componentId: string;
  componentLabel: string | null;
  supplierBatchNumber: string | null;
  manufacturingDate: string | null;
  expiryDate: string | null;
  expired: boolean;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toBatchRow(
  batch: BatchDto,
  componentLabels?: ReadonlyMap<string, string>,
  now: Date = new Date(),
): BatchRow {
  const expiry = clean(batch.expiryDate);
  return {
    id: batch.id,
    batchNumber: clean(batch.batchNumber) ?? "-",
    componentId: batch.componentId,
    componentLabel: clean(componentLabels?.get(batch.componentId)) ?? null,
    supplierBatchNumber: clean(batch.supplierBatchNumber),
    manufacturingDate: clean(batch.manufacturingDate),
    expiryDate: expiry,
    expired: expiry !== null && new Date(expiry).getTime() < now.getTime(),
  };
}

export function buildBatchRows(
  batches: BatchDto[] | undefined | null,
  componentLabels?: ReadonlyMap<string, string>,
  now: Date = new Date(),
): BatchRow[] {
  if (!batches?.length) return [];
  return batches.map((batch) => toBatchRow(batch, componentLabels, now));
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
