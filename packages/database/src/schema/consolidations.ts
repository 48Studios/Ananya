import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { components } from "./components";
import { componentIntelligenceFindings } from "./component-intelligence-findings";
import { users } from "./auth";

/**
 * Component consolidation operation records (Pass 6B).
 *
 * A consolidation retires one or more duplicate source components into a single
 * canonical component. The operation spans several subsystems (component master
 * data, the inventory ledger and projections, reservations, batches, serials,
 * BOMs, procurement references and polymorphic references), so the operation
 * itself is persisted as a first-class record rather than being inferred from
 * the mutated rows.
 *
 * This record is the AUTHORITATIVE operation log:
 *
 *  - `preview_fingerprint` records exactly which preflight analysis the reviewer
 *    approved, so a retried or replayed request can be detected,
 *  - `plan` stores the validated resolutions the reviewer supplied,
 *  - `result` stores what actually happened, including every migrated
 *    dependency and every ledger entry that was posted,
 *  - `status` distinguishes a committed operation from a recorded failure.
 *
 * `consolidation_sources` carries the per-source pre/post state needed to
 * explain and diagnose the operation after the fact.
 *
 * Nothing in this table is written outside the consolidation transaction: a
 * record with status COMPLETED exists if and only if every mutation committed.
 */
export const consolidations = pgTable(
  "consolidations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /**
     * The component that survives. Never deleted, never deactivated by
     * consolidation.
     */
    canonicalComponentId: uuid("canonical_component_id")
      .notNull()
      .references(() => components.id, { onDelete: "restrict" }),

    /** The duplicate finding the reviewer acted on, when there was one. */
    findingId: uuid("finding_id").references(
      () => componentIntelligenceFindings.id,
      { onDelete: "set null" },
    ),

    /** COMPLETED | FAILED. A FAILED row is written in its own transaction. */
    status: varchar("status", { length: 32 }).notNull().default("COMPLETED"),

    /**
     * The preview fingerprint the reviewer approved. Compared against a freshly
     * recomputed preview before any mutation, which is the optimistic
     * concurrency check.
     */
    previewFingerprint: varchar("preview_fingerprint", { length: 128 }).notNull(),

    previewVersion: varchar("preview_version", { length: 64 }).notNull(),

    intelligenceVersion: varchar("intelligence_version", { length: 64 }),

    /** Number of source components retired by this operation. */
    sourceCount: integer("source_count").notNull().default(1),

    decisionNotes: text("decision_notes"),

    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdByEmail: varchar("created_by_email", { length: 255 }),

    /**
     * Validated request plan: canonical id, source ids, and every explicit
     * resolution the reviewer supplied (attributes, BOM collisions,
     * dependencies). Stored verbatim so the decision is reproducible.
     */
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull().default({}),

    /**
     * What the operation did: dependency migrations, ledger entries posted,
     * projection changes, attribute and BOM resolutions, findings reconciled,
     * and the list of warnings that did not block execution.
     */
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),

    failureReason: text("failure_reason"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("consolidations_canonical_component_id_idx").on(
      table.canonicalComponentId,
    ),
    index("consolidations_finding_id_idx").on(table.findingId),
    index("consolidations_status_idx").on(table.status),
    index("consolidations_created_at_idx").on(table.createdAt),
  ],
);

/**
 * One row per retired source component.
 *
 * The unique index on `source_component_id` is the database-enforced idempotency
 * guarantee: a component can be consolidated at most once, ever. A retried or
 * racing request cannot retire the same source twice even if every application
 * level check were bypassed.
 */
export const consolidationSources = pgTable(
  "consolidation_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    consolidationId: uuid("consolidation_id")
      .notNull()
      .references(() => consolidations.id, { onDelete: "cascade" }),

    sourceComponentId: uuid("source_component_id")
      .notNull()
      .references(() => components.id, { onDelete: "restrict" }),

    /** Component state before retirement (identity, activity, balances). */
    preState: jsonb("pre_state")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    /** Component state after retirement, plus what was migrated away. */
    postState: jsonb("post_state")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("consolidation_sources_source_component_unique").on(
      table.sourceComponentId,
    ),
    index("consolidation_sources_consolidation_id_idx").on(
      table.consolidationId,
    ),
  ],
);

export type ConsolidationRecord = typeof consolidations.$inferSelect;
export type NewConsolidationRecord = typeof consolidations.$inferInsert;
export type ConsolidationSourceRecord =
  typeof consolidationSources.$inferSelect;
export type NewConsolidationSourceRecord =
  typeof consolidationSources.$inferInsert;
