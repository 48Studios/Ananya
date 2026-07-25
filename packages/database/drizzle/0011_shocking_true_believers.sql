CREATE TABLE "capacity_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planning_run_id" uuid NOT NULL,
	"work_center_id" varchar(100) NOT NULL,
	"work_center_name" varchar(150) NOT NULL,
	"available_capacity_hours" numeric(10, 2) NOT NULL,
	"planned_capacity_hours" numeric(10, 2) NOT NULL,
	"utilization_percentage" numeric(6, 2) NOT NULL,
	"is_overloaded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planning_run_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"required_quantity" numeric(12, 4) NOT NULL,
	"available_quantity" numeric(12, 4) NOT NULL,
	"reserved_quantity" numeric(12, 4) NOT NULL,
	"shortage_quantity" numeric(12, 4) NOT NULL,
	"required_date" timestamp with time zone NOT NULL,
	"source" varchar(50) NOT NULL,
	"source_reference_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planning_run_id" uuid NOT NULL,
	"severity" varchar(20) DEFAULT 'INFO' NOT NULL,
	"message" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_number" varchar(50) NOT NULL,
	"horizon_days" integer NOT NULL,
	"status" varchar(30) DEFAULT 'DRAFT' NOT NULL,
	"started_by" varchar(100) NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_runs_run_number_unique" UNIQUE("run_number")
);
--> statement-breakpoint
CREATE TABLE "production_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planning_run_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"suggested_quantity" numeric(12, 4) NOT NULL,
	"suggested_start" timestamp with time zone NOT NULL,
	"suggested_completion" timestamp with time zone NOT NULL,
	"manufacturing_route" varchar(100),
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planning_run_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"supplier_id" uuid,
	"suggested_quantity" numeric(12, 4) NOT NULL,
	"required_date" timestamp with time zone NOT NULL,
	"recommendation_reason" varchar(500) NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capacity_plans" ADD CONSTRAINT "capacity_plans_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_messages" ADD CONSTRAINT "planning_messages_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recommendations" ADD CONSTRAINT "production_recommendations_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recommendations" ADD CONSTRAINT "production_recommendations_product_id_components_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capacity_plans_run_id_idx" ON "capacity_plans" USING btree ("planning_run_id");--> statement-breakpoint
CREATE INDEX "capacity_plans_work_center_idx" ON "capacity_plans" USING btree ("work_center_id");--> statement-breakpoint
CREATE INDEX "capacity_plans_overloaded_idx" ON "capacity_plans" USING btree ("is_overloaded");--> statement-breakpoint
CREATE INDEX "material_requirements_run_id_idx" ON "material_requirements" USING btree ("planning_run_id");--> statement-breakpoint
CREATE INDEX "material_requirements_component_id_idx" ON "material_requirements" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "material_requirements_source_idx" ON "material_requirements" USING btree ("source");--> statement-breakpoint
CREATE INDEX "planning_messages_run_id_idx" ON "planning_messages" USING btree ("planning_run_id");--> statement-breakpoint
CREATE INDEX "planning_messages_severity_idx" ON "planning_messages" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "planning_runs_status_idx" ON "planning_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "planning_runs_started_by_idx" ON "planning_runs" USING btree ("started_by");--> statement-breakpoint
CREATE INDEX "production_recommendations_run_id_idx" ON "production_recommendations" USING btree ("planning_run_id");--> statement-breakpoint
CREATE INDEX "production_recommendations_product_id_idx" ON "production_recommendations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "production_recommendations_status_idx" ON "production_recommendations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_recommendations_run_id_idx" ON "purchase_recommendations" USING btree ("planning_run_id");--> statement-breakpoint
CREATE INDEX "purchase_recommendations_component_id_idx" ON "purchase_recommendations" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "purchase_recommendations_supplier_id_idx" ON "purchase_recommendations" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_recommendations_status_idx" ON "purchase_recommendations" USING btree ("status");