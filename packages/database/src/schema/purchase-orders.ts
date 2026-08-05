import {
  decimal,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { suppliers } from "./suppliers";
import { components } from "./components";

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    poNumber: varchar("po_number", { length: 64 }).notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    subtotal: decimal("subtotal", { precision: 14, scale: 4 })
      .notNull()
      .default("0.0000"),
    taxTotal: decimal("tax_total", { precision: 14, scale: 4 })
      .notNull()
      .default("0.0000"),
    grandTotal: decimal("grand_total", { precision: 14, scale: 4 })
      .notNull()
      .default("0.0000"),
    notes: text("notes"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    expectedDeliveryDate: timestamp("expected_delivery_date", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("purchase_orders_po_number_unique").on(table.poNumber),
    index("purchase_orders_supplier_id_idx").on(table.supplierId),
    index("purchase_orders_status_idx").on(table.status),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    vendorPartNumber: varchar("vendor_part_number", { length: 128 }),
    unitPrice: decimal("unit_price", { precision: 12, scale: 4 })
      .notNull()
      .default("0.0000"),
    quantityOrdered: integer("quantity_ordered").notNull().default(1),
    quantityReceived: integer("quantity_received").notNull().default(0),
    taxRate: decimal("tax_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0.00"),
    lineTotal: decimal("line_total", { precision: 14, scale: 4 })
      .notNull()
      .default("0.0000"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("purchase_order_lines_po_id_idx").on(table.purchaseOrderId),
    index("purchase_order_lines_component_id_idx").on(table.componentId),
  ],
);

export type PurchaseOrderRecord = typeof purchaseOrders.$inferSelect;
export type NewPurchaseOrderRecord = typeof purchaseOrders.$inferInsert;
export type PurchaseOrderLineRecord = typeof purchaseOrderLines.$inferSelect;
export type NewPurchaseOrderLineRecord = typeof purchaseOrderLines.$inferInsert;
