import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { suppliers } from './suppliers';
import { purchaseInvoices } from './purchase-invoices';

export const payableInvoices = pgTable(
  'payable_invoices',
  {
    id: uuid('id').primaryKey(),
    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull().unique(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    purchaseInvoiceId: uuid('purchase_invoice_id')
      .notNull()
      .references(() => purchaseInvoices.id),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    amount: numeric('amount', { precision: 14, scale: 4 }).notNull(),
    balance: numeric('balance', { precision: 14, scale: 4 }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('DRAFT'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('payable_invoices_supplier_id_idx').on(table.supplierId),
    index('payable_invoices_purchase_inv_id_idx').on(
      table.purchaseInvoiceId,
    ),
    index('payable_invoices_status_idx').on(table.status),
  ],
);

export const payablePayments = pgTable(
  'payable_payments',
  {
    id: uuid('id').primaryKey(),
    payableInvoiceId: uuid('payable_invoice_id')
      .notNull()
      .references(() => payableInvoices.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id').notNull(),
    amountApplied: numeric('amount_applied', { precision: 14, scale: 4 }).notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('payable_payments_invoice_id_idx').on(table.payableInvoiceId),
  ],
);

export type PayableInvoiceRecord = InferSelectModel<typeof payableInvoices>;
export type NewPayableInvoiceRecord = InferInsertModel<typeof payableInvoices>;
export type PayablePaymentRecord = InferSelectModel<typeof payablePayments>;
