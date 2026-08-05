import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { purchaseOrders, purchaseOrderLines } from "./purchase-orders";
import { suppliers } from "./suppliers";
import { components } from "./components";
import { locations } from "./locations";

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    grNumber: varchar("gr_number", { length: 64 }).notNull(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    packingSlipNumber: varchar("packing_slip_number", { length: 128 }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("goods_receipts_gr_number_unique").on(table.grNumber),
    index("goods_receipts_po_id_idx").on(table.purchaseOrderId),
    index("goods_receipts_supplier_id_idx").on(table.supplierId),
  ],
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    goodsReceiptId: uuid("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    poLineId: uuid("po_line_id")
      .notNull()
      .references(() => purchaseOrderLines.id),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantityReceived: integer("quantity_received").notNull().default(0),
    quantityRejected: integer("quantity_rejected").notNull().default(0),
    batchNumber: varchar("batch_number", { length: 128 }),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    serialNumbers: jsonb("serial_numbers")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("goods_receipt_lines_gr_id_idx").on(table.goodsReceiptId),
    index("goods_receipt_lines_po_line_id_idx").on(table.poLineId),
    index("goods_receipt_lines_component_id_idx").on(table.componentId),
    index("goods_receipt_lines_location_id_idx").on(table.locationId),
  ],
);

export type GoodsReceiptRecord = typeof goodsReceipts.$inferSelect;
export type NewGoodsReceiptRecord = typeof goodsReceipts.$inferInsert;
export type GoodsReceiptLineRecord = typeof goodsReceiptLines.$inferSelect;
export type NewGoodsReceiptLineRecord = typeof goodsReceiptLines.$inferInsert;
