import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { customers } from './customers';
import { quotations } from './quotations';
import { components } from './components';

export const salesOrders = pgTable(
  'sales_orders',
  {
    id: uuid('id').primaryKey(),
    orderNumber: varchar('order_number', { length: 50 }).notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    orderDate: timestamp('order_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    requiredDate: timestamp('required_date', { withTimezone: true }),
    status: varchar('status', { length: 50 }).notNull().default('DRAFT'),
    quotationId: uuid('quotation_id').references(() => quotations.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('sales_orders_customer_id_idx').on(table.customerId),
    index('sales_orders_status_idx').on(table.status),
  ],
);

export const salesOrderLines = pgTable(
  'sales_order_lines',
  {
    id: uuid('id').primaryKey(),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => components.id),
    quantity: numeric('quantity', { precision: 12, scale: 4 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 4 }).notNull(),
    discount: numeric('discount', { precision: 5, scale: 2 }).notNull().default('0'),
    tax: numeric('tax', { precision: 5, scale: 2 }).notNull().default('0'),
    totalPrice: numeric('total_price', { precision: 12, scale: 4 }).notNull(),
    reservedQuantity: numeric('reserved_quantity', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    fulfilledQuantity: numeric('fulfilled_quantity', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('sales_order_lines_order_id_idx').on(table.salesOrderId),
    index('sales_order_lines_component_id_idx').on(table.componentId),
  ],
);

export type SalesOrderRecord = InferSelectModel<typeof salesOrders>;
export type NewSalesOrderRecord = InferInsertModel<typeof salesOrders>;
export type SalesOrderLineRecord = InferSelectModel<typeof salesOrderLines>;
