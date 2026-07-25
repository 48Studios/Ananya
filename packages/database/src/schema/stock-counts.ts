import {
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { warehouses, warehouseBins } from "./warehouses";
import { components } from "./components";

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    countNumber: varchar("count_number", { length: 64 }).notNull(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    assignedUser: varchar("assigned_user", { length: 128 }),
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
    uniqueIndex("stock_counts_number_unique").on(table.countNumber),
    index("stock_counts_warehouse_id_idx").on(table.warehouseId),
    index("stock_counts_status_idx").on(table.status),
  ],
);

export const stockCountLines = pgTable(
  "stock_count_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stockCountId: uuid("stock_count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    binId: uuid("bin_id")
      .notNull()
      .references(() => warehouseBins.id),
    expectedQuantity: decimal("expected_quantity", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0.0000"),
    countedQuantity: decimal("counted_quantity", { precision: 12, scale: 4 })
      .notNull()
      .default("0.0000"),
    variance: decimal("variance", { precision: 12, scale: 4 })
      .notNull()
      .default("0.0000"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("stock_count_lines_count_id_idx").on(table.stockCountId),
    index("stock_count_lines_component_id_idx").on(table.componentId),
    index("stock_count_lines_bin_id_idx").on(table.binId),
  ],
);

export type StockCountRecord = typeof stockCounts.$inferSelect;
export type NewStockCountRecord = typeof stockCounts.$inferInsert;
export type StockCountLineRecord = typeof stockCountLines.$inferSelect;
export type NewStockCountLineRecord = typeof stockCountLines.$inferInsert;
