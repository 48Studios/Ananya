import type {
  ConsumptionStatus,
  MaterialConsumptionDto,
} from "./api/material-consumption-api";

/**
 * A material consumption as the UI displays it.
 *
 * The header carries no component or quantity: those live on the lines, so the
 * row shows how many lines were issued and what they add up to. Component and
 * production-order labels are resolved by the caller when available.
 */
export interface MaterialConsumptionRow {
  id: string;
  consumptionNumber: string;
  productionOrderLabel: string | null;
  lineCount: number;
  totalConsumed: number;
  componentLabels: string[];
  status: ConsumptionStatus;
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

export function toConsumptionRow(
  consumption: MaterialConsumptionDto,
  labels?: {
    productionNumbers?: ReadonlyMap<string, string>;
    componentNames?: ReadonlyMap<string, string>;
  },
): MaterialConsumptionRow {
  const lines = consumption.lines ?? [];
  return {
    id: consumption.id,
    consumptionNumber: clean(consumption.consumptionNumber) ?? "-",
    productionOrderLabel:
      clean(labels?.productionNumbers?.get(consumption.productionOrderId)) ??
      null,
    lineCount: lines.length,
    totalConsumed:
      Math.round(
        lines.reduce((total, line) => total + quantity(line.quantityConsumed), 0) *
          100,
      ) / 100,
    componentLabels: lines
      .map((line) => clean(labels?.componentNames?.get(line.componentId)))
      .filter((label): label is string => Boolean(label)),
    status: consumption.status,
    postedAt: consumption.postedAt ?? null,
    createdAt: consumption.createdAt,
  };
}

export function buildConsumptionRows(
  consumptions: MaterialConsumptionDto[] | undefined | null,
  labels?: {
    productionNumbers?: ReadonlyMap<string, string>;
    componentNames?: ReadonlyMap<string, string>;
  },
): MaterialConsumptionRow[] {
  if (!consumptions?.length) return [];
  return consumptions.map((consumption) =>
    toConsumptionRow(consumption, labels),
  );
}

export function toProductionNumberMap(
  orders: Array<{ id: string; productionNumber?: string }> | undefined | null,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const order of orders ?? []) {
    const number = clean(order.productionNumber);
    if (number) map.set(order.id, number);
  }
  return map;
}
