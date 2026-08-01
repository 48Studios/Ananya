import {
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

export const importExportJobs = pgTable(
  "import_export_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobType: varchar("job_type", { length: 32 }).notNull(), // 'IMPORT' | 'EXPORT'
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    format: varchar("format", { length: 32 }).notNull().default("CSV"), // 'CSV' | 'EXCEL' | 'JSON'
    status: varchar("status", { length: 32 }).notNull().default("QUEUED"), // 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    totalRecords: integer("total_records").notNull().default(0),
    processedRecords: integer("processed_records").notNull().default(0),
    failedRecords: integer("failed_records").notNull().default(0),
    progressPercent: integer("progress_percent").notNull().default(0),
    fileName: varchar("file_name", { length: 255 }),
    fileUrl: text("file_url"),
    errors: jsonb("errors").$type<Array<{ row: number; column?: string; value?: unknown; message: string }>>().default([]),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("import_export_jobs_user_id_idx").on(table.userId),
    index("import_export_jobs_entity_type_idx").on(table.entityType),
    index("import_export_jobs_job_type_idx").on(table.jobType),
    index("import_export_jobs_status_idx").on(table.status),
  ]
);

export type ImportExportJobRecord = typeof importExportJobs.$inferSelect;
export type NewImportExportJobRecord = typeof importExportJobs.$inferInsert;
