import {
  boolean,
  decimal,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { components } from "./components";

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    taxId: varchar("tax_id", { length: 64 }),
    paymentTerms: varchar("payment_terms", { length: 32 })
      .notNull()
      .default("NET30"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    rating: decimal("rating", { precision: 3, scale: 2 }).default("5.00"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("suppliers_code_unique").on(table.code),
    index("suppliers_is_active_idx").on(table.isActive),
  ],
);

export const supplierContacts = pgTable(
  "supplier_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 64 }),
    role: varchar("role", { length: 64 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("supplier_contacts_supplier_id_idx").on(table.supplierId)],
);

export const supplierComponents = pgTable(
  "supplier_components",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
    vendorPartNumber: varchar("vendor_part_number", { length: 128 }).notNull(),
    leadTimeDays: integer("lead_time_days").notNull().default(7),
    minimumOrderQuantity: integer("minimum_order_quantity")
      .notNull()
      .default(1),
    orderMultiple: integer("order_multiple").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 12, scale: 4 })
      .notNull()
      .default("0.0000"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("supplier_components_supplier_id_idx").on(table.supplierId),
    index("supplier_components_component_id_idx").on(table.componentId),
  ],
);

export type SupplierRecord = typeof suppliers.$inferSelect;
export type NewSupplierRecord = typeof suppliers.$inferInsert;
export type SupplierContactRecord = typeof supplierContacts.$inferSelect;
export type NewSupplierContactRecord = typeof supplierContacts.$inferInsert;
export type SupplierComponentRecord = typeof supplierComponents.$inferSelect;
export type NewSupplierComponentRecord = typeof supplierComponents.$inferInsert;
