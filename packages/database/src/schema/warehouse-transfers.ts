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
import { locations } from "./locations";
import { components } from "./components";

export const warehouseTransfers = pgTable(
  "warehouse_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferNumber: varchar("transfer_number", { length: 64 }).notNull(),
    sourceLocationId: uuid("source_location_id")
      .notNull()
      .references(() => locations.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => locations.id),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    requestedDate: timestamp("requested_date", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    requestedBy: varchar("requested_by", { length: 128 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("warehouse_transfers_number_unique").on(table.transferNumber),
    index("warehouse_transfers_source_loc_idx").on(table.sourceLocationId),
    index("warehouse_transfers_dest_loc_idx").on(table.destinationLocationId),
    index("warehouse_transfers_status_idx").on(table.status),
  ],
);

export const warehouseTransferLines = pgTable(
  "warehouse_transfer_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => warehouseTransfers.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull(),
    unitOfMeasure: varchar("unit_of_measure", { length: 32 })
      .notNull()
      .default("pcs"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("warehouse_transfer_lines_transfer_id_idx").on(table.transferId),
    index("warehouse_transfer_lines_component_id_idx").on(table.componentId),
  ],
);

export type WarehouseTransferRecord = typeof warehouseTransfers.$inferSelect;
export type NewWarehouseTransferRecord = typeof warehouseTransfers.$inferInsert;
export type WarehouseTransferLineRecord =
  typeof warehouseTransferLines.$inferSelect;
export type NewWarehouseTransferLineRecord =
  typeof warehouseTransferLines.$inferInsert;
