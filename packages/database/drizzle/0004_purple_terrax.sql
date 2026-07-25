CREATE TABLE "bill_of_material_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bom_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"quantity_per_unit" numeric(12, 4) DEFAULT '1.0000' NOT NULL,
	"unit_of_measure" varchar(32) DEFAULT 'pcs' NOT NULL,
	"scrap_factor_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_of_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"revision" varchar(32) DEFAULT 'v1.0' NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_order_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_order_id" uuid NOT NULL,
	"operation_name" varchar(128) NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"production_number" varchar(64) NOT NULL,
	"bom_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"quantity_planned" integer DEFAULT 1 NOT NULL,
	"quantity_completed" integer DEFAULT 0 NOT NULL,
	"quantity_scrapped" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_consumption_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumption_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_planned" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"quantity_consumed" numeric(12, 4) NOT NULL,
	"batch_number" varchar(128),
	"serial_numbers" text[],
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_consumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consumption_number" varchar(64) NOT NULL,
	"production_order_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finished_goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fgr_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_produced" integer DEFAULT 0 NOT NULL,
	"quantity_scrapped" integer DEFAULT 0 NOT NULL,
	"batch_number" varchar(128),
	"serial_numbers" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finished_goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fgr_number" varchar(64) NOT NULL,
	"production_order_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturing_traceability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"production_order_id" uuid NOT NULL,
	"consumption_id" uuid,
	"fgr_id" uuid,
	"component_id" uuid NOT NULL,
	"location_id" uuid,
	"quantity" numeric(12, 4) NOT NULL,
	"batch_number" varchar(128),
	"serial_numbers" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_of_material_lines" ADD CONSTRAINT "bill_of_material_lines_bom_id_bill_of_materials_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_material_lines" ADD CONSTRAINT "bill_of_material_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_operations" ADD CONSTRAINT "production_order_operations_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bom_id_bill_of_materials_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption_lines" ADD CONSTRAINT "material_consumption_lines_consumption_id_material_consumptions_id_fk" FOREIGN KEY ("consumption_id") REFERENCES "public"."material_consumptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption_lines" ADD CONSTRAINT "material_consumption_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption_lines" ADD CONSTRAINT "material_consumption_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumptions" ADD CONSTRAINT "material_consumptions_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finished_goods_receipt_lines" ADD CONSTRAINT "finished_goods_receipt_lines_fgr_id_finished_goods_receipts_id_fk" FOREIGN KEY ("fgr_id") REFERENCES "public"."finished_goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finished_goods_receipt_lines" ADD CONSTRAINT "finished_goods_receipt_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finished_goods_receipt_lines" ADD CONSTRAINT "finished_goods_receipt_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finished_goods_receipts" ADD CONSTRAINT "finished_goods_receipts_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_traceability" ADD CONSTRAINT "manufacturing_traceability_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_traceability" ADD CONSTRAINT "manufacturing_traceability_consumption_id_material_consumptions_id_fk" FOREIGN KEY ("consumption_id") REFERENCES "public"."material_consumptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_traceability" ADD CONSTRAINT "manufacturing_traceability_fgr_id_finished_goods_receipts_id_fk" FOREIGN KEY ("fgr_id") REFERENCES "public"."finished_goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_traceability" ADD CONSTRAINT "manufacturing_traceability_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturing_traceability" ADD CONSTRAINT "manufacturing_traceability_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_of_material_lines_bom_id_idx" ON "bill_of_material_lines" USING btree ("bom_id");--> statement-breakpoint
CREATE INDEX "bill_of_material_lines_component_id_idx" ON "bill_of_material_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "bill_of_materials_component_id_idx" ON "bill_of_materials" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "bill_of_materials_status_idx" ON "bill_of_materials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_order_operations_order_id_idx" ON "production_order_operations" USING btree ("production_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_number_unique" ON "production_orders" USING btree ("production_number");--> statement-breakpoint
CREATE INDEX "production_orders_bom_id_idx" ON "production_orders" USING btree ("bom_id");--> statement-breakpoint
CREATE INDEX "production_orders_component_id_idx" ON "production_orders" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "production_orders_status_idx" ON "production_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "material_consumption_lines_consumption_id_idx" ON "material_consumption_lines" USING btree ("consumption_id");--> statement-breakpoint
CREATE INDEX "material_consumption_lines_component_id_idx" ON "material_consumption_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "material_consumption_lines_location_id_idx" ON "material_consumption_lines" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_consumptions_number_unique" ON "material_consumptions" USING btree ("consumption_number");--> statement-breakpoint
CREATE INDEX "material_consumptions_order_id_idx" ON "material_consumptions" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "material_consumptions_status_idx" ON "material_consumptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "finished_goods_receipt_lines_fgr_id_idx" ON "finished_goods_receipt_lines" USING btree ("fgr_id");--> statement-breakpoint
CREATE INDEX "finished_goods_receipt_lines_component_id_idx" ON "finished_goods_receipt_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "finished_goods_receipt_lines_location_id_idx" ON "finished_goods_receipt_lines" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finished_goods_receipts_number_unique" ON "finished_goods_receipts" USING btree ("fgr_number");--> statement-breakpoint
CREATE INDEX "finished_goods_receipts_order_id_idx" ON "finished_goods_receipts" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "finished_goods_receipts_status_idx" ON "finished_goods_receipts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "manufacturing_traceability_order_id_idx" ON "manufacturing_traceability" USING btree ("production_order_id");--> statement-breakpoint
CREATE INDEX "manufacturing_traceability_component_id_idx" ON "manufacturing_traceability" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "manufacturing_traceability_event_type_idx" ON "manufacturing_traceability" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "manufacturing_traceability_batch_number_idx" ON "manufacturing_traceability" USING btree ("batch_number");--> statement-breakpoint
CREATE INDEX "manufacturing_traceability_consumption_id_idx" ON "manufacturing_traceability" USING btree ("consumption_id");--> statement-breakpoint
CREATE INDEX "manufacturing_traceability_fgr_id_idx" ON "manufacturing_traceability" USING btree ("fgr_id");