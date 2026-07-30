import {
  cycleCountLines,
  cycleCounts,
  type NewCycleCountRecord,
  type NewCycleCountLineRecord,
} from "../../schema/cycle-counts";
import {
  stockAdjustmentLines,
  stockAdjustments,
  type NewStockAdjustmentRecord,
  type NewStockAdjustmentLineRecord,
} from "../../schema/stock-adjustments";
import {
  stockCountLines,
  stockCounts,
  type NewStockCountRecord,
  type NewStockCountLineRecord,
} from "../../schema/stock-counts";
import {
  warehouseTransferLines,
  warehouseTransfers,
  type NewWarehouseTransferRecord,
  type NewWarehouseTransferLineRecord,
} from "../../schema/warehouse-transfers";
import {
  inventoryReservationLines,
  inventoryReservations,
  type NewInventoryReservationRecord,
  type NewInventoryReservationLineRecord,
} from "../../schema/inventory-reservations";
import type { SeedContext } from "../types";
import { ctxId } from "../types";
import { deterministicUuid, seedKey } from "../helpers/deterministic-id";
import { demoRng } from "../helpers/rng";
import { atDayOffset } from "../helpers/dates";
import { DEMO_USERS } from "../fixtures/reference-data";
import { insertBatch, upsertBatch, sql } from "../helpers/batch-upsert";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<Record<string, never>>;

export async function seedWarehouseOperations(
  db: Db,
  ctx: SeedContext,
): Promise<void> {
  await seedTransfers(db, ctx);
  await seedAdjustments(db, ctx);
  await seedCycleCounts(db, ctx);
  await seedStockCounts(db, ctx);
  await seedReservations(db, ctx);
}

async function seedTransfers(db: Db, ctx: SeedContext): Promise<void> {
  const transferRows: NewWarehouseTransferRecord[] = [];
  const lineRows: NewWarehouseTransferLineRecord[] = [];

  for (let i = 1; i <= 40; i += 1) {
    const key = `transfer-${i}`;
    const id = deterministicUuid(seedKey("warehouse-transfer", key));
    ctx.ids.warehouseTransfer.set(key, id);

    const products = demoRng.shuffle(ctx.products).slice(0, demoRng.int(1, 4));
    const day = demoRng.int(10, 170);
    const createdAt = atDayOffset(day, 14, 0);
    const status = demoRng.pick([
      "COMPLETED",
      "COMPLETED",
      "IN_TRANSIT",
      "DRAFT",
    ] as const);

    const sourceKey = ctx.productLocation.get(products[0]!.key)!;
    const destCandidates = ctx.products
      .map((p) => ctx.productLocation.get(p.key)!)
      .filter((loc) => loc !== sourceKey);
    const destKey = demoRng.pick(destCandidates);

    transferRows.push({
      id,
      transferNumber: `TRF-2026-${String(i).padStart(4, "0")}`,
      sourceLocationId: ctxId(ctx, "location", sourceKey),
      destinationLocationId: ctxId(ctx, "location", destKey),
      status,
      requestedDate: createdAt,
      dispatchedAt:
        status === "DRAFT" ? null : atDayOffset(day, 15, 0),
      receivedAt:
        status === "COMPLETED" ? atDayOffset(day + 1, 10, 0) : null,
      requestedBy: demoRng.pick(DEMO_USERS),
      notes: "Demo warehouse transfer",
      createdAt,
      updatedAt: createdAt,
    });

    products.forEach((product, lineIndex) => {
      lineRows.push({
        id: deterministicUuid(seedKey("transfer-line", key, lineIndex)),
        transferId: id,
        componentId: ctxId(ctx, "component", product.key),
        quantity: String(demoRng.int(5, 100)),
        unitOfMeasure: product.unit,
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });
    });
  }

  await upsertBatch(
    db,
    warehouseTransfers,
    transferRows,
    warehouseTransfers.transferNumber,
    {
      status: sql`excluded.status`,
      dispatchedAt: sql`excluded.dispatched_at`,
      receivedAt: sql`excluded.received_at`,
      updatedAt: sql`excluded.updated_at`,
    },
    100,
  );
  await insertBatch(db, warehouseTransferLines, lineRows, 500);
}

