import {
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { components } from "./components";
import { users } from "./auth";

/**
 * AI Suggestion Feedback & Telemetry
 * Captures user decisions (ACCEPTED, REJECTED, EDITED) on AI suggestions
 * to build labeled datasets for offline retraining and model evaluation.
 * Kept strictly decoupled from authoritative inventory records.
 */
export const aiSuggestionFeedback = pgTable(
  "ai_suggestion_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    componentId: uuid("component_id").references(() => components.id, {
      onDelete: "set null",
    }),

    creationContext: jsonb("creation_context")
      .$type<Record<string, unknown>>()
      .default({}),

    suggestionType: varchar("suggestion_type", { length: 64 }).notNull(), // 'CATEGORY' | 'MANUFACTURER' | 'ATTRIBUTE' | 'DUPLICATE'

    field: varchar("field", { length: 128 }).notNull(), // 'category' | 'manufacturer' | attribute code | 'duplicate'

    predictedValue: jsonb("predicted_value"),

    confidence: numeric("confidence", { precision: 5, scale: 4 }),

    confidenceLevel: varchar("confidence_level", { length: 32 })
      .notNull()
      .default("MEDIUM"), // 'HIGH' | 'MEDIUM' | 'LOW'

    evidence: jsonb("evidence")
      .$type<Array<Record<string, unknown>>>()
      .default([]),

    modelVersion: varchar("model_version", { length: 64 })
      .notNull()
      .default("1.0.0"),

    userAction: varchar("user_action", { length: 32 }).notNull(), // 'ACCEPTED' | 'REJECTED' | 'EDITED'

    finalValue: jsonb("final_value"),

    reviewerId: uuid("reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),

    reviewerEmail: varchar("reviewer_email", { length: 255 }),

    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_suggestion_feedback_component_id_idx").on(table.componentId),
    index("ai_suggestion_feedback_suggestion_type_idx").on(table.suggestionType),
    index("ai_suggestion_feedback_field_idx").on(table.field),
    index("ai_suggestion_feedback_user_action_idx").on(table.userAction),
    index("ai_suggestion_feedback_model_version_idx").on(table.modelVersion),
    index("ai_suggestion_feedback_created_at_idx").on(table.createdAt),
  ],
);

export type AiSuggestionFeedbackRecord = typeof aiSuggestionFeedback.$inferSelect;
export type NewAiSuggestionFeedbackRecord = typeof aiSuggestionFeedback.$inferInsert;
