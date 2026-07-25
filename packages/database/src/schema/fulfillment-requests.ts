import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { salesOrders, salesOrderLines } from './sales-orders';
import { warehouses } from './warehouses';
import { components } from './components';

export const fulfillmentRequests = pgTable(
  'fulfillment_requests',
  {
    id: uuid('id').primaryKey(),
    requestNumber: varchar('request_number', { length: 50 }).notNull().unique(),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    status: varchar('status', { length: 50 }).notNull().default('PENDING'),
    carrierName: varchar('carrier_name', { length: 100 }),
    trackingNumber: varchar('tracking_number', { length: 100 }),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('fulfillment_requests_order_id_idx').on(table.salesOrderId),
    index('fulfillment_requests_warehouse_id_idx').on(table.warehouseId),
    index('fulfillment_requests_status_idx').on(table.status),
  ],
);

export const fulfillmentRequestLines = pgTable(
  'fulfillment_request_lines',
  {
    id: uuid('id').primaryKey(),
    fulfillmentRequestId: uuid('fulfillment_request_id')
      .notNull()
      .references(() => fulfillmentRequests.id, { onDelete: 'cascade' }),
    salesOrderLineId: uuid('sales_order_line_id')
      .notNull()
      .references(() => salesOrderLines.id),
    componentId: uuid('component_id')
      .notNull()
      .references(() => components.id),
    requestedQuantity: numeric('requested_quantity', {
      precision: 12,
      scale: 4,
    }).notNull(),
    fulfilledQuantity: numeric('fulfilled_quantity', {
      precision: 12,
      scale: 4,
    })
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
    index('fulfillment_req_lines_req_id_idx').on(
      table.fulfillmentRequestId,
    ),
    index('fulfillment_req_lines_order_line_idx').on(
      table.salesOrderLineId,
    ),
  ],
);

export type FulfillmentRequestRecord = InferSelectModel<
  typeof fulfillmentRequests
>;
export type NewFulfillmentRequestRecord = InferInsertModel<
  typeof fulfillmentRequests
>;
export type FulfillmentRequestLineRecord = InferSelectModel<
  typeof fulfillmentRequestLines
>;