async function seedAdjustments(db: Db, ctx: SeedContext): Promise<void> {
  const adjustmentRows: NewStockAdjustmentRecord[] = [];
  const lineRows: NewStockAdjustmentLineRecord[] = [];

  for (let i = 1; i <= 24; i += 1) {
    const key = `adjustment-${i}`;
    const id = deterministicUuid(seedKey("stock-adjustment", key));
    ctx.ids.stockAdjustment.set(key, id);

    const product = demoRng.pick(ctx.products);
    const locationKey = ctx.productLocation.get(product.key)!;
    const day = demoRng.int(20, 175);
    const createdAt = atDayOffset(day, 11, 30);
    const current = ctx.productStock.get(product.key) ?? 0;
    const counted = current + demoRng.int(-15, 15);
    const difference = counted - current;

    adjustmentRows.push({
      id,
      adjustmentNumber: `ADJ-2026-${String(i).padStart(4, "0")}`,
      locationId: ctxId(ctx, "location", locationKey),
      status: demoRng.pick(["APPROVED", "APPROVED", "PENDING"] as const),
      reason: demoRng.pick([
        "Cycle count variance",
        "Damaged stock write-off",
        "Found stock during audit",
        "Label mismatch correction",
      ]),
      notes: "Demo stock adjustment",
      createdBy: demoRng.pick(DEMO_USERS),
      approvedBy: "demo.admin",
      approvedAt: atDayOffset(day, 16, 0),
      createdAt,
      updatedAt: createdAt,
    });

    lineRows.push({
      id: deterministicUuid(seedKey("adjustment-line", key)),
      stockAdjustmentId: id,
      componentId: ctxId(ctx, "component", product.key),
      currentQuantity: current,
      countedQuantity: counted,
      difference,
      unitOfMeasure: product.unit,
      createdAt,
      updatedAt: createdAt,
    });
  }

  await upsertBatch(
    db,
    stockAdjustments,
    adjustmentRows,
    stockAdjustments.adjustmentNumber,
    {
      status: sql`excluded.status`,
      approvedAt: sql`excluded.approved_at`,
      updatedAt: sql`excluded.updated_at`,
    },
    100,
  );
  await insertBatch(db, stockAdjustmentLines, lineRows, 200);
}

async function seedCycleCounts(db: Db, ctx: SeedContext): Promise<void> {
  const countRows: NewCycleCountRecord[] = [];
  const lineRows: NewCycleCountLineRecord[] = [];

  for (let i = 1; i <= 18; i += 1) {
    const key = `cycle-count-${i}`;
    const id = deterministicUuid(seedKey("cycle-count", key));
    ctx.ids.cycleCount.set(key, id);

    const locationKeys = Array.from(ctx.ids.location.keys()).filter((k) =>
      k.includes(":bin-"),
    );
    const locationKey = demoRng.pick(locationKeys);
    const day = demoRng.int(15, 170);
    const scheduled = atDayOffset(day, 9, 0);
    const status = demoRng.pick([
      "COMPLETED",
      "COMPLETED",
      "COUNTING",
      "DRAFT",
    ] as const);

    countRows.push({
      id,
      countNumber: `CC-2026-${String(i).padStart(4, "0")}`,
      locationId: ctxId(ctx, "location", locationKey),
      status,
      assignedCounter: demoRng.pick(DEMO_USERS),
      scheduledDate: scheduled,
      completedAt:
        status === "COMPLETED" ? atDayOffset(day, 15, 0) : null,
      approvedAt:
        status === "COMPLETED" ? atDayOffset(day, 16, 30) : null,
      createdBy: "demo.admin",
      approvedBy: status === "COMPLETED" ? "demo.admin" : null,
      stockAdjustmentId: null,
      notes: "Demo cycle count",
      createdAt: scheduled,
      updatedAt: scheduled,
    });

    const lines = demoRng.shuffle(ctx.products).slice(0, demoRng.int(4, 10));
    lines.forEach((product, lineIndex) => {
      const systemQty = ctx.productStock.get(product.key) ?? 0;
      const countedQty = systemQty + demoRng.int(-5, 5);
      lineRows.push({
        id: deterministicUuid(seedKey("cycle-count-line", key, lineIndex)),
        cycleCountId: id,
        componentId: ctxId(ctx, "component", product.key),
        systemQuantity: String(systemQty),
        countedQuantity: String(countedQty),
        variance: String(countedQty - systemQty),
        unitOfMeasure: product.unit,
        notes: null,
        createdAt: scheduled,
        updatedAt: scheduled,
      });
    });
  }

  await upsertBatch(
    db,
    cycleCounts,
    countRows,
    cycleCounts.countNumber,
    {
      status: sql`excluded.status`,
      completedAt: sql`excluded.completed_at`,
      approvedAt: sql`excluded.approved_at`,
      updatedAt: sql`excluded.updated_at`,
    },
    100,
  );
  await insertBatch(db, cycleCountLines, lineRows, 500);
}

