import type { FinishedGoodsReceiptDto } from "./api/finished-goods-api";
import { toProductionNumberMap } from "./material-consumption";

export { toProductionNumberMap };

/**
 * A finished-goods receipt as the UI displays it.
 *
 * The receipt header records the producing work order and its status; the
 * produced components live on `lines`. There is no per-receipt SKU, warehouse
 * location, unit cost or on-hand quantity in this domain.
 */
export interface FinishedGoodsRow {
  id: string;
  fgrNumber: string;
  productionOrderLabel: string | null;
  lineCount: number;
  totalProduced: number;
  totalScrapped: number;
  componentLabels: string[];
  status: FinishedGoodsReceiptDto["status"];
  postedAt: string | null;
  createdAt: string;
}

function clean(value: string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function quantity(value: number | undefined | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toFinishedGoodsRow(
  receipt: FinishedGoodsReceiptDto,
  labels?: {
    productionNumbers?: ReadonlyMap<string, string>;
    componentNames?: ReadonlyMap<string, string>;
  },
): FinishedGoodsRow {
  const lines = receipt.lines ?? [];
  return {
    id: receipt.id,
    fgrNumber: clean(receipt.fgrNumber) ?? "-",
    productionOrderLabel:
      clean(labels?.productionNumbers?.get(receipt.productionOrderId)) ?? null,
    lineCount: lines.length,
    totalProduced: round(
      lines.reduce((total, line) => total + quantity(line.quantityProduced), 0),
    ),
    totalScrapped: round(
      lines.reduce((total, line) => total + quantity(line.quantityScrapped), 0),
    ),
    componentLabels: lines
      .map((line) => clean(labels?.componentNames?.get(line.componentId)))
      .filter((label): label is string => Boolean(label)),
    status: receipt.status,
    postedAt: receipt.postedAt ?? null,
    createdAt: receipt.createdAt,
  };
}

export function buildFinishedGoodsRows(
  receipts: FinishedGoodsReceiptDto[] | undefined | null,
  labels?: {
    productionNumbers?: ReadonlyMap<string, string>;
    componentNames?: ReadonlyMap<string, string>;
  },
): FinishedGoodsRow[] {
  if (!receipts?.length) return [];
  return receipts.map((receipt) => toFinishedGoodsRow(receipt, labels));
}
