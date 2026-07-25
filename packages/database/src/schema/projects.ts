import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { customers } from './customers';
import { salesOrders } from './sales-orders';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    projectNumber: varchar('project_number', { length: 50 })
      .notNull()
      .unique(),
    name: varchar('name', { length: 255 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id),
    projectManager: varchar('project_manager', { length: 100 }).notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    targetCompletionDate: timestamp('target_completion_date', {
      withTimezone: true,
    }).notNull(),
    priority: varchar('priority', { length: 50 }).notNull().default('MEDIUM'),
    status: varchar('status', { length: 50 }).notNull().default('PLANNING'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('projects_customer_id_idx').on(table.customerId),
    index('projects_sales_order_id_idx').on(table.salesOrderId),
    index('projects_status_idx').on(table.status),
    index('projects_manager_idx').on(table.projectManager),
  ],
);

export const projectMilestones = pgTable(
  'project_milestones',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 50 }).notNull().default('OPEN'),
    completionPercentage: numeric('completion_percentage', {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default('0.00'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('project_milestones_project_id_idx').on(table.projectId),
    index('project_milestones_status_idx').on(table.status),
  ],
);

export const projectTasks = pgTable(
  'project_tasks',
  {
    id: uuid('id').primaryKey(),
    taskNumber: varchar('task_number', { length: 50 }).notNull().unique(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    assignedUser: varchar('assigned_user', { length: 100 }),
    estimatedHours: numeric('estimated_hours', {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default('0.00'),
    actualHours: numeric('actual_hours', { precision: 10, scale: 2 })
      .notNull()
      .default('0.00'),
    priority: varchar('priority', { length: 50 }).notNull().default('MEDIUM'),
    status: varchar('status', { length: 50 }).notNull().default('TODO'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('project_tasks_project_id_idx').on(table.projectId),
    index('project_tasks_assigned_user_idx').on(table.assignedUser),
    index('project_tasks_status_idx').on(table.status),
  ],
);

export const taskAssignments = pgTable(
  'task_assignments',
  {
    id: uuid('id').primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 100 }).notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('task_assignments_task_id_idx').on(table.taskId),
    index('task_assignments_user_id_idx').on(table.userId),
  ],
);

export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id').primaryKey(),
    userId: varchar('user_id', { length: 100 }).notNull(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => projectTasks.id, { onDelete: 'cascade' }),
    date: timestamp('date', { withTimezone: true }).notNull(),
    hours: numeric('hours', { precision: 6, scale: 2 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).notNull().default('SUBMITTED'),
    approvedBy: varchar('approved_by', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('time_entries_user_id_idx').on(table.userId),
    index('time_entries_task_id_idx').on(table.taskId),
    index('time_entries_date_idx').on(table.date),
    index('time_entries_status_idx').on(table.status),
  ],
);

export type ProjectRecord = InferSelectModel<typeof projects>;
export type NewProjectRecord = InferInsertModel<typeof projects>;

export type ProjectMilestoneRecord = InferSelectModel<
  typeof projectMilestones
>;
export type NewProjectMilestoneRecord = InferInsertModel<
  typeof projectMilestones
>;

export type ProjectTaskRecord = InferSelectModel<typeof projectTasks>;
export type NewProjectTaskRecord = InferInsertModel<typeof projectTasks>;

export type TaskAssignmentRecord = InferSelectModel<typeof taskAssignments>;
export type NewTaskAssignmentRecord = InferInsertModel<typeof taskAssignments>;

export type TimeEntryRecord = InferSelectModel<typeof timeEntries>;
export type NewTimeEntryRecord = InferInsertModel<typeof timeEntries>;
