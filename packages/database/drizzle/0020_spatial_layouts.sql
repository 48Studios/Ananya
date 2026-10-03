CREATE TABLE "spatial_layout_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" uuid NOT NULL,
	"slot_id" varchar(64) NOT NULL,
	"slot_code" varchar(64) NOT NULL,
	"location_id" uuid NOT NULL,
	"logical_row" integer NOT NULL,
	"logical_col" integer NOT NULL,
	"is_stale" boolean DEFAULT false NOT NULL,
	"stale_reason" text,
	"acknowledged_change_signature" varchar(255),
	"mapped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spatial_layout_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layout_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"mappings_snapshot" jsonb NOT NULL,
	"diff_summary" jsonb NOT NULL,
	"change_description" text,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spatial_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_location_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"template_type" varchar(64) NOT NULL,
	"engine_version" varchar(32) DEFAULT '1.0.0' NOT NULL,
	"config" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" varchar(32) DEFAULT 'PUBLISHED' NOT NULL,
	"total_compartments" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spatial_layout_mappings" ADD CONSTRAINT "spatial_layout_mappings_layout_id_spatial_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."spatial_layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_layout_mappings" ADD CONSTRAINT "spatial_layout_mappings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_layout_revisions" ADD CONSTRAINT "spatial_layout_revisions_layout_id_spatial_layouts_id_fk" FOREIGN KEY ("layout_id") REFERENCES "public"."spatial_layouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_layout_revisions" ADD CONSTRAINT "spatial_layout_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_layouts" ADD CONSTRAINT "spatial_layouts_parent_location_id_locations_id_fk" FOREIGN KEY ("parent_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_layouts" ADD CONSTRAINT "spatial_layouts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_layouts" ADD CONSTRAINT "spatial_layouts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spatial_layout_mappings_layout_slot_unique" ON "spatial_layout_mappings" USING btree ("layout_id","slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spatial_layout_mappings_layout_location_unique" ON "spatial_layout_mappings" USING btree ("layout_id","location_id");--> statement-breakpoint
CREATE INDEX "spatial_layout_mappings_layout_id_idx" ON "spatial_layout_mappings" USING btree ("layout_id");--> statement-breakpoint
CREATE INDEX "spatial_layout_mappings_location_id_idx" ON "spatial_layout_mappings" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "spatial_layout_mappings_is_stale_idx" ON "spatial_layout_mappings" USING btree ("is_stale");--> statement-breakpoint
CREATE UNIQUE INDEX "spatial_layout_revisions_layout_rev_unique" ON "spatial_layout_revisions" USING btree ("layout_id","revision_number");--> statement-breakpoint
CREATE INDEX "spatial_layout_revisions_layout_id_idx" ON "spatial_layout_revisions" USING btree ("layout_id");--> statement-breakpoint
CREATE INDEX "spatial_layout_revisions_created_at_idx" ON "spatial_layout_revisions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spatial_layouts_code_unique" ON "spatial_layouts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "spatial_layouts_active_parent_unique" ON "spatial_layouts" USING btree ("parent_location_id") WHERE status = 'PUBLISHED';--> statement-breakpoint
CREATE INDEX "spatial_layouts_parent_location_id_idx" ON "spatial_layouts" USING btree ("parent_location_id");--> statement-breakpoint
CREATE INDEX "spatial_layouts_template_type_idx" ON "spatial_layouts" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "spatial_layouts_status_idx" ON "spatial_layouts" USING btree ("status");