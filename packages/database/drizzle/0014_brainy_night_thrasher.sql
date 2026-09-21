CREATE TABLE "attribute_intelligence_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attribute_definition_id" uuid,
	"related_attribute_definition_id" uuid,
	"category_id" uuid,
	"option_id" uuid,
	"issue_type" varchar(64) NOT NULL,
	"issue_category" varchar(64) NOT NULL,
	"field" varchar(64),
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
ALTER TABLE "attribute_intelligence_findings" ADD CONSTRAINT "attribute_intelligence_findings_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_intelligence_findings" ADD CONSTRAINT "attribute_intelligence_findings_related_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("related_attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_intelligence_findings" ADD CONSTRAINT "attribute_intelligence_findings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_intelligence_findings" ADD CONSTRAINT "attribute_intelligence_findings_option_id_attribute_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."attribute_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_intelligence_findings" ADD CONSTRAINT "attribute_intelligence_findings_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_intel_findings_fingerprint_unique" ON "attribute_intelligence_findings" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "attribute_intel_findings_status_created_idx" ON "attribute_intelligence_findings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "attribute_intel_findings_attribute_status_idx" ON "attribute_intelligence_findings" USING btree ("attribute_definition_id","status");--> statement-breakpoint
CREATE INDEX "attribute_intel_findings_related_attribute_idx" ON "attribute_intelligence_findings" USING btree ("related_attribute_definition_id");--> statement-breakpoint
CREATE INDEX "attribute_intel_findings_category_status_idx" ON "attribute_intelligence_findings" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "attribute_intel_findings_issue_type_status_idx" ON "attribute_intelligence_findings" USING btree ("issue_type","status");--> statement-breakpoint
CREATE INDEX "attribute_intel_findings_issue_category_status_idx" ON "attribute_intelligence_findings" USING btree ("issue_category","status");--> statement-breakpoint
CREATE INDEX "attribute_intel_findings_reviewer_idx" ON "attribute_intelligence_findings" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "attribute_intel_findings_option_idx" ON "attribute_intelligence_findings" USING btree ("option_id");