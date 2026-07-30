import { inventoryProjections } from "../../schema/inventory-projections";
import { inventoryTransactions as txTable } from "../../schema/inventory-transactions";
import type { SeedContext } from "../types";
import { ctxId } from "../types";
import { deterministicUuid, seedKey } from "../helpers/deterministic-id";
import { demoRng } from "../helpers/rng";
import { atDayOffset, DEMO_ORG_CREATED } from "../helpers/dates";
import { DEMO_USERS } from "../fixtures/reference-data";
import {
  stockQuantityForProfile,
  type ProductDefinition,
} from "../fixtures/products";
import { insertBatch, upsertBatch, sql } from "../helpers/batch-upsert";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<Record<string, never>>;

interface LedgerEntry {
  id: string;
  componentKey: string;
  transactionType: string;
  quantity: number;
  unitOfMeasure: string;
  sourceLocationKey?: string;
  destinationLocationKey?: string;
  reference?: string;
  reason?: string;
  createdBy: string;
  createdAt: Date;
}

export function assignProductLocations(
  ctx: SeedContext,
  locationKeys: string[],
): void {
  ctx.products.forEach((product, index) => {
    const locationKey =
      product.locationKey ?? locationKeys[index % locationKeys.length]!;
    ctx.productLocation.set(product.key, locationKey);

    const rngValue = demoRng.next();
    const qty = (product as unknown as { purchaseQty?: number }).purchaseQty !== undefined
      ? (product as unknown as { purchaseQty: number }).purchaseQty
      : stockQuantityForProfile(
          product.stockProfile,
          rngValue,
          product.stockOverride,
        );
    ctx.productStock.set(product.key, qty);
    ctx.productCost.set(product.key, product.unitCostInr);
  });
}

