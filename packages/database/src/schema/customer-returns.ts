import {
  pgTable,
  uuid,
  varchar,
  numeric,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { customers } from './customers';
import { salesOrders, salesOrderLines } from './sales-orders';
import { components } from './components';

export const customerReturns = pgTable(
  'customer_returns',
  {
    id: uuid('id').primaryKey(),
    returnNumber: varchar('return_number', { length: 50 }).notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id),
    status: varchar('status', { length: 50 }).notNull().default('DRAFT'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('customer_returns_customer_id_idx').on(table.customerId),
    index('customer_returns_order_id_idx').on(table.salesOrderId),
    index('customer_returns_status_idx').on(table.status),
  ],
);

export const customerReturnLines = pgTable(
  'customer_return_lines',
  {
    id: uuid('id').primaryKey(),
    customerReturnId: uuid('customer_return_id')
      .notNull()
      .references(() => customerReturns.id, { onDelete: 'cascade' }),
    salesOrderLineId: uuid('sales_order_line_id')
      .notNull()
      .references(() => salesOrderLines.id),
    componentId: uuid('component_id')
      .notNull()
      .references(() => components.id),
    quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull(),
    reason: varchar('reason', { length: 50 }).notNull(),
    disposition: varchar('disposition', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('customer_return_lines_return_id_idx').on(
      table.customerReturnId,
    ),
    index('customer_return_lines_order_line_idx').on(
      table.salesOrderLineId,
    ),
  ],
);

export type CustomerReturnRecord = InferSelectModel<typeof customerReturns>;
export type NewCustomerReturnRecord = InferInsertModel<typeof customerReturns>;
export type CustomerReturnLineRecord = InferSelectModel<
  typeof customerReturnLines
>;
