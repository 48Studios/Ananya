CREATE TABLE "attribute_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"data_type" varchar(50) NOT NULL,
	"unit_category" varchar(50),
	"default_unit" varchar(50),
	"is_filterable" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"validation_rules" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribute_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attribute_definition_id" uuid NOT NULL,
	"code" varchar(100) NOT NULL,
	"label" varchar(200) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"attribute_definition_id" uuid NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"default_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "component_attribute_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"attribute_definition_id" uuid NOT NULL,
	"text_value" varchar(1000),
	"number_value" numeric(20, 6),
	"normalized_number_value" numeric(24, 8),
	"boolean_value" boolean,
	"date_value" timestamp with time zone,
	"unit" varchar(50),
	"option_id" uuid,
	"selected_option_ids" jsonb,
	"json_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "tracking_number" varchar(128);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "carrier" varchar(64);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "shipping_provider" varchar(64);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "tracking_url" text;--> statement-breakpoint
ALTER TABLE "import_export_jobs" ADD COLUMN IF NOT EXISTS "created_entities" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "attribute_options" ADD CONSTRAINT "attribute_options_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_attributes" ADD CONSTRAINT "category_attributes_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_attribute_values" ADD CONSTRAINT "component_attribute_values_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_attribute_values" ADD CONSTRAINT "component_attribute_values_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_attribute_values" ADD CONSTRAINT "component_attribute_values_option_id_attribute_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."attribute_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_definitions_code_unique" ON "attribute_definitions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "attribute_definitions_data_type_idx" ON "attribute_definitions" USING btree ("data_type");--> statement-breakpoint
CREATE INDEX "attribute_definitions_unit_category_idx" ON "attribute_definitions" USING btree ("unit_category");--> statement-breakpoint
CREATE INDEX "attribute_definitions_is_filterable_idx" ON "attribute_definitions" USING btree ("is_filterable");--> statement-breakpoint
CREATE UNIQUE INDEX "attribute_options_def_code_unique" ON "attribute_options" USING btree ("attribute_definition_id","code");--> statement-breakpoint
CREATE INDEX "attribute_options_def_id_idx" ON "attribute_options" USING btree ("attribute_definition_id");--> statement-breakpoint
CREATE INDEX "attribute_options_sort_order_idx" ON "attribute_options" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "category_attributes_cat_def_unique" ON "category_attributes" USING btree ("category_id","attribute_definition_id");--> statement-breakpoint
CREATE INDEX "category_attributes_category_id_idx" ON "category_attributes" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "category_attributes_def_id_idx" ON "category_attributes" USING btree ("attribute_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "component_attr_values_comp_def_unique" ON "component_attribute_values" USING btree ("component_id","attribute_definition_id");--> statement-breakpoint
CREATE INDEX "component_attr_values_comp_id_idx" ON "component_attribute_values" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "component_attr_values_def_norm_num_idx" ON "component_attribute_values" USING btree ("attribute_definition_id","normalized_number_value");--> statement-breakpoint
CREATE INDEX "component_attr_values_def_num_idx" ON "component_attribute_values" USING btree ("attribute_definition_id","number_value");--> statement-breakpoint
CREATE INDEX "component_attr_values_def_option_idx" ON "component_attribute_values" USING btree ("attribute_definition_id","option_id");--> statement-breakpoint
CREATE INDEX "component_attr_values_def_bool_idx" ON "component_attribute_values" USING btree ("attribute_definition_id","boolean_value");--> statement-breakpoint
CREATE INDEX "component_attr_values_def_text_idx" ON "component_attribute_values" USING btree ("attribute_definition_id","text_value");