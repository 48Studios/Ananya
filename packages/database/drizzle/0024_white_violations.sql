ALTER TABLE "backup_artifacts" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "backup_job_runs" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restore_operations" ADD COLUMN "plan_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "restore_operations" ADD COLUMN "staged_files" jsonb;--> statement-breakpoint
ALTER TABLE "restore_operations" ADD COLUMN "promoted_files" jsonb;