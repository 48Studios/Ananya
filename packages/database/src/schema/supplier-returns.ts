import {
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { suppliers } from "./suppliers";
import { purchaseOrders } from "./purchase-orders";
import { components } from "./components";
import { locations } from "./locations";

export const supplierReturns = pgTable(
  "supplier_returns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    returnNumber: varchar("return_number", { length: 64 }).notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    purchaseOrderId: uuid("purchase_order_id").references(
      () => purchaseOrders.id,
    ),
    rmaNumber: varchar("rma_number", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 4 })
      .notNull()
      .default("0.0000"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("supplier_returns_number_unique").on(table.returnNumber),
    index("supplier_returns_supplier_id_idx").on(table.supplierId),
    index("supplier_returns_po_id_idx").on(table.purchaseOrderId),
  ],
);

export const supplierReturnLines = pgTable(
  "supplier_return_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierReturnId: uuid("supplier_return_id")
      .notNull()
      .references(() => supplierReturns.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantityReturned: integer("quantity_returned").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 12, scale: 4 })
      .notNull()
      .default("0.0000"),
    reason: text("reason").notNull(),
    batchNumber: varchar("batch_number", { length: 128 }),
    serialNumbers: jsonb("serial_numbers")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("supplier_return_lines_return_id_idx").on(table.supplierReturnId),
    index("supplier_return_lines_component_id_idx").on(table.componentId),
    index("supplier_return_lines_location_id_idx").on(table.locationId),
  ],
);

export type SupplierReturnRecord = typeof supplierReturns.$inferSelect;
export type NewSupplierReturnRecord = typeof supplierReturns.$inferInsert;
export type SupplierReturnLineRecord = typeof supplierReturnLines.$inferSelect;
export type NewSupplierReturnLineRecord =
  typeof supplierReturnLines.$inferInsert;
