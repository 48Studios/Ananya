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
import { billOfMaterials } from "./bill-of-materials";
import { locations } from "./locations";

export const productionOrders = pgTable(
  "production_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productionNumber: varchar("production_number", { length: 64 }).notNull(),
    bomId: uuid("bom_id")
      .notNull()
      .references(() => billOfMaterials.id),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    locationId: uuid("location_id").references(() => locations.id),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    priority: varchar("priority", { length: 32 }).notNull().default("NORMAL"),
    quantityPlanned: integer("quantity_planned").notNull().default(1),
    quantityCompleted: integer("quantity_completed").notNull().default(0),
    quantityScrapped: integer("quantity_scrapped").notNull().default(0),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    notes: text("notes"),
    createdBy: varchar("created_by", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("production_orders_number_unique").on(table.productionNumber),
    index("production_orders_bom_id_idx").on(table.bomId),
    index("production_orders_component_id_idx").on(table.componentId),
    index("production_orders_location_id_idx").on(table.locationId),
    index("production_orders_status_idx").on(table.status),
  ],
);

export const productionOrderOperations = pgTable(
  "production_order_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrders.id, { onDelete: "cascade" }),
    operationName: varchar("operation_name", { length: 128 }).notNull(),
    sequence: integer("sequence").notNull().default(1),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("production_order_operations_order_id_idx").on(
      table.productionOrderId,
    ),
  ],
);

export type ProductionOrderRecord = typeof productionOrders.$inferSelect;
export type NewProductionOrderRecord = typeof productionOrders.$inferInsert;
export type ProductionOrderOperationRecord =
  typeof productionOrderOperations.$inferSelect;
export type NewProductionOrderOperationRecord =
  typeof productionOrderOperations.$inferInsert;
