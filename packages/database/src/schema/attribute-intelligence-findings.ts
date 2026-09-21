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
import { attributeDefinitions, attributeOptions } from "./attributes";
import { categories } from "./categories";
import { users } from "./auth";

/**
 * Persisted Attribute Intelligence review findings.
 *
 * Operational work items produced by Attribute Intelligence analysis over the
 * attribute library (`attribute_definitions`, `category_attributes`,
 * `attribute_options`). Findings are strictly non-authoritative: they describe a
 * detected condition together with the current/suggested state, confidence and
 * evidence, and require an explicit human review decision before any attribute
 * master data changes.
 *
 * Why a dedicated table instead of the component findings table: Attribute
 * findings have their own subject model. A finding can be about one attribute, an
 * attribute relationship (`A ≍ B`), an attribute/category binding, or an
 * attribute option — none of which has a component. `component_intelligence_
 * findings.component_id` is `NOT NULL` and FK-backed, so hosting these findings
 * there would require either a fake component or relaxing an invariant that the
 * component queue relies on (component staleness, component locking, component
 * retirement/consolidation, component-keyed reconciliation). The review
 * *workflow* mechanisms (fingerprints, lifecycle, decisions, feedback) are shared
 * with the component queue; the subject model is not.
 *
 * Subject columns are deliberately explicit FKs rather than a polymorphic
 * `(subject_type, subject_id)` pair, so the database enforces referential
 * integrity for every subject kind. Which combination of subject columns is
 * required is a property of the finding type and is validated by the service.
 *
 * Lifecycle: PENDING -> ACCEPTED | REJECTED | DISMISSED, plus STALE when the
 * expected state the finding was generated from no longer holds. STALE findings
 * are never applied; re-analysis that detects the same condition returns them to
 * PENDING, while terminal decisions are never overwritten.
 *
 * Findings are deduplicated by a deterministic `fingerprint`. They are
 * operational queue state, not the training ledger: reviewer decisions are
 * additionally recorded in `ai_suggestion_feedback` for model evaluation.
 */
export const attributeIntelligenceFindings = pgTable(
  "attribute_intelligence_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /**
     * Primary attribute subject. Cascades because a finding whose subject no
     * longer exists cannot be reviewed or actioned — the same rationale the
     * component findings table uses for `component_id`.
     */
    attributeDefinitionId: uuid("attribute_definition_id").references(
      () => attributeDefinitions.id,
      {
        onDelete: "cascade",
      },
    ),

    /**
     * The other side of a relationship finding (duplicate / near-duplicate).
     * Nullable and `SET NULL` because the relationship can outlive one side and
     * because deleting an attribute must not silently delete the review history
     * of an unrelated one.
     */
    relatedAttributeDefinitionId: uuid(
      "related_attribute_definition_id",
    ).references(() => attributeDefinitions.id, {
      onDelete: "set null",
    }),

    /** Category subject, or the category side of an attribute/category binding. */
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),

    /** Option subject (enum suggestions target one option code). */
    optionId: uuid("option_id").references(() => attributeOptions.id, {
      onDelete: "set null",
    }),

    issueType: varchar("issue_type", { length: 64 }).notNull(),

    issueCategory: varchar("issue_category", { length: 64 }).notNull(),

    /**
     * Attribute configuration field the finding is about, when it targets a
     * single field (e.g. `unit_category`, `aliases`, `binding.required`).
     *
     * A real column, unlike the component findings table which keeps the field
     * inside `metadata`: the attribute taxonomy needs it as a first-class value
     * for both the queue projection and the feedback row's `field`, and keeping
     * one copy avoids the two drifting apart.
     */
    field: varchar("field", { length: 64 }),

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

    /**
     * Whether the reviewed finding has been applied to the attribute library.
     *
     * Kept separate from `status` because accepting a finding and applying it are
     * different acts: `ACCEPTED` records a human review decision, while
     * `applicationResult` records that an authoritative mutation was performed as a
     * result. A finding can legitimately be `ACCEPTED` and unapplied, and no finding
     * may be applied while it is pending, rejected, dismissed or stale.
     *
     * `APPLIED` is only ever written by the apply path, inside the same transaction
     * as the mutation, under a guard that requires `status = 'ACCEPTED'` and
     * `application_result = 'NOT_APPLIED'`. That single guarded write is what makes
     * "applied implies accepted" and "applied at most once" true; the codebase has
     * no CHECK constraints anywhere, so the invariant lives with the one writer
     * rather than in the schema.
     */
    applicationResult: varchar("application_result", { length: 32 })
      .notNull()
      .default("NOT_APPLIED"),

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
    uniqueIndex("attribute_intel_findings_fingerprint_unique").on(
      table.fingerprint,
    ),
    // Default queue read: filter by lifecycle status, order by recency.
    index("attribute_intel_findings_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    // "Findings about this attribute" — the primary subject lookup.
    index("attribute_intel_findings_attribute_status_idx").on(
      table.attributeDefinitionId,
      table.status,
    ),
    // Relationship subjects and FK maintenance for ON DELETE SET NULL.
    index("attribute_intel_findings_related_attribute_idx").on(
      table.relatedAttributeDefinitionId,
    ),
    // Category-scoped queue reads (binding findings, expected-attribute gaps).
    index("attribute_intel_findings_category_status_idx").on(
      table.categoryId,
      table.status,
    ),
    // Queue tabs filter by issue type / category.
    index("attribute_intel_findings_issue_type_status_idx").on(
      table.issueType,
      table.status,
    ),
    index("attribute_intel_findings_issue_category_status_idx").on(
      table.issueCategory,
      table.status,
    ),
    // Reviewer audit lookup, matching the component findings table.
    index("attribute_intel_findings_reviewer_idx").on(table.reviewerId),
    // FK maintenance for the option subject (ON DELETE SET NULL).
    index("attribute_intel_findings_option_idx").on(table.optionId),
    // "Which findings were applied, and which accepted findings remain unapplied?"
    // is the question the application ledger exists to answer.
    index("attribute_intel_findings_application_result_idx").on(
      table.applicationResult,
      table.status,
    ),
  ],
);

export type AttributeIntelligenceFinding =
  typeof attributeIntelligenceFindings.$inferSelect;
export type NewAttributeIntelligenceFinding =
  typeof attributeIntelligenceFindings.$inferInsert;
