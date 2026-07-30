import {
  decimal,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { locations } from './locations';
import { components } from './components';

export const cycleCounts = pgTable(
  'cycle_counts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    countNumber: varchar('count_number', { length: 64 }).notNull(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
    assignedCounter: varchar('assigned_counter', { length: 128 }),
    scheduledDate: timestamp('scheduled_date', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdBy: varchar('created_by', { length: 128 }),
    approvedBy: varchar('approved_by', { length: 128 }),
    stockAdjustmentId: uuid('stock_adjustment_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('cycle_counts_number_unique').on(table.countNumber),
    index('cycle_counts_location_id_idx').on(table.locationId),
    index('cycle_counts_status_idx').on(table.status),
  ],
);

export const cycleCountLines = pgTable(
  'cycle_count_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cycleCountId: uuid('cycle_count_id')
      .notNull()
      .references(() => cycleCounts.id, { onDelete: 'cascade' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => components.id),
    systemQuantity: decimal('system_quantity', { precision: 12, scale: 4 })
      .notNull()
      .default('0.0000'),
    countedQuantity: decimal('counted_quantity', { precision: 12, scale: 4 })
      .notNull()
      .default('0.0000'),
    variance: decimal('variance', { precision: 12, scale: 4 })
      .notNull()
      .default('0.0000'),
    unitOfMeasure: varchar('unit_of_measure', { length: 32 })
      .notNull()
      .default('pcs'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('cycle_count_lines_count_id_idx').on(table.cycleCountId),
    index('cycle_count_lines_component_id_idx').on(table.componentId),
  ],
);

export type CycleCountRecord = typeof cycleCounts.$inferSelect;
export type NewCycleCountRecord = typeof cycleCounts.$inferInsert;
export type CycleCountLineRecord = typeof cycleCountLines.$inferSelect;
export type NewCycleCountLineRecord = typeof cycleCountLines.$inferInsert;
