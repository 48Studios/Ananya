CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"address_type" varchar(50) DEFAULT 'BILLING' NOT NULL,
	"street1" varchar(255) NOT NULL,
	"street2" varchar(255),
	"city" varchar(100) NOT NULL,
	"state" varchar(100),
	"postal_code" varchar(50) NOT NULL,
	"country" varchar(100) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"role" varchar(100),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_number" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"tax_id" varchar(100),
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"credit_status" varchar(50) DEFAULT 'OK' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_customer_number_unique" UNIQUE("customer_number")
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quotation_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_price" numeric(12, 4) NOT NULL,
	"discount" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total_price" numeric(12, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "sales_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_price" numeric(12, 4) NOT NULL,
	"discount" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total_price" numeric(12, 4) NOT NULL,
	"reserved_quantity" numeric(12, 4) DEFAULT '0' NOT NULL,
	"fulfilled_quantity" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_date" timestamp with time zone DEFAULT now() NOT NULL,
	"required_date" timestamp with time zone,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"quotation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "fulfillment_request_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fulfillment_request_id" uuid NOT NULL,
	"sales_order_line_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"requested_quantity" numeric(12, 4) NOT NULL,
	"fulfilled_quantity" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_number" varchar(50) NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'PENDING' NOT NULL,
	"carrier_name" varchar(100),
	"tracking_number" varchar(100),
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillment_requests_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
CREATE TABLE "customer_return_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"customer_return_id" uuid NOT NULL,
	"sales_order_line_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"reason" varchar(50) NOT NULL,
	"disposition" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"return_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_returns_return_number_unique" UNIQUE("return_number")
);
--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_request_lines" ADD CONSTRAINT "fulfillment_request_lines_fulfillment_request_id_fulfillment_requests_id_fk" FOREIGN KEY ("fulfillment_request_id") REFERENCES "public"."fulfillment_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_request_lines" ADD CONSTRAINT "fulfillment_request_lines_sales_order_line_id_sales_order_lines_id_fk" FOREIGN KEY ("sales_order_line_id") REFERENCES "public"."sales_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_request_lines" ADD CONSTRAINT "fulfillment_request_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_requests" ADD CONSTRAINT "fulfillment_requests_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_return_lines" ADD CONSTRAINT "customer_return_lines_customer_return_id_customer_returns_id_fk" FOREIGN KEY ("customer_return_id") REFERENCES "public"."customer_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_return_lines" ADD CONSTRAINT "customer_return_lines_sales_order_line_id_sales_order_lines_id_fk" FOREIGN KEY ("sales_order_line_id") REFERENCES "public"."sales_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_return_lines" ADD CONSTRAINT "customer_return_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_returns" ADD CONSTRAINT "customer_returns_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_contacts_customer_id_idx" ON "customer_contacts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "quotation_lines_quotation_id_idx" ON "quotation_lines" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "quotation_lines_component_id_idx" ON "quotation_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "quotations_customer_id_idx" ON "quotations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotations_status_idx" ON "quotations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_order_lines_order_id_idx" ON "sales_order_lines" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "sales_order_lines_component_id_idx" ON "sales_order_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "sales_orders_customer_id_idx" ON "sales_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "fulfillment_req_lines_req_id_idx" ON "fulfillment_request_lines" USING btree ("fulfillment_request_id");--> statement-breakpoint
CREATE INDEX "fulfillment_req_lines_order_line_idx" ON "fulfillment_request_lines" USING btree ("sales_order_line_id");--> statement-breakpoint
CREATE INDEX "fulfillment_requests_order_id_idx" ON "fulfillment_requests" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "fulfillment_requests_warehouse_id_idx" ON "fulfillment_requests" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "fulfillment_requests_status_idx" ON "fulfillment_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_return_lines_return_id_idx" ON "customer_return_lines" USING btree ("customer_return_id");--> statement-breakpoint
CREATE INDEX "customer_return_lines_order_line_idx" ON "customer_return_lines" USING btree ("sales_order_line_id");--> statement-breakpoint
CREATE INDEX "customer_returns_customer_id_idx" ON "customer_returns" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_returns_order_id_idx" ON "customer_returns" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "customer_returns_status_idx" ON "customer_returns" USING btree ("status");