import {
  goodsReceiptLines,
  goodsReceipts,
  type NewGoodsReceiptRecord,
  type NewGoodsReceiptLineRecord,
} from "../../schema/goods-receipts";
import {
  purchaseOrderLines,
  purchaseOrders,
  type NewPurchaseOrderRecord,
  type NewPurchaseOrderLineRecord,
} from "../../schema/purchase-orders";
import { supplierComponents } from "../../schema/suppliers";
import type { SeedContext } from "../types";
import { ctxId } from "../types";
import { deterministicUuid, seedKey } from "../helpers/deterministic-id";
import { demoRng } from "../helpers/rng";
import { atDayOffset } from "../helpers/dates";
import { insertBatch, upsertBatch, sql } from "../helpers/batch-upsert";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<Record<string, never>>;

const PO_STATUSES = [
  "FULFILLED",
  "FULFILLED",
  "PARTIALLY_RECEIVED",
  "ISSUED",
  "APPROVED",
  "DRAFT",
] as const;

export async function seedSupplierComponents(
  db: Db,
  ctx: SeedContext,
): Promise<void> {
  const rows = ctx.products.map((product) => ({
    id: deterministicUuid(seedKey("supplier-component", product.key, product.supplierCode)),
    supplierId: ctxId(ctx, "supplier", product.supplierCode),
    componentId: ctxId(ctx, "component", product.key),
    vendorPartNumber: product.vendorPartNumber,
    leadTimeDays: leadTimeForSupplier(product.supplierCode),
    minimumOrderQuantity: moqForProfile(product.stockProfile),
    orderMultiple: product.stockProfile === "resistor" || product.stockProfile === "mlcc" ? 100 : 1,
    unitPrice: product.unitCostInr.toFixed(4),
    currency: "INR",
    createdAt: atDayOffset(0, 9, 0),
    updatedAt: atDayOffset(0, 9, 0),
  }));

  await insertBatch(db, supplierComponents, rows, 500);
}

import { INITIAL_PURCHASE_ITEMS } from "../fixtures/initial-purchase";

