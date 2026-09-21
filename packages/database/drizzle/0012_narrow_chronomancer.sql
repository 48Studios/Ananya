CREATE TABLE "document_intelligence_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"document_version" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"intelligence_version" varchar(64) NOT NULL,
	"extractor_version" varchar(64),
	"status" varchar(32) DEFAULT 'ANALYZING' NOT NULL,
	"failure_reason" text,
	"document_type" varchar(50),
	"file_name" varchar(255),
	"file_size_bytes" integer,
	"page_count" integer,
	"pages_analyzed" integer,
	"extracted_text_preview" text,
	"extraction" jsonb DEFAULT '{}'::jsonb,
	"identity" jsonb DEFAULT '{}'::jsonb,
	"attributes" jsonb DEFAULT '[]'::jsonb,
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"summary" jsonb DEFAULT '{}'::jsonb,
	"finding_fingerprints" jsonb DEFAULT '[]'::jsonb,
	"ml_duration_ms" integer,
	"analyzed_by_id" uuid,
	"analyzed_by_email" varchar(255),
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_intelligence_analyses" ADD CONSTRAINT "document_intelligence_analyses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_intelligence_analyses" ADD CONSTRAINT "document_intelligence_analyses_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_intelligence_analyses" ADD CONSTRAINT "document_intelligence_analyses_analyzed_by_id_users_id_fk" FOREIGN KEY ("analyzed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "doc_intel_analyses_identity_unique" ON "document_intelligence_analyses" USING btree ("document_id","document_version","content_hash","intelligence_version");--> statement-breakpoint
CREATE INDEX "doc_intel_analyses_document_idx" ON "document_intelligence_analyses" USING btree ("document_id","document_version");--> statement-breakpoint
CREATE INDEX "doc_intel_analyses_component_idx" ON "document_intelligence_analyses" USING btree ("component_id","analyzed_at");--> statement-breakpoint
CREATE INDEX "doc_intel_analyses_status_idx" ON "document_intelligence_analyses" USING btree ("status");