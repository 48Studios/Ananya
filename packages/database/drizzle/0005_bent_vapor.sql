CREATE TABLE "warehouse_bins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"capacity" numeric(12, 4) DEFAULT '1000.0000' NOT NULL,
	"current_utilization" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"purpose" varchar(32) DEFAULT 'STORAGE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"bin_id" uuid NOT NULL,
	"expected_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"counted_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"variance" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_number" varchar(64) NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"assigned_user" varchar(128),
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"frequency" varchar(32) DEFAULT 'MONTHLY' NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"selection_rule" jsonb,
	"next_scheduled_date" timestamp with time zone NOT NULL,
	"last_executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"batch_number" varchar(128),
	"serial_numbers" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_number" varchar(64) NOT NULL,
	"source_bin_id" uuid NOT NULL,
	"destination_bin_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"allow_negative_inventory" boolean DEFAULT false NOT NULL,
	"enforce_bin_capacity" boolean DEFAULT true NOT NULL,
	"directed_putaway" boolean DEFAULT false NOT NULL,
	"directed_picking" boolean DEFAULT false NOT NULL,
	"default_receiving_bin_id" uuid,
	"default_production_bin_id" uuid,
	"default_shipping_bin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warehouse_bins" ADD CONSTRAINT "warehouse_bins_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_zones" ADD CONSTRAINT "warehouse_zones_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfer_lines" ADD CONSTRAINT "warehouse_transfer_lines_transfer_id_warehouse_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."warehouse_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfer_lines" ADD CONSTRAINT "warehouse_transfer_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_source_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("source_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_destination_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("destination_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_policies" ADD CONSTRAINT "warehouse_policies_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_policies" ADD CONSTRAINT "warehouse_policies_default_receiving_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("default_receiving_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_policies" ADD CONSTRAINT "warehouse_policies_default_production_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("default_production_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_policies" ADD CONSTRAINT "warehouse_policies_default_shipping_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("default_shipping_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_bins_code_unique" ON "warehouse_bins" USING btree ("code");--> statement-breakpoint
CREATE INDEX "warehouse_bins_warehouse_id_idx" ON "warehouse_bins" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "warehouse_bins_purpose_idx" ON "warehouse_bins" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "warehouse_zones_warehouse_id_idx" ON "warehouse_zones" USING btree ("warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_code_unique" ON "warehouses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "warehouses_status_idx" ON "warehouses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_count_lines_count_id_idx" ON "stock_count_lines" USING btree ("stock_count_id");--> statement-breakpoint
CREATE INDEX "stock_count_lines_component_id_idx" ON "stock_count_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "stock_count_lines_bin_id_idx" ON "stock_count_lines" USING btree ("bin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_counts_number_unique" ON "stock_counts" USING btree ("count_number");--> statement-breakpoint
CREATE INDEX "stock_counts_warehouse_id_idx" ON "stock_counts" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "stock_counts_status_idx" ON "stock_counts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cycle_counts_warehouse_id_idx" ON "cycle_counts" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "cycle_counts_status_idx" ON "cycle_counts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "warehouse_transfer_lines_transfer_id_idx" ON "warehouse_transfer_lines" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "warehouse_transfer_lines_component_id_idx" ON "warehouse_transfer_lines" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_transfers_number_unique" ON "warehouse_transfers" USING btree ("transfer_number");--> statement-breakpoint
CREATE INDEX "warehouse_transfers_source_bin_idx" ON "warehouse_transfers" USING btree ("source_bin_id");--> statement-breakpoint
CREATE INDEX "warehouse_transfers_dest_bin_idx" ON "warehouse_transfers" USING btree ("destination_bin_id");--> statement-breakpoint
CREATE INDEX "warehouse_transfers_status_idx" ON "warehouse_transfers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_policies_warehouse_id_unique" ON "warehouse_policies" USING btree ("warehouse_id");