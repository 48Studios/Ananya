import {
  boolean,
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("warehouses_code_unique").on(table.code),
    index("warehouses_status_idx").on(table.status),
  ],
);

export const warehouseZones = pgTable(
  "warehouse_zones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("warehouse_zones_warehouse_id_idx").on(table.warehouseId)],
);

export const warehouseBins = pgTable(
  "warehouse_bins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(),
    capacity: decimal("capacity", { precision: 12, scale: 4 })
      .notNull()
      .default("1000.0000"),
    currentUtilization: decimal("current_utilization", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0.0000"),
    purpose: varchar("purpose", { length: 32 }).notNull().default("STORAGE"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("warehouse_bins_code_unique").on(table.code),
    index("warehouse_bins_warehouse_id_idx").on(table.warehouseId),
    index("warehouse_bins_purpose_idx").on(table.purpose),
  ],
);

export type WarehouseRecord = typeof warehouses.$inferSelect;
export type NewWarehouseRecord = typeof warehouses.$inferInsert;
export type WarehouseZoneRecord = typeof warehouseZones.$inferSelect;
export type NewWarehouseZoneRecord = typeof warehouseZones.$inferInsert;
export type WarehouseBinRecord = typeof warehouseBins.$inferSelect;
export type NewWarehouseBinRecord = typeof warehouseBins.$inferInsert;
