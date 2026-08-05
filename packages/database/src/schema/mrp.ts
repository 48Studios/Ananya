import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  numeric,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { components } from "./components";
import { suppliers } from "./suppliers";

export const planningRuns = pgTable(
  "planning_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runNumber: varchar("run_number", { length: 50 }).notNull().unique(),
    horizonDays: integer("horizon_days").notNull(),
    status: varchar("status", { length: 30 }).notNull().default("DRAFT"),
    startedBy: varchar("started_by", { length: 100 }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("planning_runs_status_idx").on(table.status),
    index("planning_runs_started_by_idx").on(table.startedBy),
  ],
);

export const materialRequirements = pgTable(
  "material_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planningRunId: uuid("planning_run_id")
      .notNull()
      .references(() => planningRuns.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    requiredQuantity: numeric("required_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    availableQuantity: numeric("available_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    reservedQuantity: numeric("reserved_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    shortageQuantity: numeric("shortage_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    requiredDate: timestamp("required_date", { withTimezone: true }).notNull(),
    source: varchar("source", { length: 50 }).notNull(),
    sourceReferenceId: varchar("source_reference_id", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("material_requirements_run_id_idx").on(table.planningRunId),
    index("material_requirements_component_id_idx").on(table.componentId),
    index("material_requirements_source_idx").on(table.source),
  ],
);

export const purchaseRecommendations = pgTable(
  "purchase_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planningRunId: uuid("planning_run_id")
      .notNull()
      .references(() => planningRuns.id, { onDelete: "cascade" }),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    suggestedQuantity: numeric("suggested_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    requiredDate: timestamp("required_date", { withTimezone: true }).notNull(),
    recommendationReason: varchar("recommendation_reason", {
      length: 500,
    }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("purchase_recommendations_run_id_idx").on(table.planningRunId),
    index("purchase_recommendations_component_id_idx").on(table.componentId),
    index("purchase_recommendations_supplier_id_idx").on(table.supplierId),
    index("purchase_recommendations_status_idx").on(table.status),
  ],
);

export const productionRecommendations = pgTable(
  "production_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planningRunId: uuid("planning_run_id")
      .notNull()
      .references(() => planningRuns.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => components.id),
    suggestedQuantity: numeric("suggested_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    suggestedStart: timestamp("suggested_start", {
      withTimezone: true,
    }).notNull(),
    suggestedCompletion: timestamp("suggested_completion", {
      withTimezone: true,
    }).notNull(),
    manufacturingRoute: varchar("manufacturing_route", { length: 100 }),
    status: varchar("status", { length: 30 }).notNull().default("PENDING"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("production_recommendations_run_id_idx").on(table.planningRunId),
    index("production_recommendations_product_id_idx").on(table.productId),
    index("production_recommendations_status_idx").on(table.status),
  ],
);

export const capacityPlans = pgTable(
  "capacity_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planningRunId: uuid("planning_run_id")
      .notNull()
      .references(() => planningRuns.id, { onDelete: "cascade" }),
    workCenterId: varchar("work_center_id", { length: 100 }).notNull(),
    workCenterName: varchar("work_center_name", { length: 150 }).notNull(),
    availableCapacityHours: numeric("available_capacity_hours", {
      precision: 10,
      scale: 2,
    }).notNull(),
    plannedCapacityHours: numeric("planned_capacity_hours", {
      precision: 10,
      scale: 2,
    }).notNull(),
    utilizationPercentage: numeric("utilization_percentage", {
      precision: 6,
      scale: 2,
    }).notNull(),
    isOverloaded: boolean("is_overloaded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("capacity_plans_run_id_idx").on(table.planningRunId),
    index("capacity_plans_work_center_idx").on(table.workCenterId),
    index("capacity_plans_overloaded_idx").on(table.isOverloaded),
  ],
);

export const planningMessages = pgTable(
  "planning_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planningRunId: uuid("planning_run_id")
      .notNull()
      .references(() => planningRuns.id, { onDelete: "cascade" }),
    severity: varchar("severity", { length: 20 }).notNull().default("INFO"),
    message: varchar("message", { length: 1000 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("planning_messages_run_id_idx").on(table.planningRunId),
    index("planning_messages_severity_idx").on(table.severity),
  ],
);

export type PlanningRunRecord = typeof planningRuns.$inferSelect;
export type MaterialRequirementRecord =
  typeof materialRequirements.$inferSelect;
export type PurchaseRecommendationRecord =
  typeof purchaseRecommendations.$inferSelect;
export type ProductionRecommendationRecord =
  typeof productionRecommendations.$inferSelect;
export type CapacityPlanRecord = typeof capacityPlans.$inferSelect;
export type PlanningMessageRecord = typeof planningMessages.$inferSelect;
