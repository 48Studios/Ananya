import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const backupArtifacts = pgTable("backup_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 32 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("QUEUED"),
  storageKey: text("storage_key"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  checksum: varchar("checksum", { length: 128 }),
  encrypted: boolean("encrypted").notNull().default(false),
  formatVersion: varchar("format_version", { length: 32 }).notNull(),
  scope: jsonb("scope").$type<Record<string, unknown>>().notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  jobId: uuid("job_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const backupJobs = pgTable("backup_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  enabled: boolean("enabled").notNull().default(true),
  frequency: varchar("frequency", { length: 16 }).notNull(),
  timeOfDay: varchar("time_of_day", { length: 5 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Etc/UTC"),
  scope: jsonb("scope").$type<Record<string, unknown>>().notNull(),
  encrypted: boolean("encrypted").notNull().default(false),
  destination: varchar("destination", { length: 32 })
    .notNull()
    .default("local"),
  retentionMaxCount: integer("retention_max_count"),
  retentionMaxAgeDays: integer("retention_max_age_days"),
  retryLimit: integer("retry_limit").notNull().default(2),
  retryInitialDelaySeconds: integer("retry_initial_delay_seconds")
    .notNull()
    .default(60),
  retryMaxDelaySeconds: integer("retry_max_delay_seconds")
    .notNull()
    .default(3600),
  notifyOnSuccess: boolean("notify_on_success").notNull().default(false),
  notifyOnFailure: boolean("notify_on_failure").notNull().default(true),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastResult: varchar("last_result", { length: 32 }),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  createdById: uuid("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const backupJobRuns = pgTable("backup_job_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => backupJobs.id, { onDelete: "cascade" }),
  artifactId: uuid("artifact_id").references(() => backupArtifacts.id, {
    onDelete: "set null",
  }),
  status: varchar("status", { length: 32 }).notNull().default("QUEUED"),
  attempt: integer("attempt").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(1),
  retryReason: text("retry_reason"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  warnings: jsonb("warnings").$type<string[]>().default([]),
  errorMessage: text("error_message"),
});

export const restoreOperations = pgTable("restore_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  artifactId: uuid("artifact_id").references(() => backupArtifacts.id, {
    onDelete: "set null",
  }),
  status: varchar("status", { length: 32 }).notNull().default("QUEUED"),
  scope: jsonb("scope").$type<Record<string, unknown>>().notNull(),
  conflictPolicy: varchar("conflict_policy", { length: 16 }).notNull(),
  preview: jsonb("preview").$type<Record<string, unknown>>(),
  plan: jsonb("plan").$type<Record<string, unknown>>(),
  result: jsonb("result").$type<Record<string, unknown>>(),
  recoveryInfo: jsonb("recovery_info").$type<Record<string, unknown>>(),
  planHash: varchar("plan_hash", { length: 64 }),
  stagedFiles: jsonb("staged_files").$type<string[]>(),
  promotedFiles: jsonb("promoted_files").$type<string[]>(),
  errorMessage: text("error_message"),
  initiatedById: uuid("initiated_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type BackupArtifact = typeof backupArtifacts.$inferSelect;
export type BackupJob = typeof backupJobs.$inferSelect;
export type BackupJobRun = typeof backupJobRuns.$inferSelect;
export type RestoreOperation = typeof restoreOperations.$inferSelect;
