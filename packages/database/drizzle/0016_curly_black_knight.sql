CREATE TABLE "ml_model_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"training_run_id" uuid,
	"model_version" varchar(64) NOT NULL,
	"previous_model_version" varchar(64),
	"deployment_type" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"artifact_fingerprint" varchar(128),
	"running_model_version" varchar(64),
	"reload_pending" boolean DEFAULT false NOT NULL,
	"deployed_by_user_id" uuid,
	"deployed_by_email" varchar(255),
	"deployed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ml_training_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" varchar(32) DEFAULT 'QUEUED' NOT NULL,
	"triggered_by_user_id" uuid,
	"triggered_by_email" varchar(255),
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"base_model_version" varchar(64),
	"candidate_model_version" varchar(64),
	"training_code_version" varchar(64),
	"dataset_version" varchar(160),
	"dataset_fingerprint" varchar(128),
	"dataset_record_count" integer,
	"feedback_record_count" integer,
	"training_record_count" integer,
	"validation_record_count" integer,
	"quarantine_record_count" integer,
	"evaluation_summary" jsonb,
	"gate_summary" jsonb,
	"error_code" varchar(64),
	"error_message" text,
	"log_excerpt" text,
	"artifact_reference" varchar(160),
	"deployment_status" varchar(32) DEFAULT 'NOT_DEPLOYED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ml_model_deployments" ADD CONSTRAINT "ml_model_deployments_training_run_id_ml_training_runs_id_fk" FOREIGN KEY ("training_run_id") REFERENCES "public"."ml_training_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_model_deployments" ADD CONSTRAINT "ml_model_deployments_deployed_by_user_id_users_id_fk" FOREIGN KEY ("deployed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_training_runs" ADD CONSTRAINT "ml_training_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ml_model_deployments_deployed_at_idx" ON "ml_model_deployments" USING btree ("deployed_at");--> statement-breakpoint
CREATE INDEX "ml_model_deployments_model_version_idx" ON "ml_model_deployments" USING btree ("model_version");--> statement-breakpoint
CREATE INDEX "ml_model_deployments_training_run_idx" ON "ml_model_deployments" USING btree ("training_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ml_training_runs_active_unique" ON "ml_training_runs" USING btree ((true)) WHERE status in ('QUEUED', 'RUNNING', 'EVALUATING');--> statement-breakpoint
CREATE INDEX "ml_training_runs_triggered_at_idx" ON "ml_training_runs" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "ml_training_runs_status_idx" ON "ml_training_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ml_training_runs_candidate_version_idx" ON "ml_training_runs" USING btree ("candidate_model_version");--> statement-breakpoint
CREATE INDEX "ml_training_runs_triggered_by_idx" ON "ml_training_runs" USING btree ("triggered_by_user_id");