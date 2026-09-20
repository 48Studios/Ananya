import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { components } from "./components";
import { users } from "./auth";

/**
 * Persisted Component Intelligence review findings.
 *
 * Operational work items produced by Component Intelligence analysis over
 * existing (persisted) components. Findings are strictly non-authoritative:
 * they describe a detected anomaly together with current/suggested state,
 * confidence, and evidence, and require an explicit human review decision
 * before any component mutation occurs.
 *
 * Lifecycle: PENDING -> ACCEPTED | REJECTED | DISMISSED, plus STALE when the
 * underlying component changed after the finding was generated.
 *
 * Findings are deduplicated by a deterministic `fingerprint`. They are
 * operational queue state, not the training ledger: reviewer decisions are
 * additionally recorded in `ai_suggestion_feedback` for model evaluation.
 *
 * Findings cascade with the reviewed component because a finding without a
 * target component cannot be actioned. The AI feedback ledger keeps its rows
 * with `component_id` set to null, preserving training history.
 */
export const componentIntelligenceFindings = pgTable(
  "component_intelligence_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id, {
        onDelete: "cascade",
      }),

    relatedComponentId: uuid("related_component_id").references(
      () => components.id,
      {
        onDelete: "set null",
      },
    ),

    issueType: varchar("issue_type", { length: 64 }).notNull(),

    issueCategory: varchar("issue_category", { length: 64 }).notNull(),

    title: varchar("title", { length: 255 }).notNull(),

    description: text("description").notNull(),

    currentValue: jsonb("current_value").$type<Record<string, unknown>>(),

    suggestedValue: jsonb("suggested_value").$type<Record<string, unknown>>(),

    confidence: numeric("confidence", { precision: 5, scale: 4 }),

    confidenceLevel: varchar("confidence_level", { length: 32 }),

    evidence: jsonb("evidence")
      .$type<Array<Record<string, unknown>>>()
      .default([]),

    source: varchar("source", { length: 128 }).notNull(),

    modelVersion: varchar("model_version", { length: 64 }),

    intelligenceVersion: varchar("intelligence_version", { length: 64 }),

    fingerprint: varchar("fingerprint", { length: 128 }).notNull(),

    status: varchar("status", { length: 32 }).notNull().default("PENDING"),

    reviewerId: uuid("reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),

    reviewerEmail: varchar("reviewer_email", { length: 255 }),

    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

    decisionNotes: text("decision_notes"),

    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("component_intel_findings_fingerprint_unique").on(
      table.fingerprint,
    ),
    index("component_intel_findings_component_status_idx").on(
      table.componentId,
      table.status,
    ),
    index("component_intel_findings_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("component_intel_findings_issue_type_status_idx").on(
      table.issueType,
      table.status,
    ),
    index("component_intel_findings_issue_category_status_idx").on(
      table.issueCategory,
      table.status,
    ),
    index("component_intel_findings_related_component_idx").on(
      table.relatedComponentId,
    ),
    index("component_intel_findings_reviewer_idx").on(table.reviewerId),
  ],
);

export type ComponentIntelligenceFinding =
  typeof componentIntelligenceFindings.$inferSelect;
export type NewComponentIntelligenceFinding =
  typeof componentIntelligenceFindings.$inferInsert;
