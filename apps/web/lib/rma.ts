import type {
  RmaDisposition,
  RmaRequestDto,
  RmaStatus,
} from "./api/rma-requests-api";

/**
 * An RMA request as the UI displays it.
 *
 * The API returns `customerId` and an optional `salesOrderId`; the originating
 * order number is resolved from the sales orders API and stays `null` when it
 * cannot be resolved, so the page never shows a fabricated number.
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
  salesOrderLabel: string | null;
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
  salesOrderNumbers?: ReadonlyMap<string, string>,
): RmaRow {
  const salesOrderId = clean(request.salesOrderId);
  return {
    id: request.id,
    rmaNumber: clean(request.rmaNumber) ?? "-",
    customerName: clean(customerNames?.get(request.customerId)) ?? null,
    itemDescription: clean(request.itemDescription) ?? "-",
    serialNumber: clean(request.serialNumber),
    reason: clean(request.reason) ?? "-",
    status: request.status,
    disposition: request.disposition ?? null,
    salesOrderLabel: clean(
      salesOrderId ? salesOrderNumbers?.get(salesOrderId) : null,
    ),
    salesOrderLinked: Boolean(salesOrderId),
    reportedAt: request.createdAt,
  };
}

export function buildRmaRows(
  requests: RmaRequestDto[] | undefined | null,
  customerNames?: ReadonlyMap<string, string>,
  salesOrderNumbers?: ReadonlyMap<string, string>,
): RmaRow[] {
  if (!requests?.length) return [];
  return requests.map((request) =>
    toRmaRow(request, customerNames, salesOrderNumbers),
  );
}

export function toSalesOrderNumberMap(
  orders: Array<{ id: string; orderNumber?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const order of orders ?? []) {
    const number = clean(order.orderNumber);
    if (number) map.set(order.id, number);
  }
  return map;
}
