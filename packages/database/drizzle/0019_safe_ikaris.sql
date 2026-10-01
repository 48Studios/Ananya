CREATE TABLE "spatial_anchors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"anchor_type" varchar(32) DEFAULT 'BIN' NOT NULL,
	"local_position_x" numeric(10, 4) DEFAULT '0' NOT NULL,
	"local_position_y" numeric(10, 4) DEFAULT '0' NOT NULL,
	"local_position_z" numeric(10, 4) DEFAULT '0' NOT NULL,
	"local_rotation_x" numeric(8, 4) DEFAULT '0' NOT NULL,
	"local_rotation_y" numeric(8, 4) DEFAULT '0' NOT NULL,
	"local_rotation_z" numeric(8, 4) DEFAULT '0' NOT NULL,
	"bounding_width_mm" numeric(10, 2),
	"bounding_height_mm" numeric(10, 2),
	"bounding_depth_mm" numeric(10, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spatial_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"format" varchar(32) DEFAULT 'GLB' NOT NULL,
	"asset_uri" varchar(512),
	"thumbnail_uri" varchar(512),
	"width_mm" numeric(10, 2) NOT NULL,
	"height_mm" numeric(10, 2) NOT NULL,
	"depth_mm" numeric(10, 2) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spatial_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"model_id" uuid,
	"parent_spatial_node_id" uuid,
	"anchor_id" uuid,
	"position_x" numeric(10, 4) DEFAULT '0' NOT NULL,
	"position_y" numeric(10, 4) DEFAULT '0' NOT NULL,
	"position_z" numeric(10, 4) DEFAULT '0' NOT NULL,
	"rotation_x" numeric(8, 4) DEFAULT '0' NOT NULL,
	"rotation_y" numeric(8, 4) DEFAULT '0' NOT NULL,
	"rotation_z" numeric(8, 4) DEFAULT '0' NOT NULL,
	"scale_x" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"scale_y" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"scale_z" numeric(6, 4) DEFAULT '1.0000' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spatial_anchors" ADD CONSTRAINT "spatial_anchors_model_id_spatial_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."spatial_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_nodes" ADD CONSTRAINT "spatial_nodes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_nodes" ADD CONSTRAINT "spatial_nodes_model_id_spatial_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."spatial_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_nodes" ADD CONSTRAINT "spatial_nodes_parent_spatial_node_id_spatial_nodes_id_fk" FOREIGN KEY ("parent_spatial_node_id") REFERENCES "public"."spatial_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spatial_nodes" ADD CONSTRAINT "spatial_nodes_anchor_id_spatial_anchors_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."spatial_anchors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spatial_anchors_model_code_unique" ON "spatial_anchors" USING btree ("model_id","code");--> statement-breakpoint
CREATE INDEX "spatial_anchors_model_id_idx" ON "spatial_anchors" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spatial_models_code_unique" ON "spatial_models" USING btree ("code");--> statement-breakpoint
CREATE INDEX "spatial_models_format_idx" ON "spatial_models" USING btree ("format");--> statement-breakpoint
CREATE INDEX "spatial_models_is_active_idx" ON "spatial_models" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "spatial_nodes_location_id_unique" ON "spatial_nodes" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "spatial_nodes_model_id_idx" ON "spatial_nodes" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "spatial_nodes_parent_id_idx" ON "spatial_nodes" USING btree ("parent_spatial_node_id");--> statement-breakpoint
CREATE INDEX "spatial_nodes_anchor_id_idx" ON "spatial_nodes" USING btree ("anchor_id");