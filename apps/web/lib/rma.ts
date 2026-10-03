import type {
  RmaDisposition,
  RmaRequestDto,
  RmaStatus,
} from "./api/rma-requests-api";

/**
 * An RMA request as the UI displays it.
 *
 * The API returns `customerId` and an optional `salesOrderId`; the web client
 * has no sales-order lookup yet, so the originating order is reported as linked
 * or not linked rather than as a fabricated order number.
 */
export interface RmaRow {
  id: string;
  rmaNumber: string;
  customerName: string | null;
  itemDescription: string;
  serialNumber: string | null;
  reason: string;
  status: RmaStatus;
  disposition: RmaDisposition | null;
  salesOrderLinked: boolean;
  reportedAt: string;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toRmaRow(
  request: RmaRequestDto,
  customerNames?: ReadonlyMap<string, string>,
): RmaRow {
  return {
    id: request.id,
    rmaNumber: clean(request.rmaNumber) ?? "-",
    customerName: clean(customerNames?.get(request.customerId)) ?? null,
    itemDescription: clean(request.itemDescription) ?? "-",
    serialNumber: clean(request.serialNumber),
    reason: clean(request.reason) ?? "-",
    status: request.status,
    disposition: request.disposition ?? null,
    salesOrderLinked: Boolean(clean(request.salesOrderId)),
    reportedAt: request.createdAt,
  };
}

export function buildRmaRows(
  requests: RmaRequestDto[] | undefined | null,
  customerNames?: ReadonlyMap<string, string>,
): RmaRow[] {
  if (!requests?.length) return [];
  return requests.map((request) => toRmaRow(request, customerNames));
}
