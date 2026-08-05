import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import { customers } from "./customers";
import { salesOrders } from "./sales-orders";
import { components } from "./components";
import { locations } from "./locations";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    projectNumber: varchar("project_number", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    projectType: varchar("project_type", { length: 50 })
      .notNull()
      .default("INTERNAL"),
    description: text("description"),
    owner: varchar("owner", { length: 100 }).notNull().default("Project Lead"),
    projectManager: varchar("project_manager", { length: 100 }).notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    salesOrderId: uuid("sales_order_id").references(() => salesOrders.id),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    targetCompletionDate: timestamp("target_completion_date", {
      withTimezone: true,
    }).notNull(),
    priority: varchar("priority", { length: 50 }).notNull().default("MEDIUM"),
    status: varchar("status", { length: 50 }).notNull().default("PLANNING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("projects_customer_id_idx").on(table.customerId),
    index("projects_sales_order_id_idx").on(table.salesOrderId),
    index("projects_status_idx").on(table.status),
    index("projects_type_idx").on(table.projectType),
    index("projects_owner_idx").on(table.owner),
    index("projects_manager_idx").on(table.projectManager),
  ],
);

export const projectMaterials = pgTable(
  "project_materials",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    allocatedQuantity: numeric("allocated_quantity", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0.0000"),
    issuedQuantity: numeric("issued_quantity", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0.0000"),
    returnedQuantity: numeric("returned_quantity", {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default("0.0000"),
    unitOfMeasure: varchar("unit_of_measure", { length: 50 })
      .notNull()
      .default("pcs"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_materials_project_id_idx").on(table.projectId),
    index("project_materials_component_id_idx").on(table.componentId),
    index("project_materials_location_id_idx").on(table.locationId),
  ],
);

export const projectActivities = pgTable(
  "project_activities",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    activityType: varchar("activity_type", { length: 50 }).notNull(),
    description: text("description").notNull(),
    performedBy: varchar("performed_by", { length: 100 }).notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_activities_project_id_idx").on(table.projectId),
    index("project_activities_type_idx").on(table.activityType),
  ],
);

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("OPEN"),
    completionPercentage: numeric("completion_percentage", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0.00"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_milestones_project_id_idx").on(table.projectId),
    index("project_milestones_status_idx").on(table.status),
  ],
);

export const projectTasks = pgTable(
  "project_tasks",
  {
    id: uuid("id").primaryKey(),
    taskNumber: varchar("task_number", { length: 50 }).notNull().unique(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    assignedUser: varchar("assigned_user", { length: 100 }),
    estimatedHours: numeric("estimated_hours", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("0.00"),
    actualHours: numeric("actual_hours", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    priority: varchar("priority", { length: 50 }).notNull().default("MEDIUM"),
    status: varchar("status", { length: 50 }).notNull().default("TODO"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_tasks_project_id_idx").on(table.projectId),
    index("project_tasks_assigned_user_idx").on(table.assignedUser),
    index("project_tasks_status_idx").on(table.status),
  ],
);

export const taskAssignments = pgTable(
  "task_assignments",
  {
    id: uuid("id").primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 100 }).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("task_assignments_task_id_idx").on(table.taskId),
    index("task_assignments_user_id_idx").on(table.userId),
  ],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey(),
    userId: varchar("user_id", { length: 100 }).notNull(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 50 }).notNull().default("SUBMITTED"),
    approvedBy: varchar("approved_by", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("time_entries_user_id_idx").on(table.userId),
    index("time_entries_task_id_idx").on(table.taskId),
    index("time_entries_date_idx").on(table.date),
    index("time_entries_status_idx").on(table.status),
  ],
);

export type ProjectRecord = InferSelectModel<typeof projects>;
export type NewProjectRecord = InferInsertModel<typeof projects>;

export type ProjectMaterialRecord = InferSelectModel<typeof projectMaterials>;
export type NewProjectMaterialRecord = InferInsertModel<
  typeof projectMaterials
>;

export type ProjectActivityRecord = InferSelectModel<typeof projectActivities>;
export type NewProjectActivityRecord = InferInsertModel<
  typeof projectActivities
>;

export type ProjectMilestoneRecord = InferSelectModel<typeof projectMilestones>;
export type NewProjectMilestoneRecord = InferInsertModel<
  typeof projectMilestones
>;

export type ProjectTaskRecord = InferSelectModel<typeof projectTasks>;
export type NewProjectTaskRecord = InferInsertModel<typeof projectTasks>;

export type TaskAssignmentRecord = InferSelectModel<typeof taskAssignments>;
export type NewTaskAssignmentRecord = InferInsertModel<typeof taskAssignments>;

export type TimeEntryRecord = InferSelectModel<typeof timeEntries>;
export type NewTimeEntryRecord = InferInsertModel<typeof timeEntries>;
