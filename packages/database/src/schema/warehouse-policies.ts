import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { warehouses, warehouseBins } from "./warehouses";

export const warehousePolicies = pgTable(
  "warehouse_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    allowNegativeInventory: boolean("allow_negative_inventory")
      .notNull()
      .default(false),
    enforceBinCapacity: boolean("enforce_bin_capacity")
      .notNull()
      .default(true),
    directedPutaway: boolean("directed_putaway").notNull().default(false),
    directedPicking: boolean("directed_picking").notNull().default(false),
    defaultReceivingBinId: uuid("default_receiving_bin_id").references(
      () => warehouseBins.id,
    ),
    defaultProductionBinId: uuid("default_production_bin_id").references(
      () => warehouseBins.id,
    ),
    defaultShippingBinId: uuid("default_shipping_bin_id").references(
      () => warehouseBins.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("warehouse_policies_warehouse_id_unique").on(table.warehouseId),
  ],
);

export type WarehousePolicyRecord = typeof warehousePolicies.$inferSelect;
export type NewWarehousePolicyRecord = typeof warehousePolicies.$inferInsert;
