import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    module: varchar("module", { length: 64 }).notNull(),
    type: varchar("type", { length: 64 }).notNull(), // 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'APPROVAL_REQUIRED' | 'REMINDER' | 'LOW_STOCK'
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message").notNull(),
    entityType: varchar("entity_type", { length: 64 }),
    entityId: varchar("entity_id", { length: 64 }),
    priority: varchar("priority", { length: 32 }).notNull().default("NORMAL"), // 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
    isRead: boolean("is_read").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_is_read_idx").on(table.isRead),
    index("notifications_module_idx").on(table.module),
  ]
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    categoriesJson: jsonb("categories_json").$type<Record<string, boolean>>().default({
      Inventory: true,
      Procurement: true,
      Manufacturing: true,
      Projects: true,
      Security: true,
    }),
    priorityThreshold: varchar("priority_threshold", { length: 32 }).notNull().default("LOW"),
    emailEnabled: boolean("email_enabled").notNull().default(true),
    desktopEnabled: boolean("desktop_enabled").notNull().default(true),
    quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
    quietHoursStart: varchar("quiet_hours_start", { length: 10 }),
    quietHoursEnd: varchar("quiet_hours_end", { length: 10 }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("notification_preferences_user_id_idx").on(table.userId)]
);

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    triggerType: varchar("trigger_type", { length: 64 }).notNull(), // 'ENTITY_CREATED' | 'INVENTORY_LOW' | 'IMPORT_COMPLETED' | 'PO_SUBMITTED'
    conditionsJson: jsonb("conditions_json").$type<Array<{ field: string; operator: string; value: unknown }>>().default([]),
    actionsJson: jsonb("actions_json").$type<Array<{ actionType: string; payload: Record<string, unknown> }>>().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("workflows_trigger_type_idx").on(table.triggerType),
    index("workflows_is_active_idx").on(table.isActive),
  ]
);

export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("SUCCESS"), // 'SUCCESS' | 'FAILED'
    triggeredBy: varchar("triggered_by", { length: 255 }),
    logsJson: jsonb("logs_json").$type<Array<{ timestamp: string; message: string }>>().default([]),
    executedAt: timestamp("executed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("workflow_executions_workflow_id_idx").on(table.workflowId)]
);

export type NotificationRecord = typeof notifications.$inferSelect;
export type NewNotificationRecord = typeof notifications.$inferInsert;

export type NotificationPreferenceRecord = typeof notificationPreferences.$inferSelect;
export type WorkflowRecord = typeof workflows.$inferSelect;
export type WorkflowExecutionRecord = typeof workflowExecutions.$inferSelect;
