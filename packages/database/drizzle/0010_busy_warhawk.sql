CREATE TABLE "maintenance_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"schedule_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"asset_name" varchar(255) NOT NULL,
	"serial_number" varchar(100),
	"frequency" varchar(50) NOT NULL,
	"next_visit_date" timestamp with time zone NOT NULL,
	"assigned_technician" varchar(100),
	"status" varchar(50) DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_schedules_schedule_number_unique" UNIQUE("schedule_number")
);
--> statement-breakpoint
CREATE TABLE "rma_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rma_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"sales_order_id" uuid,
	"item_description" varchar(255) NOT NULL,
	"serial_number" varchar(100),
	"reason" text NOT NULL,
	"status" varchar(50) DEFAULT 'REQUESTED' NOT NULL,
	"disposition" varchar(50),
	"inspection_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rma_requests_rma_number_unique" UNIQUE("rma_number")
);
--> statement-breakpoint
CREATE TABLE "service_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_request_id" uuid,
	"work_order_id" uuid,
	"warranty_claim_id" uuid,
	"author" varchar(100) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"sales_order_id" uuid,
	"project_id" uuid,
	"component_id" uuid,
	"serial_number" varchar(100),
	"title" varchar(255) NOT NULL,
	"description" text,
	"priority" varchar(50) DEFAULT 'MEDIUM' NOT NULL,
	"category" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'OPEN' NOT NULL,
	"assigned_technician" varchar(100),
	"diagnostic_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_requests_service_number_unique" UNIQUE("service_number")
);
--> statement-breakpoint
CREATE TABLE "service_work_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_order_number" varchar(50) NOT NULL,
	"service_request_id" uuid NOT NULL,
	"assigned_technician" varchar(100),
	"title" varchar(255) NOT NULL,
	"description" text,
	"planned_hours" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"actual_hours" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"priority" varchar(50) DEFAULT 'MEDIUM' NOT NULL,
	"status" varchar(50) DEFAULT 'CREATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_work_orders_work_order_number_unique" UNIQUE("work_order_number")
);
--> statement-breakpoint
CREATE TABLE "warranty_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"warranty_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"serial_number" varchar(100),
	"purchase_date" timestamp with time zone NOT NULL,
	"expiry_date" timestamp with time zone NOT NULL,
	"claim_reason" text NOT NULL,
	"decision" varchar(50) DEFAULT 'SUBMITTED' NOT NULL,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warranty_claims_warranty_number_unique" UNIQUE("warranty_number")
);
--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_requests" ADD CONSTRAINT "rma_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rma_requests" ADD CONSTRAINT "rma_requests_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_notes" ADD CONSTRAINT "service_notes_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_notes" ADD CONSTRAINT "service_notes_work_order_id_service_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."service_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_notes" ADD CONSTRAINT "service_notes_warranty_claim_id_warranty_claims_id_fk" FOREIGN KEY ("warranty_claim_id") REFERENCES "public"."warranty_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_work_orders" ADD CONSTRAINT "service_work_orders_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_product_id_components_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_schedules_customer_id_idx" ON "maintenance_schedules" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "maintenance_schedules_technician_idx" ON "maintenance_schedules" USING btree ("assigned_technician");--> statement-breakpoint
CREATE INDEX "maintenance_schedules_status_idx" ON "maintenance_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rma_requests_customer_id_idx" ON "rma_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "rma_requests_sales_order_id_idx" ON "rma_requests" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "rma_requests_status_idx" ON "rma_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rma_requests_disposition_idx" ON "rma_requests" USING btree ("disposition");--> statement-breakpoint
CREATE INDEX "service_notes_service_request_id_idx" ON "service_notes" USING btree ("service_request_id");--> statement-breakpoint
CREATE INDEX "service_notes_work_order_id_idx" ON "service_notes" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "service_notes_warranty_claim_id_idx" ON "service_notes" USING btree ("warranty_claim_id");--> statement-breakpoint
CREATE INDEX "service_requests_customer_id_idx" ON "service_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "service_requests_status_idx" ON "service_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "service_requests_priority_idx" ON "service_requests" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "service_requests_category_idx" ON "service_requests" USING btree ("category");--> statement-breakpoint
CREATE INDEX "service_requests_technician_idx" ON "service_requests" USING btree ("assigned_technician");--> statement-breakpoint
CREATE INDEX "service_work_orders_service_request_id_idx" ON "service_work_orders" USING btree ("service_request_id");--> statement-breakpoint
CREATE INDEX "service_work_orders_technician_idx" ON "service_work_orders" USING btree ("assigned_technician");--> statement-breakpoint
CREATE INDEX "service_work_orders_status_idx" ON "service_work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "warranty_claims_customer_id_idx" ON "warranty_claims" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "warranty_claims_product_id_idx" ON "warranty_claims" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "warranty_claims_decision_idx" ON "warranty_claims" USING btree ("decision");