export async function seedProcurementHistory(
  db: Db,
  ctx: SeedContext,
): Promise<void> {
  const poRows: NewPurchaseOrderRecord[] = [];
  const poLineRows: NewPurchaseOrderLineRecord[] = [];
  const grRows: NewGoodsReceiptRecord[] = [];
  const grLineRows: NewGoodsReceiptLineRecord[] = [];

  const supplierCodes = Array.from(ctx.ids.supplier.keys());
  let poCounter = 0;
  let grCounter = 0;

  for (let week = 0; week < 26; week += 1) {
    const posThisWeek = demoRng.int(2, 5);
    for (let p = 0; p < posThisWeek; p += 1) {
      poCounter += 1;
      const poKey = `po-${poCounter}`;
      const isInitialPurchase = poCounter === 1;

      const supplierCode = isInitialPurchase ? "lcsc" : demoRng.pick(supplierCodes);
      const day = isInitialPurchase ? 0 : week * 7 + demoRng.int(0, 6);
      const createdAt = isInitialPurchase ? atDayOffset(0, 10, 0) : atDayOffset(day, demoRng.int(9, 16), demoRng.int(0, 59));
      const status = isInitialPurchase ? "FULFILLED" : PO_STATUSES[demoRng.int(0, PO_STATUSES.length - 1)]!;

      const lineProducts = isInitialPurchase
        ? INITIAL_PURCHASE_ITEMS
        : demoRng.shuffle(ctx.products).slice(0, demoRng.int(3, 8));

      let subtotal = 0;
      let taxTotal = 0;
      const poId = deterministicUuid(seedKey("purchase-order", poKey));

      ctx.ids.purchaseOrder.set(poKey, poId);

      for (let li = 0; li < lineProducts.length; li += 1) {
        const product = lineProducts[li]!;
        const initItem = isInitialPurchase ? (product as (typeof INITIAL_PURCHASE_ITEMS)[number]) : undefined;
        const qty = initItem ? initItem.purchaseQty : orderQty(product);
        const unitPrice = initItem ? initItem.purchaseUnitCostInr : product.unitCostInr;
        const taxRate = 18;
        const lineTotal = unitPrice * qty;
        const tax = (lineTotal * taxRate) / 100;
        subtotal += lineTotal;
        taxTotal += tax;

        const poLineKey = `${poKey}:line-${li + 1}`;
        const poLineId = deterministicUuid(seedKey("po-line", poLineKey));
        ctx.ids.poLine.set(poLineKey, poLineId);

        const received =
          status === "FULFILLED"
            ? qty
            : status === "PARTIALLY_RECEIVED"
              ? Math.floor(qty * 0.6)
              : 0;

        poLineRows.push({
          id: poLineId,
          purchaseOrderId: poId,
          componentId: ctxId(ctx, "component", product.key),
          vendorPartNumber: product.vendorPartNumber,
          unitPrice: unitPrice.toFixed(4),
          quantityOrdered: qty,
          quantityReceived: received,
          taxRate: taxRate.toFixed(2),
          lineTotal: lineTotal.toFixed(4),
          createdAt,
          updatedAt: createdAt,
        });

        if (received > 0) {
          grCounter += 1;
          const grKey = `gr-${grCounter}`;
          const grId = deterministicUuid(seedKey("goods-receipt", grKey));
          ctx.ids.goodsReceipt.set(grKey, grId);

          const receivedAt = isInitialPurchase
            ? atDayOffset(3, 11, 0)
            : atDayOffset(day + demoRng.int(3, 10), 11, 0);

          grRows.push({
            id: grId,
            grNumber: `GR-2026-${String(grCounter).padStart(4, "0")}`,
            purchaseOrderId: poId,
            supplierId: ctxId(ctx, "supplier", supplierCode),
            status: "COMPLETED",
            packingSlipNumber: `PS-${10000 + grCounter}`,
            receivedAt,
            createdAt: receivedAt,
            updatedAt: receivedAt,
          });

          grLineRows.push({
            id: deterministicUuid(seedKey("gr-line", grKey, poLineKey)),
            goodsReceiptId: grId,
            poLineId,
            componentId: ctxId(ctx, "component", product.key),
            locationId: ctxId(
              ctx,
              "location",
              ctx.productLocation.get(product.key)!,
            ),
            quantityReceived: received,
            quantityRejected: isInitialPurchase ? 0 : (demoRng.int(0, 1) === 1 ? demoRng.int(1, 3) : 0),
            batchNumber: `LOT-${2026}${String(grCounter).padStart(4, "0")}`,
            expiryDate: null,
            serialNumbers: [],
            createdAt: receivedAt,
            updatedAt: receivedAt,
          });
        }
      }

      const grandTotal = subtotal + taxTotal;
      poRows.push({
        id: poId,
        poNumber: `PO-2026-${String(poCounter).padStart(4, "0")}`,
        supplierId: ctxId(ctx, "supplier", supplierCode),
        status,
        currency: "INR",
        subtotal: subtotal.toFixed(4),
        taxTotal: taxTotal.toFixed(4),
        grandTotal: grandTotal.toFixed(4),
        notes:
          status === "DRAFT"
            ? "Draft PO awaiting approval"
            : "Demo procurement history",
        issuedAt:
          status === "DRAFT" ? null : atDayOffset(day, 10, 0),
        expectedDeliveryDate: atDayOffset(day + demoRng.int(5, 14), 17, 0),
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  await upsertBatch(
    db,
    purchaseOrders,
    poRows,
    purchaseOrders.poNumber,
    {
      supplierId: sql`excluded.supplier_id`,
      status: sql`excluded.status`,
      subtotal: sql`excluded.subtotal`,
      taxTotal: sql`excluded.tax_total`,
      grandTotal: sql`excluded.grand_total`,
      notes: sql`excluded.notes`,
      issuedAt: sql`excluded.issued_at`,
      expectedDeliveryDate: sql`excluded.expected_delivery_date`,
      updatedAt: sql`excluded.updated_at`,
    },
    200,
  );

  await insertBatch(db, purchaseOrderLines, poLineRows, 500);
  await upsertBatch(
    db,
    goodsReceipts,
    grRows,
    goodsReceipts.grNumber,
    {
      status: sql`excluded.status`,
      receivedAt: sql`excluded.received_at`,
      updatedAt: sql`excluded.updated_at`,
    },
    200,
  );
  await insertBatch(db, goodsReceiptLines, grLineRows, 500);
}

function leadTimeForSupplier(code: string): number {
  switch (code) {
    case "lcsc":
    case "factory-direct":
      return 14;
    case "mouser":
    case "digikey":
      return 10;
    case "amazon":
    case "local-vendor":
      return 3;
    default:
      return 7;
  }
}

function moqForProfile(profile: string): number {
  switch (profile) {
    case "resistor":
    case "mlcc":
    case "led":
      return 100;
    case "mosfet":
    case "connector":
      return 10;
    case "devboard":
    case "sensor":
      return 1;
    default:
      return 5;
  }
}

function orderQty(product: { stockProfile: string; preferredStock: number }): number {
  switch (product.stockProfile) {
    case "resistor":
      return demoRng.int(2000, 10000);
    case "mlcc":
      return demoRng.int(1000, 6000);
    case "mosfet":
      return demoRng.int(100, 500);
    case "connector":
      return demoRng.int(20, 300);
    case "devboard":
      return demoRng.int(10, 40);
    case "sensor":
      return demoRng.int(5, 30);
    case "tool":
      return demoRng.int(1, 5);
    default:
      return demoRng.int(50, product.preferredStock);
  }
}