export async function seedInventoryLedger(
  db: Db,
  ctx: SeedContext,
): Promise<void> {
  const entries: LedgerEntry[] = [];
  const balanceByComponentLocation = new Map<string, number>();

  const bump = (componentKey: string, locationKey: string, delta: number) => {
    const mapKey = `${componentKey}:${locationKey}`;
    balanceByComponentLocation.set(
      mapKey,
      (balanceByComponentLocation.get(mapKey) ?? 0) + delta,
    );
  };

  let txIndex = 0;
  const pushTx = (entry: Omit<LedgerEntry, "id">) => {
    txIndex += 1;
    entries.push({
      id: deterministicUuid(seedKey("txn", txIndex)),
      ...entry,
    });
  };

  // Initial stock at org creation
  for (const product of ctx.products) {
    const qty = ctx.productStock.get(product.key) ?? 0;
    if (qty <= 0) continue;

    const locationKey = ctx.productLocation.get(product.key)!;
    pushTx({
      componentKey: product.key,
      transactionType: "InitialStock",
      quantity: qty,
      unitOfMeasure: product.unit,
      destinationLocationKey: locationKey,
      reference: "SEED-INIT",
      reason: "Opening balance for demo seed",
      createdBy: "demo.admin",
      createdAt: DEMO_ORG_CREATED,
    });
    bump(product.key, locationKey, qty);
  }

  // Six months of operational history (~3500 transactions)
  const totalDays = 180;
  const projectKeys = ctx.products.length > 0
    ? Array.from(ctx.ids.project.keys())
    : [];

  for (let day = 0; day < totalDays; day += 1) {
    const dailyCount = demoRng.int(12, 22);
    for (let n = 0; n < dailyCount; n += 1) {
      const product = demoRng.pick(ctx.products);
      const locationKey = ctx.productLocation.get(product.key)!;
      const hour = demoRng.int(8, 18);
      const minute = demoRng.int(0, 59);
      const createdAt = atDayOffset(day, hour, minute);
      const user = demoRng.pick(DEMO_USERS);
      const roll = demoRng.int(1, 100);

      if (roll <= 35) {
        const qty = issueQuantity(product);
        const mapKey = `${product.key}:${locationKey}`;
        if ((balanceByComponentLocation.get(mapKey) ?? 0) < qty) continue;

        const projectKey =
          projectKeys.length > 0 ? demoRng.pick(projectKeys) : undefined;
        pushTx({
          componentKey: product.key,
          transactionType: "Issue",
          quantity: qty,
          unitOfMeasure: product.unit,
          sourceLocationKey: locationKey,
          reference: projectKey
            ? `PRJ-ISSUE-${projectKey}`
            : `WO-${1000 + day}`,
          reason: projectKey
            ? `Issued to project ${projectKey}`
            : "Work order consumption",
          createdBy: user,
          createdAt,
        });
        bump(product.key, locationKey, -qty);
      } else if (roll <= 60) {
        const qty = receiptQuantity(product);
        pushTx({
          componentKey: product.key,
          transactionType: "Receipt",
          quantity: qty,
          unitOfMeasure: product.unit,
          destinationLocationKey: locationKey,
          reference: `PO-RCV-${202600 + day}-${n}`,
          reason: "Purchase order receipt",
          createdBy: user,
          createdAt,
        });
        bump(product.key, locationKey, qty);
      } else if (roll <= 72) {
        const altLocations = ctx.products
          .map((p) => ctx.productLocation.get(p.key)!)
          .filter((loc) => loc !== locationKey);
        if (altLocations.length === 0) continue;

        const destKey = demoRng.pick(altLocations);
        const qty = transferQuantity(product);
        const mapKey = `${product.key}:${locationKey}`;
        if ((balanceByComponentLocation.get(mapKey) ?? 0) < qty) continue;

        pushTx({
          componentKey: product.key,
          transactionType: "Transfer",
          quantity: qty,
          unitOfMeasure: product.unit,
          sourceLocationKey: locationKey,
          destinationLocationKey: destKey,
          reference: `XFR-${5000 + day}-${n}`,
          reason: "Inter-location transfer",
          createdBy: user,
          createdAt,
        });
        bump(product.key, locationKey, -qty);
        bump(product.key, destKey, qty);
      } else if (roll <= 84) {
        const qty = adjustmentQuantity(product);
        const mapKey = `${product.key}:${locationKey}`;
        const current = balanceByComponentLocation.get(mapKey) ?? 0;
        const delta = demoRng.next() > 0.5 ? qty : -Math.min(qty, current);
        if (delta === 0) continue;

        pushTx({
          componentKey: product.key,
          transactionType: "Adjustment",
          quantity: Math.abs(delta),
          unitOfMeasure: product.unit,
          sourceLocationKey: delta < 0 ? locationKey : undefined,
          destinationLocationKey: delta > 0 ? locationKey : undefined,
          reference: `ADJ-${7000 + day}-${n}`,
          reason: "Cycle count adjustment",
          createdBy: user,
          createdAt,
        });
        bump(product.key, locationKey, delta);
      } else if (roll <= 94) {
        const qty = issueQuantity(product);
        const mapKey = `${product.key}:${locationKey}`;
        if ((balanceByComponentLocation.get(mapKey) ?? 0) < qty) continue;

        pushTx({
          componentKey: product.key,
          transactionType: "Consumption",
          quantity: qty,
          unitOfMeasure: product.unit,
          sourceLocationKey: locationKey,
          reference: `ASM-${8000 + day}-${n}`,
          reason: "Production consumption",
          createdBy: user,
          createdAt,
        });
        bump(product.key, locationKey, -qty);
      } else {
        const qty = Math.max(1, Math.floor(receiptQuantity(product) * 0.3));
        pushTx({
          componentKey: product.key,
          transactionType: "Return",
          quantity: qty,
          unitOfMeasure: product.unit,
          destinationLocationKey: locationKey,
          reference: `RTN-${9000 + day}-${n}`,
          reason: "Returned unused material from project",
          createdBy: user,
          createdAt,
        });
        bump(product.key, locationKey, qty);
      }
    }
  }

  // Reconcile projections to target demo stock levels (override ledger drift for key SKUs)
  for (const product of ctx.products) {
    const target = ctx.productStock.get(product.key) ?? 0;
    const locationKey = ctx.productLocation.get(product.key)!;
    balanceByComponentLocation.set(`${product.key}:${locationKey}`, target);
  }

  const txRows = entries.map((entry) => ({
    id: entry.id,
    componentId: ctxId(ctx, "component", entry.componentKey),
    transactionType: entry.transactionType,
    quantity: entry.quantity,
    unitOfMeasure: entry.unitOfMeasure,
    sourceLocationId: entry.sourceLocationKey
      ? ctxId(ctx, "location", entry.sourceLocationKey)
      : null,
    destinationLocationId: entry.destinationLocationKey
      ? ctxId(ctx, "location", entry.destinationLocationKey)
      : null,
    reference: entry.reference ?? null,
    reason: entry.reason ?? null,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt,
  }));

  await insertBatch(db, txTable, txRows, 500);

  const projectionRows = ctx.products.map((product) => {
    const locationKey = ctx.productLocation.get(product.key)!;
    const qty = ctx.productStock.get(product.key) ?? 0;
    return {
      id: deterministicUuid(seedKey("projection", product.key, locationKey)),
      componentId: ctxId(ctx, "component", product.key),
      locationId: ctxId(ctx, "location", locationKey),
      quantity: qty,
      unitOfMeasure: product.unit,
      lastUpdated: atDayOffset(totalDays - 1, 17, 0),
    };
  });

  await upsertBatch(
    db,
    inventoryProjections,
    projectionRows,
    [
      inventoryProjections.componentId,
      inventoryProjections.locationId,
    ],
    {
      quantity: sql`excluded.quantity`,
      unitOfMeasure: sql`excluded.unit_of_measure`,
      lastUpdated: sql`excluded.last_updated`,
    },
    500,
  );
}

function issueQuantity(product: ProductDefinition): number {
  switch (product.stockProfile) {
    case "resistor":
    case "mlcc":
    case "led":
      return demoRng.int(20, 200);
    case "mosfet":
    case "connector":
      return demoRng.int(2, 20);
    case "devboard":
    case "sensor":
      return demoRng.int(1, 3);
    case "tool":
      return 1;
    default:
      return demoRng.int(5, 40);
  }
}

function receiptQuantity(product: ProductDefinition): number {
  switch (product.stockProfile) {
    case "resistor":
      return demoRng.int(1000, 5000);
    case "mlcc":
      return demoRng.int(500, 3000);
    case "mosfet":
      return demoRng.int(50, 200);
    case "connector":
      return demoRng.int(10, 80);
    case "devboard":
      return demoRng.int(5, 15);
    case "sensor":
      return demoRng.int(3, 10);
    case "tool":
      return demoRng.int(1, 2);
    default:
      return demoRng.int(25, 150);
  }
}

function transferQuantity(product: ProductDefinition): number {
  return Math.max(1, Math.floor(issueQuantity(product) * 0.5));
}

function adjustmentQuantity(product: ProductDefinition): number {
  return Math.max(1, Math.floor(issueQuantity(product) * 0.25));
}
