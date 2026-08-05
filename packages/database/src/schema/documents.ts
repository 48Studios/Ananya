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

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 64 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileUrl: text("file_url").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
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
