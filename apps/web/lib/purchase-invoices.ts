import type { PurchaseInvoiceDto } from "./api/purchase-invoices-api";

/**
 * A purchase invoice as the UI displays it. Supplier and PO labels are resolved
 * by the caller; they stay `null` when unavailable rather than showing a UUID.
 */
export interface PurchaseInvoiceRow {
  id: string;
  invoiceNumber: string;
  vendorInvoiceNumber: string;
  supplierLabel: string | null;
  poLabel: string | null;
  totalAmount: number;
  status: PurchaseInvoiceDto["status"];
  matchStatus: PurchaseInvoiceDto["matchStatus"];
  dueDate: string;
  lineCount: number;
  componentLabels: string[];
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

export function toPurchaseInvoiceRow(
  invoice: PurchaseInvoiceDto,
  labels?: {
    supplierNames?: ReadonlyMap<string, string>;
    poNumbers?: ReadonlyMap<string, string>;
  },
): PurchaseInvoiceRow {
  const lines = invoice.lines ?? [];
  return {
    id: invoice.id,
    invoiceNumber: clean(invoice.invoiceNumber) ?? "-",
    vendorInvoiceNumber: clean(invoice.vendorInvoiceNumber) ?? "-",
    supplierLabel: clean(labels?.supplierNames?.get(invoice.supplierId)) ?? null,
    poLabel: clean(labels?.poNumbers?.get(invoice.purchaseOrderId)) ?? null,
    totalAmount: amount(invoice.totalAmount),
    status: invoice.status,
    matchStatus: invoice.matchStatus,
    dueDate: invoice.dueDate,
    lineCount: lines.length,
    componentLabels: lines
      .map((line) => clean(line.componentLabel))
      .filter((label): label is string => Boolean(label)),
  };
}

export function buildPurchaseInvoiceRows(
  invoices: PurchaseInvoiceDto[] | undefined | null,
  labels?: {
    supplierNames?: ReadonlyMap<string, string>;
    poNumbers?: ReadonlyMap<string, string>;
  },
): PurchaseInvoiceRow[] {
  if (!invoices?.length) return [];
  return invoices.map((invoice) => toPurchaseInvoiceRow(invoice, labels));
}
