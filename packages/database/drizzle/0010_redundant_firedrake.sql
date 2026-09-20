CREATE TABLE "consolidation_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consolidation_id" uuid NOT NULL,
	"source_component_id" uuid NOT NULL,
	"pre_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"post_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consolidations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_component_id" uuid NOT NULL,
	"finding_id" uuid,
	"status" varchar(32) DEFAULT 'COMPLETED' NOT NULL,
	"preview_fingerprint" varchar(128) NOT NULL,
	"preview_version" varchar(64) NOT NULL,
	"intelligence_version" varchar(64),
	"source_count" integer DEFAULT 1 NOT NULL,
	"decision_notes" text,
	"created_by" uuid,
	"created_by_email" varchar(255),
	"plan" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "consolidated_into_component_id" uuid;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "consolidation_id" uuid;--> statement-breakpoint
ALTER TABLE "components" ADD COLUMN "consolidated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consolidation_sources" ADD CONSTRAINT "consolidation_sources_consolidation_id_consolidations_id_fk" FOREIGN KEY ("consolidation_id") REFERENCES "public"."consolidations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidation_sources" ADD CONSTRAINT "consolidation_sources_source_component_id_components_id_fk" FOREIGN KEY ("source_component_id") REFERENCES "public"."components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidations" ADD CONSTRAINT "consolidations_canonical_component_id_components_id_fk" FOREIGN KEY ("canonical_component_id") REFERENCES "public"."components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidations" ADD CONSTRAINT "consolidations_finding_id_component_intelligence_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."component_intelligence_findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consolidations" ADD CONSTRAINT "consolidations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consolidation_sources_source_component_unique" ON "consolidation_sources" USING btree ("source_component_id");--> statement-breakpoint
CREATE INDEX "consolidation_sources_consolidation_id_idx" ON "consolidation_sources" USING btree ("consolidation_id");--> statement-breakpoint
CREATE INDEX "consolidations_canonical_component_id_idx" ON "consolidations" USING btree ("canonical_component_id");--> statement-breakpoint
CREATE INDEX "consolidations_finding_id_idx" ON "consolidations" USING btree ("finding_id");--> statement-breakpoint
CREATE INDEX "consolidations_status_idx" ON "consolidations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "consolidations_created_at_idx" ON "consolidations" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_consolidated_into_component_id_components_id_fk" FOREIGN KEY ("consolidated_into_component_id") REFERENCES "public"."components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_consolidation_id_consolidations_id_fk" FOREIGN KEY ("consolidation_id") REFERENCES "public"."consolidations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "components_consolidated_into_component_id_idx" ON "components" USING btree ("consolidated_into_component_id");--> statement-breakpoint
CREATE INDEX "components_consolidation_id_idx" ON "components" USING btree ("consolidation_id");