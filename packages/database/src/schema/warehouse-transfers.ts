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
import { warehouseBins } from "./warehouses";
import { components } from "./components";

export const warehouseTransfers = pgTable(
  "warehouse_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferNumber: varchar("transfer_number", { length: 64 }).notNull(),
    sourceBinId: uuid("source_bin_id")
      .notNull()
      .references(() => warehouseBins.id),
    destinationBinId: uuid("destination_bin_id")
      .notNull()
      .references(() => warehouseBins.id),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("warehouse_transfers_number_unique").on(table.transferNumber),
    index("warehouse_transfers_source_bin_idx").on(table.sourceBinId),
    index("warehouse_transfers_dest_bin_idx").on(table.destinationBinId),
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
