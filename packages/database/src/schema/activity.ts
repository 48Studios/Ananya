import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    module: varchar("module", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }).notNull(),
    entityTitle: varchar("entity_title", { length: 255 }),
    description: text("description").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: varchar("user_name", { length: 128 }),
    userEmail: varchar("user_email", { length: 255 }),
    status: varchar("status", { length: 32 }).notNull().default("SUCCESS"),
    severity: varchar("severity", { length: 32 }).notNull().default("INFO"),
    href: varchar("href", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activity_events_module_idx").on(table.module),
    index("activity_events_entity_type_idx").on(table.entityType),
    index("activity_events_entity_id_idx").on(table.entityId),
    index("activity_events_user_id_idx").on(table.userId),
    index("activity_events_event_type_idx").on(table.eventType),
    index("activity_events_created_at_idx").on(table.createdAt),
  ]
);

export type ActivityEventRecord = typeof activityEvents.$inferSelect;
export type NewActivityEventRecord = typeof activityEvents.$inferInsert;
