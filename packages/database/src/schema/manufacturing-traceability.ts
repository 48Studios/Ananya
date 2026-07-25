import {
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { components } from "./components";
import { locations } from "./locations";
import { productionOrders } from "./production-orders";
import { materialConsumptions } from "./material-consumptions";
import { finishedGoodsReceipts } from "./finished-goods-receipts";

export const manufacturingTraceability = pgTable(
  "manufacturing_traceability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrders.id),
    consumptionId: uuid("consumption_id").references(
      () => materialConsumptions.id,
    ),
    fgrId: uuid("fgr_id").references(() => finishedGoodsReceipts.id),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    locationId: uuid("location_id").references(() => locations.id),
    quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
    batchNumber: varchar("batch_number", { length: 128 }),
    serialNumbers: text("serial_numbers").array(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("manufacturing_traceability_order_id_idx").on(
      table.productionOrderId,
    ),
    index("manufacturing_traceability_component_id_idx").on(table.componentId),
    index("manufacturing_traceability_event_type_idx").on(table.eventType),
    index("manufacturing_traceability_batch_number_idx").on(table.batchNumber),
    index("manufacturing_traceability_consumption_id_idx").on(
      table.consumptionId,
    ),
    index("manufacturing_traceability_fgr_id_idx").on(table.fgrId),
  ],
);

export type ManufacturingTraceabilityRecord =
  typeof manufacturingTraceability.$inferSelect;
export type NewManufacturingTraceabilityRecord =
  typeof manufacturingTraceability.$inferInsert;
