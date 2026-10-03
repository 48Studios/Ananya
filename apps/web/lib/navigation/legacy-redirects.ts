/**
 * Permanent compatibility redirects for the domain-prefixed route refactor.
 *
 * Old paths are matched by whole segment (so `/components` matches
 * `/components/abc` but never `/components-extra`), longest first, and the
 * remaining path is appended to the target. Query strings are preserved by the
 * middleware, which clones the incoming URL before rewriting the pathname.
 *
 * The arrays are grouped by migration batch so each batch can enable exactly
 * the redirects whose canonical pages already exist. See
 * `docs/architecture/ROUTE_ARCHITECTURE_AUDIT.md` (section 8) for rationale.
 *
 * Deliberately NOT redirected: `/activities` is retained at its current path
 * because the audit could not confirm it is the CRM activities page (its
 * current implementation is a fixture-backed system log), and merging it with
 * either `/dashboard/activity` or the reserved `/sales/activities` would merge
 * distinct behaviours.
 */
export interface LegacyRedirect {
  from: string;
  to: string;
}

const SURFACES: readonly LegacyRedirect[] = [
  { from: "/activity", to: "/dashboard/activity" },
];

const INVENTORY: readonly LegacyRedirect[] = [
  { from: "/attributes", to: "/inventory/master/attributes" },
  { from: "/barcodes", to: "/inventory/barcodes" },
  { from: "/batches", to: "/inventory/batches" },
  { from: "/categories", to: "/inventory/master/categories" },
  { from: "/components", to: "/inventory/components" },
  { from: "/cycle-counts", to: "/inventory/stock-counts/cycle-counts" },
  { from: "/inventory/attributes", to: "/inventory/master/attributes" },
  { from: "/inventory/categories", to: "/inventory/master/categories" },
  { from: "/inventory/categories/attributes", to: "/inventory/master/attributes" },
  { from: "/inventory/categories/manufacturers", to: "/inventory/master/manufacturers" },
  { from: "/inventory/categories/units", to: "/inventory/master/units" },
  { from: "/inventory/cycle-counts", to: "/inventory/stock-counts/cycle-counts" },
  { from: "/inventory/manufacturers", to: "/inventory/master/manufacturers" },
  { from: "/inventory/projections", to: "/inventory/batches/projections" },
  { from: "/inventory/reservations", to: "/inventory/batches/reservations" },
  { from: "/inventory/serials", to: "/inventory/batches/serials" },
  { from: "/inventory/spatial", to: "/inventory/locations/spatial" },
  { from: "/inventory/spatial-models", to: "/inventory/locations/spatial-models" },
  { from: "/inventory/spatial/builder", to: "/inventory/locations/spatial-builder" },
  { from: "/inventory/stock-adjustments", to: "/inventory/stock-counts/adjustments" },
  { from: "/inventory/units", to: "/inventory/master/units" },
  { from: "/inventory/warehouse-policies", to: "/inventory/locations/policies" },
  { from: "/locations", to: "/inventory/locations" },
  { from: "/manufacturers", to: "/inventory/master/manufacturers" },
  { from: "/projections", to: "/inventory/batches/projections" },
  { from: "/reservations", to: "/inventory/batches/reservations" },
  { from: "/serials", to: "/inventory/batches/serials" },
  { from: "/spatial", to: "/inventory/locations/spatial" },
  { from: "/spatial-models", to: "/inventory/locations/spatial-models" },
  { from: "/spatial/builder", to: "/inventory/locations/spatial-builder" },
  { from: "/stock-adjustments", to: "/inventory/stock-counts/adjustments" },
  { from: "/stock-counts", to: "/inventory/stock-counts" },
  { from: "/transactions", to: "/inventory/transactions" },
  { from: "/transactions/new", to: "/inventory/transactions" },
  { from: "/units", to: "/inventory/master/units" },
  { from: "/warehouse", to: "/inventory/locations" },
  { from: "/warehouse-bins", to: "/inventory/locations" },
  { from: "/warehouse-policies", to: "/inventory/locations/policies" },
  { from: "/warehouse-transfers", to: "/inventory/warehouse-transfers" },
  { from: "/warehouses", to: "/inventory/locations" },
];

const PROCUREMENT: readonly LegacyRedirect[] = [
  { from: "/goods-receipts", to: "/procurement/goods-receipts" },
  { from: "/procurement/suppliers", to: "/procurement/master/suppliers" },
  { from: "/purchase-invoices", to: "/procurement/purchase-invoices" },
  { from: "/purchase-orders", to: "/procurement/purchase-orders" },
  { from: "/supplier-returns", to: "/procurement/supplier-returns" },
  { from: "/suppliers", to: "/procurement/master/suppliers" },
];

