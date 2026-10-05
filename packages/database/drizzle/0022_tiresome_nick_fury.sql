CREATE TABLE "backup_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'QUEUED' NOT NULL,
	"storage_key" text,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"checksum" varchar(128),
	"encrypted" boolean DEFAULT false NOT NULL,
	"format_version" varchar(32) NOT NULL,
	"scope" jsonb NOT NULL,
	"manifest" jsonb,
	"error_message" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "backup_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"artifact_id" uuid,
	"status" varchar(32) DEFAULT 'QUEUED' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"warnings" jsonb DEFAULT '[]'::jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "backup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"frequency" varchar(16) NOT NULL,
	"time_of_day" varchar(5) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Etc/UTC' NOT NULL,
	"scope" jsonb NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"destination" varchar(32) DEFAULT 'local' NOT NULL,
	"retention_max_count" integer,
	"retention_max_age_days" integer,
	"retry_limit" integer DEFAULT 2 NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_result" varchar(32),
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restore_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid,
	"status" varchar(32) DEFAULT 'QUEUED' NOT NULL,
	"scope" jsonb NOT NULL,
	"conflict_policy" varchar(16) NOT NULL,
	"preview" jsonb,
	"result" jsonb,
	"error_message" text,
	"initiated_by_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "backup_artifacts" ADD CONSTRAINT "backup_artifacts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_job_runs" ADD CONSTRAINT "backup_job_runs_job_id_backup_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."backup_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_job_runs" ADD CONSTRAINT "backup_job_runs_artifact_id_backup_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."backup_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD CONSTRAINT "backup_jobs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_operations" ADD CONSTRAINT "restore_operations_artifact_id_backup_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."backup_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_operations" ADD CONSTRAINT "restore_operations_initiated_by_id_users_id_fk" FOREIGN KEY ("initiated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;