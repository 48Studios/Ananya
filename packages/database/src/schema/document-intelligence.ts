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
import { documents } from "./documents";
import { components } from "./components";
import { users } from "./auth";

/**
 * Datasheet Documentation Intelligence analyses.
 *
 * One row per (document, document version, content hash, intelligence version):
 * the deterministic identity of "these exact bytes were analysed by this exact
 * extractor". Re-running an unchanged analysis updates this row instead of
 * adding another, which is what makes the feature idempotent.
 *
 * This is NOT a review queue. It is the durable evidence record for an
 * extraction: what was read, what was proposed, where it came from, and what
 * findings were produced. Human decisions and ERP mutation continue to happen
 * exclusively through the existing Component Review Queue and its apply
 * workflow, and through the existing attribute endpoints.
 *
 * Lifecycle (`status`):
 *   ANALYZING          - reserved while a synchronous run is in flight
 *   ANALYZED           - extraction succeeded, no reviewable findings produced
 *   FINDINGS_AVAILABLE - extraction succeeded and findings were persisted
 *   ANALYSIS_FAILED    - extraction could not be completed (reason recorded)
 *
 * `isCurrent` is deliberately NOT a column: currency is derived at read time by
 * comparing `documentVersion` + `contentHash` against the live document, so a
 * new datasheet revision automatically makes older analyses historical without
 * rewriting them (historical evidence is preserved, never overwritten).
 *
 * `extraction`, `identity`, `attributes` and `evidence` are bounded jsonb
 * payloads rather than child tables: a document analysis is a single immutable
 * observation, and the repository's convention is jsonb `$type<...>()` for
 * payloads. No second attribute table is introduced — resolved candidates
 * reference existing `attribute_definitions` ids.
 */
export const documentIntelligenceAnalyses = pgTable(
  "document_intelligence_analyses",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, {
        onDelete: "cascade",
      }),

    /**
     * The component the document was filed against when the analysis ran.
     * Findings are always attached to this component, never to a client-supplied
     * id, and never mutated by the analysis itself.
     */
    componentId: uuid("component_id")
      .notNull()
      .references(() => components.id, {
        onDelete: "cascade",
      }),

    documentVersion: integer("document_version").notNull(),

    /** SHA-256 of the analysed bytes: "is this the exact PDF?" */
    contentHash: varchar("content_hash", { length: 64 }).notNull(),

    /** Versioned extraction contract identity, e.g. `datasheet-extract-v1`. */
    intelligenceVersion: varchar("intelligence_version", { length: 64 })
      .notNull(),

    /** Version reported by the ML extractor for this run. */
    extractorVersion: varchar("extractor_version", { length: 64 }),

    status: varchar("status", { length: 32 }).notNull().default("ANALYZING"),

    failureReason: text("failure_reason"),

    /** Document type at analysis time (only DATASHEET is analyzable today). */
    documentType: varchar("document_type", { length: 50 }),

    fileName: varchar("file_name", { length: 255 }),

    fileSizeBytes: integer("file_size_bytes"),

    pageCount: integer("page_count"),

    pagesAnalyzed: integer("pages_analyzed"),

    extractedTextPreview: text("extracted_text_preview"),

    /** Normalized extraction contract (attributes + evidence, bounded). */
    extraction: jsonb("extraction")
      .$type<Record<string, unknown>>()
      .default({}),

    /** Manufacturer / MPN candidates as resolved by the existing intelligence. */
    identity: jsonb("identity").$type<Record<string, unknown>>().default({}),

    /** Extracted attribute candidates with their definition-resolution state. */
    attributes: jsonb("attributes")
      .$type<Array<Record<string, unknown>>>()
      .default([]),

    /** Every evidence item that reaches the reviewer. */
    evidence: jsonb("evidence")
      .$type<Array<Record<string, unknown>>>()
      .default([]),

    /** Summary counts, computed from the actual results (never estimated). */
    summary: jsonb("summary").$type<Record<string, unknown>>().default({}),

    /**
     * Fingerprints of the findings this analysis produced, so a re-run can be
     * reconciled and a superseded version can be staled precisely.
     */
    findingFingerprints: jsonb("finding_fingerprints")
      .$type<string[]>()
      .default([]),

    mlDurationMs: integer("ml_duration_ms"),

    analyzedById: uuid("analyzed_by_id").references(() => users.id, {
      onDelete: "set null",
    }),

    analyzedByEmail: varchar("analyzed_by_email", { length: 255 }),

    analyzedAt: timestamp("analyzed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("doc_intel_analyses_identity_unique").on(
      table.documentId,
      table.documentVersion,
      table.contentHash,
      table.intelligenceVersion,
    ),
    index("doc_intel_analyses_document_idx").on(
      table.documentId,
      table.documentVersion,
    ),
    index("doc_intel_analyses_component_idx").on(
      table.componentId,
      table.analyzedAt,
    ),
    index("doc_intel_analyses_status_idx").on(table.status),
  ],
);

export type DocumentIntelligenceAnalysisRecord =
  typeof documentIntelligenceAnalyses.$inferSelect;
export type NewDocumentIntelligenceAnalysisRecord =
  typeof documentIntelligenceAnalyses.$inferInsert;
