import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Editable email templates, one row per supported event type.
 *
 * Defaults are seeded with `ON CONFLICT (event_type) DO NOTHING`, so a deploy
 * or restart never overwrites a template an administrator has customized.
 */
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 64 }).notNull().unique(),
    category: varchar("category", { length: 64 }).notNull().default("Inventory"),
    name: varchar("name", { length: 255 }).notNull(),
    description: varchar("description", { length: 500 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("email_templates_category_idx").on(table.category)],
);

/**
 * Durable outbound mail queue.
 *
 * `SENT` means the transport accepted the message; SMTP gives no delivery
 * receipt, so the API never reports "delivered". Failures keep a redacted
 * `lastError` and are retried with backoff up to `maxAttempts`.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    recipientUserId: uuid("recipient_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    subject: varchar("subject", { length: 500 }).notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastError: varchar("last_error", { length: 1000 }),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sourceType: varchar("source_type", { length: 64 }),
    sourceId: varchar("source_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_outbox_status_idx").on(table.status),
    index("email_outbox_next_attempt_idx").on(table.nextAttemptAt),
    index("email_outbox_event_type_idx").on(table.eventType),
    index("email_outbox_recipient_user_idx").on(table.recipientUserId),
  ],
);

export type EmailTemplateRecord = typeof emailTemplates.$inferSelect;
export type NewEmailTemplateRecord = typeof emailTemplates.$inferInsert;
export type EmailOutboxRecord = typeof emailOutbox.$inferSelect;
export type NewEmailOutboxRecord = typeof emailOutbox.$inferInsert;
