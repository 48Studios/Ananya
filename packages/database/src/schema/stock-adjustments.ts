import {
  integer,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { locations } from "./locations";
import { components } from "./components";

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adjustmentNumber: varchar("adjustment_number", { length: 64 }).notNull(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    reason: varchar("reason", { length: 256 }).notNull(),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 128 })
      .notNull()
      .default("SYSTEM"),
    approvedBy: varchar("approved_by", { length: 128 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("stock_adjustments_number_unique").on(table.adjustmentNumber),
    index("stock_adjustments_location_id_idx").on(table.locationId),
    index("stock_adjustments_status_idx").on(table.status),
  ],
);

export const stockAdjustmentLines = pgTable(
  "stock_adjustment_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stockAdjustmentId: uuid("stock_adjustment_id")
      .notNull()
      .references(() => stockAdjustments.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    currentQuantity: integer("current_quantity").notNull().default(0),
    countedQuantity: integer("counted_quantity").notNull().default(0),
    difference: integer("difference").notNull().default(0),
    unitOfMeasure: varchar("unit_of_measure", { length: 32 })
      .notNull()
      .default("pcs"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("stock_adjustment_lines_adj_id_idx").on(table.stockAdjustmentId),
    index("stock_adjustment_lines_comp_id_idx").on(table.componentId),
  ],
);

export type StockAdjustmentRecord = typeof stockAdjustments.$inferSelect;
export type NewStockAdjustmentRecord = typeof stockAdjustments.$inferInsert;
export type StockAdjustmentLineRecord =
  typeof stockAdjustmentLines.$inferSelect;
export type NewStockAdjustmentLineRecord =
  typeof stockAdjustmentLines.$inferInsert;
