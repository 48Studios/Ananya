import type { SupplierReturnDto } from "./api/supplier-returns-api";

/**
 * A supplier return as the UI displays it. Supplier and PO labels are resolved
 * by the caller; there is no `returnDate` in the domain, so the row exposes the
 * real timestamps (`createdAt`, `dispatchedAt`).
 */
export interface SupplierReturnRow {
  id: string;
  returnNumber: string;
  supplierLabel: string | null;
  poLabel: string | null;
  rmaNumber: string | null;
  totalAmount: number;
  status: SupplierReturnDto["status"];
  dispatchedAt: string | null;
  createdAt: string;
  lineCount: number;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function amount(value: number | undefined | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toSupplierReturnRow(
  supplierReturn: SupplierReturnDto,
  labels?: {
    supplierNames?: ReadonlyMap<string, string>;
    poNumbers?: ReadonlyMap<string, string>;
  },
): SupplierReturnRow {
  return {
    id: supplierReturn.id,
    returnNumber: clean(supplierReturn.returnNumber) ?? "-",
    supplierLabel:
      clean(labels?.supplierNames?.get(supplierReturn.supplierId)) ??
      clean(supplierReturn.supplierName) ??
      null,
    poLabel:
      clean(
        supplierReturn.purchaseOrderId
          ? labels?.poNumbers?.get(supplierReturn.purchaseOrderId)
          : null,
      ) ??
      clean(supplierReturn.poNumber) ??
      null,
    rmaNumber: clean(supplierReturn.rmaNumber),
    totalAmount: amount(supplierReturn.totalAmount),
    status: supplierReturn.status,
    dispatchedAt: supplierReturn.dispatchedAt ?? null,
    createdAt: supplierReturn.createdAt,
    lineCount: (supplierReturn.lines ?? []).length,
  };
}

export function buildSupplierReturnRows(
  returns: SupplierReturnDto[] | undefined | null,
  labels?: {
    supplierNames?: ReadonlyMap<string, string>;
    poNumbers?: ReadonlyMap<string, string>;
  },
): SupplierReturnRow[] {
  if (!returns?.length) return [];
  return returns.map((entry) => toSupplierReturnRow(entry, labels));
}
