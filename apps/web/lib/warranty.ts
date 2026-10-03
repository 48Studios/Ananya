import type { WarrantyClaimDto, WarrantyDecision } from "./api/warranty-claims-api";

/**
 * A warranty claim as the UI displays it.
 *
 * The API returns `customerId` and `productId`; those labels are resolved from
 * their own APIs and stay `null` when unavailable, so the page can say so
 * instead of inventing a name.
 */
export interface WarrantyClaimRow {
  id: string;
  claimNumber: string;
  customerName: string | null;
  productLabel: string | null;
  serialNumber: string | null;
  claimReason: string;
  decision: WarrantyDecision;
  purchaseDate: string;
  expiryDate: string;
  reportedAt: string;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toWarrantyClaimRow(
  claim: WarrantyClaimDto,
  labels?: {
    customerNames?: ReadonlyMap<string, string>;
    productNames?: ReadonlyMap<string, string>;
  },
): WarrantyClaimRow {
  return {
    id: claim.id,
    claimNumber: clean(claim.warrantyNumber) ?? "-",
    customerName: clean(labels?.customerNames?.get(claim.customerId)) ?? null,
    productLabel: clean(labels?.productNames?.get(claim.productId)) ?? null,
    serialNumber: clean(claim.serialNumber),
    claimReason: clean(claim.claimReason) ?? "-",
    decision: claim.decision,
    purchaseDate: claim.purchaseDate,
    expiryDate: claim.expiryDate,
    reportedAt: claim.createdAt,
  };
}

export function buildWarrantyClaimRows(
  claims: WarrantyClaimDto[] | undefined | null,
  labels?: {
    customerNames?: ReadonlyMap<string, string>;
    productNames?: ReadonlyMap<string, string>;
  },
): WarrantyClaimRow[] {
  if (!claims?.length) return [];
  return claims.map((claim) => toWarrantyClaimRow(claim, labels));
}

export function toProductNameMap(
  components:
    | Array<{ id: string; name?: string; sku?: string }>
    | undefined
    | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const component of components ?? []) {
    const name = clean(component.name) ?? clean(component.sku);
    if (name) map.set(component.id, name);
  }
  return map;
}
