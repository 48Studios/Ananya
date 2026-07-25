import {
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { warehouses } from "./warehouses";

export const cycleCounts = pgTable(
  "cycle_counts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    name: varchar("name", { length: 128 }).notNull(),
    frequency: varchar("frequency", { length: 32 }).notNull().default("MONTHLY"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    selectionRule: jsonb("selection_rule"),
    nextScheduledDate: timestamp("next_scheduled_date", {
      withTimezone: true,
    }).notNull(),
    lastExecutedAt: timestamp("last_executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("cycle_counts_warehouse_id_idx").on(table.warehouseId),
    index("cycle_counts_status_idx").on(table.status),
  ],
);

export type CycleCountRecord = typeof cycleCounts.$inferSelect;
export type NewCycleCountRecord = typeof cycleCounts.$inferInsert;
