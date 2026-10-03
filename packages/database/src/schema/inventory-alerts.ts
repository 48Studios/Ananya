import { sql } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { components } from "./components";

/**
 * Inventory alert state.
 *
 * One row per (component, alert type) while the condition holds. The partial
 * unique index is the deduplication guarantee: concurrent evaluations cannot
 * open two active alerts for the same condition, and a resolved row no longer
 * participates in the constraint so the next breach opens a fresh alert.
 *
 * Scope is company-wide: on-hand is the sum of every location projection and
 * available subtracts active reservations, which matches the only threshold
 * the product configures today (system settings `reorderDefaultsJson`).
 */
export const INVENTORY_ALERT_TYPES = ["LOW_STOCK", "OUT_OF_STOCK"] as const;
export type InventoryAlertType = (typeof INVENTORY_ALERT_TYPES)[number];

export const INVENTORY_ALERT_STATUSES = ["ACTIVE", "RESOLVED"] as const;
export type InventoryAlertStatus = (typeof INVENTORY_ALERT_STATUSES)[number];

export const inventoryAlerts = pgTable(
  "inventory_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "cascade" }),
    alertType: varchar("alert_type", { length: 32 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("ACTIVE"),
    thresholdQuantity: numeric("threshold_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    onHandQuantity: numeric("on_hand_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    availableQuantity: numeric("available_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    shortageQuantity: numeric("shortage_quantity", {
      precision: 12,
      scale: 4,
    }).notNull(),
    firstTriggeredAt: timestamp("first_triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    notificationCount: integer("notification_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inventory_alerts_active_unique")
      .on(table.componentId, table.alertType)
      .where(sql`${table.status} = 'ACTIVE'`),
    index("inventory_alerts_status_idx").on(table.status),
    index("inventory_alerts_component_id_idx").on(table.componentId),
    index("inventory_alerts_type_idx").on(table.alertType),
  ],
);

export type InventoryAlertRecord = typeof inventoryAlerts.$inferSelect;
export type NewInventoryAlertRecord = typeof inventoryAlerts.$inferInsert;
