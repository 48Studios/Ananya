CREATE TABLE "component_intelligence_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"related_component_id" uuid,
	"issue_type" varchar(64) NOT NULL,
	"issue_category" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"current_value" jsonb,
	"suggested_value" jsonb,
	"confidence" numeric(5, 4),
	"confidence_level" varchar(32),
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"source" varchar(128) NOT NULL,
	"model_version" varchar(64),
	"intelligence_version" varchar(64),
	"fingerprint" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"reviewer_id" uuid,
	"reviewer_email" varchar(255),
	"reviewed_at" timestamp with time zone,
	"decision_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "component_intelligence_findings" ADD CONSTRAINT "component_intelligence_findings_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_intelligence_findings" ADD CONSTRAINT "component_intelligence_findings_related_component_id_components_id_fk" FOREIGN KEY ("related_component_id") REFERENCES "public"."components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_intelligence_findings" ADD CONSTRAINT "component_intelligence_findings_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "component_intel_findings_fingerprint_unique" ON "component_intelligence_findings" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "component_intel_findings_component_status_idx" ON "component_intelligence_findings" USING btree ("component_id","status");--> statement-breakpoint
CREATE INDEX "component_intel_findings_status_created_idx" ON "component_intelligence_findings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "component_intel_findings_issue_type_status_idx" ON "component_intelligence_findings" USING btree ("issue_type","status");--> statement-breakpoint
CREATE INDEX "component_intel_findings_issue_category_status_idx" ON "component_intelligence_findings" USING btree ("issue_category","status");--> statement-breakpoint
CREATE INDEX "component_intel_findings_related_component_idx" ON "component_intelligence_findings" USING btree ("related_component_id");--> statement-breakpoint
CREATE INDEX "component_intel_findings_reviewer_idx" ON "component_intelligence_findings" USING btree ("reviewer_id");