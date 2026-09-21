import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Generic document infrastructure.
 *
 * A `documents` row is a *documentation record* filed against any entity
 * through the polymorphic `(entity_type, entity_id)` pair. Two source kinds
 * are supported and they are deliberately modelled separately:
 *
 *  - `UPLOADED_FILE` — the file is stored by the API's storage provider, so
 *    `file_name` / `file_url` / `storage_key` / `mime_type` / `size_bytes`
 *    describe a real object, `document_versions` holds its revisions, and the
 *    bytes are retrievable through the authenticated download/preview routes.
 *  - `EXTERNAL_URL`   — the record points at an external resource. The URL
 *    lives in `external_url` only: there is no stored object, so the file
 *    columns are left NULL rather than filled with placeholders.
 *
 * The file columns are therefore nullable. They were `NOT NULL` before external
 * references existed, and every historical row is an uploaded file, so relaxing
 * the constraint is backward compatible.
 *
 * `document_type` is a validated vocabulary (see the API's `document-types`
 * module). It is nullable so that pre-existing rows remain readable; readers
 * treat NULL as `OTHER`. The API never writes a value outside the vocabulary.
 *
 * `current_version` tracks the latest entry in `document_versions` for uploaded
 * files. External references keep `current_version = 1` and have no version
 * rows: a URL has no bytes to version.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }).notNull(),
    documentType: varchar("document_type", { length: 50 }),
    sourceType: varchar("source_type", { length: 20 })
      .notNull()
      .default("UPLOADED_FILE"),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    externalUrl: text("external_url"),
    fileName: varchar("file_name", { length: 255 }),
    fileUrl: text("file_url"),
    storageKey: text("storage_key"),
    mimeType: varchar("mime_type", { length: 128 }),
    sizeBytes: integer("size_bytes").default(0),
    currentVersion: integer("current_version").notNull().default(1),
    tags: jsonb("tags").$type<string[]>().default([]),
    isConfidential: boolean("is_confidential").notNull().default(false),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("documents_entity_type_entity_id_idx").on(
      table.entityType,
      table.entityId,
    ),
    index("documents_uploaded_by_id_idx").on(table.uploadedById),
    index("documents_document_type_idx").on(table.documentType),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileUrl: text("file_url").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    changelog: text("changelog"),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("document_versions_document_id_idx").on(table.documentId),
    index("document_versions_version_number_idx").on(table.versionNumber),
  ],
);

export type DocumentRecord = typeof documents.$inferSelect;
export type NewDocumentRecord = typeof documents.$inferInsert;

export type DocumentVersionRecord = typeof documentVersions.$inferSelect;
export type NewDocumentVersionRecord = typeof documentVersions.$inferInsert;
