import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { components } from "./components";
import { locations } from "./locations";
import { productionOrders } from "./production-orders";

export const finishedGoodsReceipts = pgTable(
  "finished_goods_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fgrNumber: varchar("fgr_number", { length: 64 }).notNull(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrders.id),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("finished_goods_receipts_number_unique").on(table.fgrNumber),
    index("finished_goods_receipts_order_id_idx").on(table.productionOrderId),
    index("finished_goods_receipts_status_idx").on(table.status),
  ],
);

export const finishedGoodsReceiptLines = pgTable(
  "finished_goods_receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fgrId: uuid("fgr_id")
      .notNull()
      .references(() => finishedGoodsReceipts.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantityProduced: integer("quantity_produced").notNull().default(0),
    quantityScrapped: integer("quantity_scrapped").notNull().default(0),
    batchNumber: varchar("batch_number", { length: 128 }),
    serialNumbers: text("serial_numbers").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("finished_goods_receipt_lines_fgr_id_idx").on(table.fgrId),
    index("finished_goods_receipt_lines_component_id_idx").on(
      table.componentId,
    ),
    index("finished_goods_receipt_lines_location_id_idx").on(table.locationId),
  ],
);

export type FinishedGoodsReceiptRecord =
  typeof finishedGoodsReceipts.$inferSelect;
export type NewFinishedGoodsReceiptRecord =
  typeof finishedGoodsReceipts.$inferInsert;
export type FinishedGoodsReceiptLineRecord =
  typeof finishedGoodsReceiptLines.$inferSelect;
export type NewFinishedGoodsReceiptLineRecord =
  typeof finishedGoodsReceiptLines.$inferInsert;
