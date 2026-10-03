import type { ServiceRequestDto, ServicePriority } from "./api/service-requests-api";

/**
 * A service ticket as the UI displays it.
 *
 * The API returns `customerId` and (optionally) `serialNumber`; it does not
 * return customer or asset *names*. Resolving them here keeps the fabrication
 * out of the pages: an unresolved customer stays `null` and the UI decides how
 * to render that, instead of inventing a name.
 */
export interface ServiceRequestRow {
  id: string;
  serviceNumber: string;
  title: string;
  customerName: string | null;
  assetLabel: string | null;
  priority: ServicePriority;
  status: ServiceRequestDto["status"];
  reportedAt: string;
}

const EMPTY = "";

function clean(value: string | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === EMPTY ? null : trimmed;
}

export function toServiceRequestRow(
  request: ServiceRequestDto,
  customerNames?: ReadonlyMap<string, string>,
): ServiceRequestRow {
  return {
    id: request.id,
    serviceNumber: clean(request.serviceNumber) ?? "-",
    title: clean(request.title) ?? "-",
    customerName: clean(customerNames?.get(request.customerId)) ?? null,
    assetLabel: clean(request.serialNumber) ?? null,
    priority: request.priority,
    status: request.status,
    reportedAt: request.createdAt,
  };
}

export function buildServiceRequestRows(
  requests: ServiceRequestDto[] | undefined | null,
  customerNames?: ReadonlyMap<string, string>,
): ServiceRequestRow[] {
  if (!requests?.length) return [];
  return requests.map((request) => toServiceRequestRow(request, customerNames));
}

export function toCustomerNameMap(
  customers: Array<{ id: string; name?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const customer of customers ?? []) {
    const name = clean(customer.name);
    if (name) map.set(customer.id, name);
  }
  return map;
}
