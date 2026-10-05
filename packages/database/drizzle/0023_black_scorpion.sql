ALTER TABLE "backup_job_runs" ADD COLUMN "max_attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_job_runs" ADD COLUMN "retry_reason" text;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD COLUMN "retry_initial_delay_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD COLUMN "retry_max_delay_seconds" integer DEFAULT 3600 NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD COLUMN "notify_on_success" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_jobs" ADD COLUMN "notify_on_failure" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "restore_operations" ADD COLUMN "plan" jsonb;--> statement-breakpoint
ALTER TABLE "restore_operations" ADD COLUMN "recovery_info" jsonb;