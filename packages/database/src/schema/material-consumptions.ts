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
import { components } from "./components";
import { locations } from "./locations";
import { productionOrders } from "./production-orders";

export const materialConsumptions = pgTable(
  "material_consumptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    consumptionNumber: varchar("consumption_number", { length: 64 }).notNull(),
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
    uniqueIndex("material_consumptions_number_unique").on(
      table.consumptionNumber,
    ),
    index("material_consumptions_order_id_idx").on(table.productionOrderId),
    index("material_consumptions_status_idx").on(table.status),
  ],
);

export const materialConsumptionLines = pgTable(
  "material_consumption_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    consumptionId: uuid("consumption_id")
      .notNull()
      .references(() => materialConsumptions.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantityPlanned: decimal("quantity_planned", { precision: 12, scale: 4 })
      .notNull()
      .default("0.0000"),
    quantityConsumed: decimal("quantity_consumed", { precision: 12, scale: 4 })
      .notNull(),
    batchNumber: varchar("batch_number", { length: 128 }),
    serialNumbers: text("serial_numbers").array(),
    consumedAt: timestamp("consumed_at", { withTimezone: true })
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
    index("material_consumption_lines_consumption_id_idx").on(
      table.consumptionId,
    ),
    index("material_consumption_lines_component_id_idx").on(table.componentId),
    index("material_consumption_lines_location_id_idx").on(table.locationId),
  ],
);

export type MaterialConsumptionRecord =
  typeof materialConsumptions.$inferSelect;
export type NewMaterialConsumptionRecord =
  typeof materialConsumptions.$inferInsert;
export type MaterialConsumptionLineRecord =
  typeof materialConsumptionLines.$inferSelect;
export type NewMaterialConsumptionLineRecord =
  typeof materialConsumptionLines.$inferInsert;