const MANUFACTURING: readonly LegacyRedirect[] = [
  { from: "/boms", to: "/manufacturing/boms" },
  { from: "/equipment", to: "/manufacturing/maintenance" },
  { from: "/finished-goods", to: "/manufacturing/finished-goods" },
  { from: "/maintenance", to: "/manufacturing/maintenance" },
  { from: "/material-consumption", to: "/manufacturing/material-consumption" },
  { from: "/mrp", to: "/manufacturing/mrp" },
  { from: "/mrp/capacity", to: "/manufacturing/mrp/capacity" },
  { from: "/mrp/materials", to: "/manufacturing/mrp/materials" },
  { from: "/mrp/production", to: "/manufacturing/mrp/production" },
  { from: "/mrp/purchases", to: "/manufacturing/mrp/purchases" },
  { from: "/mrp/runs", to: "/manufacturing/mrp/runs" },
  { from: "/production-orders", to: "/manufacturing/production-orders" },
  { from: "/traceability", to: "/manufacturing/traceability" },
  { from: "/work-orders", to: "/manufacturing/work-orders" },
];

const PROJECTS: readonly LegacyRedirect[] = [
  { from: "/rma", to: "/projects/rma" },
  { from: "/service", to: "/projects/service" },
  { from: "/tasks", to: "/projects/tasks" },
  { from: "/time", to: "/projects/time" },
  { from: "/warranty", to: "/projects/warranty" },
];

const SALES_FINANCE: readonly LegacyRedirect[] = [
  { from: "/accounts", to: "/finance/chart-of-accounts" },
  { from: "/accounts-payable", to: "/finance/accounts-payable" },
  { from: "/accounts-receivable", to: "/finance/accounts-receivable" },
  { from: "/bank-accounts", to: "/finance/bank-accounts" },
  { from: "/bank-reconciliation", to: "/finance/bank-reconciliation" },
  { from: "/chart-of-accounts", to: "/finance/chart-of-accounts" },
  { from: "/crm", to: "/sales/crm" },
  { from: "/customer-returns", to: "/sales/customer-returns" },
  { from: "/customers", to: "/sales/customers" },
  { from: "/fulfillment", to: "/sales/fulfillment" },
  { from: "/journal-entries", to: "/finance/journal-entries" },
  { from: "/leads", to: "/sales/leads" },
  { from: "/opportunities", to: "/sales/opportunities" },
  { from: "/payments", to: "/finance/payments" },
  { from: "/quotations", to: "/sales/quotations" },
  { from: "/sales-orders", to: "/sales/orders" },
];

const SETTINGS: readonly LegacyRedirect[] = [
  { from: "/audit", to: "/settings/audit" },
  { from: "/data-operations", to: "/settings/data-operations" },
  { from: "/data-packs", to: "/settings/data-packs" },
  { from: "/import-history", to: "/settings/data-operations" },
  { from: "/intelligence", to: "/settings/intelligence" },
  { from: "/roles", to: "/settings/roles" },
  { from: "/settings/security", to: "/settings/audit" },
  { from: "/users", to: "/settings/users" },
  { from: "/workflows", to: "/settings/workflows" },
];

export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  ...SURFACES,
  ...INVENTORY,
  ...PROCUREMENT,
  ...MANUFACTURING,
  ...PROJECTS,
  ...SALES_FINANCE,
  ...SETTINGS,
];

/**
 * Resolves a legacy pathname to its canonical successor, or `null` when the
 * path is already canonical. Resolution is segment-aware and longest-prefix
 * first, so `/accounts-payable` is never captured by the `/accounts` rule.
 */
export function resolveLegacyRedirect(
  pathname: string,
  redirects: readonly LegacyRedirect[] = LEGACY_REDIRECTS,
): string | null {
  let best: LegacyRedirect | null = null;
  for (const redirect of redirects) {
    if (pathname === redirect.from || pathname.startsWith(redirect.from + "/")) {
      if (!best || redirect.from.length > best.from.length) {
        best = redirect;
      }
    }
  }
  if (!best) return null;
  const target = best.to + pathname.slice(best.from.length);
  return target === pathname ? null : target;
}

/** Follows a redirect map until it leaves the map; used to assert no chains. */
export function redirectChain(
  pathname: string,
  redirects: readonly LegacyRedirect[] = LEGACY_REDIRECTS,
): string[] {
  const chain = [pathname];
  const seen = new Set(chain);
  let current = resolveLegacyRedirect(pathname, redirects);
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = resolveLegacyRedirect(current, redirects);
  }
  if (current) chain.push(current);
  return chain;
}