async function seedStockCounts(db: Db, ctx: SeedContext): Promise<void> {
  const countRows: NewStockCountRecord[] = [];
  const lineRows: NewStockCountLineRecord[] = [];
  const warehouseCodes = Array.from(ctx.ids.warehouse.keys());
  const binCodes = Array.from(ctx.ids.warehouseBin.keys());

  for (let i = 1; i <= 8; i += 1) {
    const key = `stock-count-${i}`;
    const id = deterministicUuid(seedKey("stock-count", key));
    ctx.ids.stockCount.set(key, id);

    const warehouseCode = demoRng.pick(warehouseCodes);
    const day = demoRng.int(30, 160);
    const createdAt = atDayOffset(day, 8, 0);

    countRows.push({
      id,
      countNumber: `SC-2026-${String(i).padStart(4, "0")}`,
      warehouseId: ctxId(ctx, "warehouse", warehouseCode),
      assignedUser: demoRng.pick(DEMO_USERS),
      status: demoRng.pick(["POSTED", "POSTED", "IN_PROGRESS"] as const),
      postedAt: atDayOffset(day, 17, 0),
      createdAt,
      updatedAt: createdAt,
    });

    const lines = demoRng.shuffle(ctx.products).slice(0, demoRng.int(6, 12));
    lines.forEach((product, lineIndex) => {
      const expected = ctx.productStock.get(product.key) ?? 0;
      const counted = expected + demoRng.int(-3, 3);
      lineRows.push({
        id: deterministicUuid(seedKey("stock-count-line", key, lineIndex)),
        stockCountId: id,
        componentId: ctxId(ctx, "component", product.key),
        binId: ctxId(ctx, "warehouseBin", demoRng.pick(binCodes)),
        expectedQuantity: String(expected),
        countedQuantity: String(counted),
        variance: String(counted - expected),
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });
    });
  }

  await upsertBatch(
    db,
    stockCounts,
    countRows,
    stockCounts.countNumber,
    {
      status: sql`excluded.status`,
      postedAt: sql`excluded.posted_at`,
      updatedAt: sql`excluded.updated_at`,
    },
    50,
  );
  await insertBatch(db, stockCountLines, lineRows, 500);
}

async function seedReservations(db: Db, ctx: SeedContext): Promise<void> {
  const reservationRows: NewInventoryReservationRecord[] = [];
  const lineRows: NewInventoryReservationLineRecord[] = [];
  const projectKeys = Array.from(ctx.ids.project.keys());

  for (let i = 1; i <= 15; i += 1) {
    const key = `reservation-${i}`;
    const id = deterministicUuid(seedKey("reservation", key));
    ctx.ids.reservation.set(key, id);
    const day = demoRng.int(5, 160);
    const createdAt = atDayOffset(day, 10, 0);
    const projectKey = demoRng.pick(projectKeys);

    reservationRows.push({
      id,
      reservationNumber: `RSV-2026-${String(i).padStart(4, "0")}`,
      reservationType: "WORK_ORDER",
      referenceDocument: projectKey,
      reservedBy: demoRng.pick(DEMO_USERS),
      status: demoRng.pick(["ACTIVE", "ACTIVE", "FULFILLED", "CANCELLED"] as const),
      notes: `Reserved for ${projectKey}`,
      createdAt,
      updatedAt: createdAt,
      expiresAt: atDayOffset(day + 14, 17, 0),
    });

    const lines = demoRng.shuffle(ctx.products).slice(0, demoRng.int(2, 5));
    lines.forEach((product, lineIndex) => {
      const qty = demoRng.int(5, 50);
      lineRows.push({
        id: deterministicUuid(seedKey("reservation-line", key, lineIndex)),
        reservationId: id,
        componentId: ctxId(ctx, "component", product.key),
        locationId: ctxId(
          ctx,
          "location",
          ctx.productLocation.get(product.key)!,
        ),
        reservedQuantity: String(qty),
        fulfilledQuantity: String(Math.floor(qty * demoRng.next())),
        unitOfMeasure: product.unit,
        notes: null,
        createdAt,
        updatedAt: createdAt,
      });
    });
  }

  await upsertBatch(
    db,
    inventoryReservations,
    reservationRows,
    inventoryReservations.reservationNumber,
    {
      status: sql`excluded.status`,
      updatedAt: sql`excluded.updated_at`,
    },
    50,
  );
  await insertBatch(db, inventoryReservationLines, lineRows, 200);
}
