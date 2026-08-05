import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { customers } from "./customers";
import { salesOrders } from "./sales-orders";

export const receivableInvoices = pgTable(
  "receivable_invoices",
  {
    id: uuid("id").primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    salesOrderId: uuid("sales_order_id")
      .notNull()
      .references(() => salesOrders.id),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
    balance: numeric("balance", { precision: 14, scale: 4 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("receivable_invoices_customer_id_idx").on(table.customerId),
    index("receivable_invoices_order_id_idx").on(table.salesOrderId),
    index("receivable_invoices_status_idx").on(table.status),
  ],
);

export const receivablePayments = pgTable(
  "receivable_payments",
  {
    id: uuid("id").primaryKey(),
    receivableInvoiceId: uuid("receivable_invoice_id")
      .notNull()
      .references(() => receivableInvoices.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").notNull(),
    amountApplied: numeric("amount_applied", {
      precision: 14,
      scale: 4,
    }).notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("receivable_payments_invoice_id_idx").on(table.receivableInvoiceId),
  ],
);

export type ReceivableInvoiceRecord = InferSelectModel<
  typeof receivableInvoices
>;
export type NewReceivableInvoiceRecord = InferInsertModel<
  typeof receivableInvoices
>;
export type ReceivablePaymentRecord = InferSelectModel<
  typeof receivablePayments
>;
