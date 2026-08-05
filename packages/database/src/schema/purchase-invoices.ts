import {
  decimal,
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { suppliers } from "./suppliers";
import { purchaseOrders } from "./purchase-orders";
import { goodsReceipts } from "./goods-receipts";
import { components } from "./components";

export const purchaseInvoices = pgTable(
  "purchase_invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
    vendorInvoiceNumber: varchar("vendor_invoice_number", {
      length: 128,
    }).notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    goodsReceiptId: uuid("goods_receipt_id").references(() => goodsReceipts.id),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    matchStatus: varchar("match_status", { length: 32 })
      .notNull()
      .default("PENDING"),
    totalAmount: decimal("total_amount", { precision: 14, scale: 4 })
      .notNull()
      .default("0.0000"),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("purchase_invoices_number_unique").on(table.invoiceNumber),
    index("purchase_invoices_supplier_id_idx").on(table.supplierId),
    index("purchase_invoices_po_id_idx").on(table.purchaseOrderId),
  ],
);

export const purchaseInvoiceLines = pgTable(
  "purchase_invoice_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    purchaseInvoiceId: uuid("purchase_invoice_id")
      .notNull()
      .references(() => purchaseInvoices.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    quantityBilled: integer("quantity_billed").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 12, scale: 4 })
      .notNull()
      .default("0.0000"),
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
    index("purchase_invoice_lines_invoice_id_idx").on(table.purchaseInvoiceId),
    index("purchase_invoice_lines_component_id_idx").on(table.componentId),
  ],
);

export type PurchaseInvoiceRecord = typeof purchaseInvoices.$inferSelect;
export type NewPurchaseInvoiceRecord = typeof purchaseInvoices.$inferInsert;
export type PurchaseInvoiceLineRecord =
  typeof purchaseInvoiceLines.$inferSelect;
export type NewPurchaseInvoiceLineRecord =
  typeof purchaseInvoiceLines.$inferInsert;
