CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"kind" varchar(50) NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"manufacturer_id" uuid,
	"category_id" uuid,
	"default_location_id" uuid,
	"unit" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" varchar(1000),
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"transaction_type" varchar(50) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_of_measure" varchar(50) NOT NULL,
	"source_location_id" uuid,
	"destination_location_id" uuid,
	"reference" varchar(200),
	"reason" varchar(1000),
	"created_by" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"is_base_unit" boolean DEFAULT false NOT NULL,
	"conversion_factor" numeric(10, 4),
	"precision" numeric(10, 0) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_projections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"unit_of_measure" varchar(50) NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"reserved_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"fulfilled_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"unit_of_measure" varchar(32) DEFAULT 'pcs' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_number" varchar(64) NOT NULL,
	"reservation_type" varchar(32) DEFAULT 'WORK_ORDER' NOT NULL,
	"reference_document" varchar(128),
	"reserved_by" varchar(128) NOT NULL,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"batch_number" varchar(100) NOT NULL,
	"manufacturing_date" timestamp with time zone,
	"expiry_date" timestamp with time zone,
	"supplier_batch_number" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"serial_number" varchar(100) NOT NULL,
	"location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"vendor_part_number" varchar(128) NOT NULL,
	"lead_time_days" integer DEFAULT 7 NOT NULL,
	"minimum_order_quantity" integer DEFAULT 1 NOT NULL,
	"order_multiple" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(64),
	"role" varchar(64),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"tax_id" varchar(64),
	"payment_terms" varchar(32) DEFAULT 'NET30' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"rating" numeric(3, 2) DEFAULT '5.00',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"vendor_part_number" varchar(128),
	"unit_price" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"quantity_ordered" integer DEFAULT 1 NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"line_total" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" varchar(64) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"tax_total" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"grand_total" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"notes" text,
	"issued_at" timestamp with time zone,
	"expected_delivery_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goods_receipt_id" uuid NOT NULL,
	"po_line_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_received" integer DEFAULT 0 NOT NULL,
	"quantity_rejected" integer DEFAULT 0 NOT NULL,
	"batch_number" varchar(128),
	"expiry_date" timestamp with time zone,
	"serial_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gr_number" varchar(64) NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"packing_slip_number" varchar(128),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_return_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity_returned" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"reason" text NOT NULL,
	"batch_number" varchar(128),
	"serial_numbers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"return_number" varchar(64) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"rma_number" varchar(128),
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"total_amount" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_invoice_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"quantity_billed" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"line_total" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"vendor_invoice_number" varchar(128) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"goods_receipt_id" uuid,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"match_status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"total_amount" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procurement_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_type" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"threshold_amount" numeric(14, 4) DEFAULT '0.0000',
	"over_receipt_tolerance_percent" numeric(5, 2) DEFAULT '0.00',
	"requires_executive_approval" boolean DEFAULT false,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"location_id" uuid,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"priority" varchar(32) DEFAULT 'NORMAL' NOT NULL,
	"quantity_planned" integer DEFAULT 1 NOT NULL,
	"quantity_completed" integer DEFAULT 0 NOT NULL,
	"quantity_scrapped" integer DEFAULT 0 NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"notes" text,
	"created_by" varchar(64),
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
CREATE TABLE "stock_adjustment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stock_adjustment_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"current_quantity" integer DEFAULT 0 NOT NULL,
	"counted_quantity" integer DEFAULT 0 NOT NULL,
	"difference" integer DEFAULT 0 NOT NULL,
	"unit_of_measure" varchar(32) DEFAULT 'pcs' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_number" varchar(64) NOT NULL,
	"location_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"reason" varchar(256) NOT NULL,
	"notes" text,
	"created_by" varchar(128) DEFAULT 'SYSTEM' NOT NULL,
	"approved_by" varchar(128),
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_count_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"system_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"counted_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"variance" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"unit_of_measure" varchar(32) DEFAULT 'pcs' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"count_number" varchar(64) NOT NULL,
	"location_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"assigned_counter" varchar(128),
	"scheduled_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"created_by" varchar(128),
	"approved_by" varchar(128),
	"stock_adjustment_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_of_measure" varchar(32) DEFAULT 'pcs' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_number" varchar(64) NOT NULL,
	"source_location_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'DRAFT' NOT NULL,
	"requested_date" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"requested_by" varchar(128),
	"notes" text,
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
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"account_type" varchar(50) NOT NULL,
	"parent_account_id" uuid,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_number" varchar(50) NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"reference" varchar(100),
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_journal_number_unique" UNIQUE("journal_number")
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(14, 4) DEFAULT '0' NOT NULL,
	"credit" numeric(14, 4) DEFAULT '0' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"balance" numeric(14, 4) NOT NULL,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "receivable_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receivable_invoice_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_applied" numeric(14, 4) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payable_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_invoice_id" uuid NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"balance" numeric(14, 4) NOT NULL,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payable_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "payable_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payable_invoice_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_applied" numeric(14, 4) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_number" varchar(50) NOT NULL,
	"payment_type" varchar(50) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"reference" varchar(100),
	"bank_account_id" uuid,
	"status" varchar(50) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_payment_number_unique" UNIQUE("payment_number")
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"account_number" varchar(50) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "bank_reconciliations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"statement_date" timestamp with time zone NOT NULL,
	"opening_balance" numeric(14, 4) NOT NULL,
	"closing_balance" numeric(14, 4) NOT NULL,
	"status" varchar(50) DEFAULT 'IN_PROGRESS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bank_reconciliation_id" uuid NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"matched_payment_id" uuid,
	"is_matched" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_number" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"company" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(50),
	"source" varchar(50) DEFAULT 'WEBSITE' NOT NULL,
	"industry" varchar(100),
	"owner" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'NEW' NOT NULL,
	"disqualification_reason" text,
	"converted_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_leads_lead_number_unique" UNIQUE("lead_number")
);
--> statement-breakpoint
CREATE TABLE "crm_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"industry" varchar(100),
	"website" varchar(255),
	"billing_address" text,
	"shipping_address" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"crm_account_id" uuid NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(50),
	"role" varchar(50) DEFAULT 'OTHER' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_opportunities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"opportunity_number" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"lead_id" uuid,
	"crm_account_id" uuid NOT NULL,
	"estimated_value" numeric(14, 4) NOT NULL,
	"expected_close_date" timestamp with time zone NOT NULL,
	"probability" numeric(5, 2) DEFAULT '20.00' NOT NULL,
	"stage" varchar(50) DEFAULT 'PROSPECTING' NOT NULL,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_opportunities_opportunity_number_unique" UNIQUE("opportunity_number")
);
--> statement-breakpoint
CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"owner" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'SCHEDULED' NOT NULL,
	"related_lead_id" uuid,
	"related_account_id" uuid,
	"related_opportunity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"author" varchar(100) NOT NULL,
	"body" text NOT NULL,
	"lead_id" uuid,
	"crm_account_id" uuid,
	"opportunity_id" uuid,
	"activity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"activity_type" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"performed_by" varchar(100) NOT NULL,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"allocated_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"issued_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"returned_quantity" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"unit_of_measure" varchar(50) DEFAULT 'pcs' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"status" varchar(50) DEFAULT 'OPEN' NOT NULL,
	"completion_percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_number" varchar(50) NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"assigned_user" varchar(100),
	"estimated_hours" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"actual_hours" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"priority" varchar(50) DEFAULT 'MEDIUM' NOT NULL,
	"status" varchar(50) DEFAULT 'TODO' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_tasks_task_number_unique" UNIQUE("task_number")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_number" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"project_type" varchar(50) DEFAULT 'INTERNAL' NOT NULL,
	"description" text,
	"owner" varchar(100) DEFAULT 'Project Lead' NOT NULL,
	"project_manager" varchar(100) NOT NULL,
	"customer_id" uuid,
	"sales_order_id" uuid,
	"start_date" timestamp with time zone NOT NULL,
	"target_completion_date" timestamp with time zone NOT NULL,
	"priority" varchar(50) DEFAULT 'MEDIUM' NOT NULL,
	"status" varchar(50) DEFAULT 'PLANNING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_project_number_unique" UNIQUE("project_number")
);
--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(100) NOT NULL,
	"task_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'SUBMITTED' NOT NULL,
	"approved_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "organization_setup_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"user_email" varchar(255),
	"action" varchar(100) NOT NULL,
	"category" varchar(50) NOT NULL,
	"ip_address" varchar(64),
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"role_id" uuid,
	"department" varchar(100),
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"invited_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(500) NOT NULL,
	"ip_address" varchar(64),
	"user_agent" varchar(500),
	"device_info" varchar(255),
	"expires_at" timestamp with time zone NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"department" varchar(100),
	"role_id" uuid,
	"secondary_role_ids" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(32) DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"module" varchar(64) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" varchar(128) NOT NULL,
	"entity_title" varchar(255),
	"description" text NOT NULL,
	"user_id" uuid,
	"user_name" varchar(128),
	"user_email" varchar(255),
	"status" varchar(32) DEFAULT 'SUCCESS' NOT NULL,
	"severity" varchar(32) DEFAULT 'INFO' NOT NULL,
	"href" varchar(255),
	"ip_address" varchar(64),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" varchar(32) NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"format" varchar(32) DEFAULT 'CSV' NOT NULL,
	"status" varchar(32) DEFAULT 'QUEUED' NOT NULL,
	"total_records" integer DEFAULT 0 NOT NULL,
	"processed_records" integer DEFAULT 0 NOT NULL,
	"failed_records" integer DEFAULT 0 NOT NULL,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"file_name" varchar(255),
	"file_url" text,
	"errors" jsonb DEFAULT '[]'::jsonb,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"changelog" text,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_confidential" boolean DEFAULT false NOT NULL,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"categories_json" jsonb DEFAULT '{"Inventory":true,"Procurement":true,"Manufacturing":true,"Projects":true,"Security":true}'::jsonb,
	"priority_threshold" varchar(32) DEFAULT 'LOW' NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"desktop_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_hours_start" varchar(10),
	"quiet_hours_end" varchar(10),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"module" varchar(64) NOT NULL,
	"type" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"entity_type" varchar(64),
	"entity_id" varchar(64),
	"priority" varchar(32) DEFAULT 'NORMAL' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'SUCCESS' NOT NULL,
	"triggered_by" varchar(255),
	"logs_json" jsonb DEFAULT '[]'::jsonb,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"trigger_type" varchar(64) NOT NULL,
	"conditions_json" jsonb DEFAULT '[]'::jsonb,
	"actions_json" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(64) DEFAULT 'EXPERIMENTAL' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "numbering_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"prefix" varchar(32) NOT NULL,
	"date_format" varchar(32) DEFAULT 'YYYY',
	"next_sequence_number" integer DEFAULT 1 NOT NULL,
	"zero_pad_length" integer DEFAULT 6 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "numbering_series_entity_type_unique" UNIQUE("entity_type")
);
--> statement-breakpoint
CREATE TABLE "organization_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" varchar(255) DEFAULT '48 Studios' NOT NULL,
	"legal_name" varchar(255) DEFAULT '48 Studios Pvt Ltd' NOT NULL,
	"registration_number" varchar(128),
	"tax_id" varchar(128) DEFAULT 'GSTIN-33AAACD4848A1Z5' NOT NULL,
	"email" varchar(255) DEFAULT 'ops@48studios.com' NOT NULL,
	"phone" varchar(64) DEFAULT '+91 44 2848 4848' NOT NULL,
	"website" varchar(255) DEFAULT 'https://48studios.com',
	"address" text DEFAULT '48 Enterprise Way, Tech Park',
	"city" varchar(128) DEFAULT 'Chennai',
	"state" varchar(128) DEFAULT 'Tamil Nadu',
	"country" varchar(128) DEFAULT 'India',
	"postal_code" varchar(32) DEFAULT '600001',
	"primary_timezone" varchar(64) DEFAULT 'Asia/Kolkata',
	"logo_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"supported_currencies" jsonb DEFAULT '["INR","USD","EUR"]'::jsonb,
	"default_warehouse_id" uuid,
	"fiscal_year_start_month" integer DEFAULT 4 NOT NULL,
	"date_format" varchar(32) DEFAULT 'YYYY-MM-DD' NOT NULL,
	"reorder_defaults_json" jsonb DEFAULT '{"minStockLevel":10,"reorderQuantity":50}'::jsonb,
	"tax_rates_json" jsonb DEFAULT '[{"name":"GST 18%","rate":18},{"name":"GST 12%","rate":12},{"name":"GST 5%","rate":5}]'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_dashboard_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"widgets_json" jsonb DEFAULT '[{"id":"stats-summary","title":"Key Metrics","enabled":true,"width":"full"},{"id":"low-stock","title":"Low Stock Inventory","enabled":true,"width":"half"},{"id":"recent-pos","title":"Recent Purchase Orders","enabled":true,"width":"half"},{"id":"activity-feed","title":"Operational Activity Feed","enabled":true,"width":"half"},{"id":"favorite-records","title":"Pinned & Favorites","enabled":true,"width":"half"}]'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_dashboard_layouts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"href" varchar(512) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"module" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"filters_json" jsonb DEFAULT '{}'::jsonb,
	"sort_json" jsonb DEFAULT '{"field":"createdAt","direction":"desc"}'::jsonb,
	"columns_json" jsonb DEFAULT '[]'::jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_workspace_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"default_landing_page" varchar(255) DEFAULT '/dashboard' NOT NULL,
	"table_density" varchar(32) DEFAULT 'compact' NOT NULL,
	"theme_preference" varchar(32) DEFAULT 'system' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_workspace_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_parent_id_locations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_default_location_id_locations_id_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_source_location_id_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_projections" ADD CONSTRAINT "inventory_projections_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_projections" ADD CONSTRAINT "inventory_projections_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation_lines" ADD CONSTRAINT "inventory_reservation_lines_reservation_id_inventory_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation_lines" ADD CONSTRAINT "inventory_reservation_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation_lines" ADD CONSTRAINT "inventory_reservation_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serials" ADD CONSTRAINT "serials_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serials" ADD CONSTRAINT "serials_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_components" ADD CONSTRAINT "supplier_components_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_components" ADD CONSTRAINT "supplier_components_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_supplier_return_id_supplier_returns_id_fk" FOREIGN KEY ("supplier_return_id") REFERENCES "public"."supplier_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_goods_receipt_id_goods_receipts_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "public"."goods_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_material_lines" ADD CONSTRAINT "bill_of_material_lines_bom_id_bill_of_materials_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_material_lines" ADD CONSTRAINT "bill_of_material_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_operations" ADD CONSTRAINT "production_order_operations_production_order_id_production_orders_id_fk" FOREIGN KEY ("production_order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_bom_id_bill_of_materials_id_fk" FOREIGN KEY ("bom_id") REFERENCES "public"."bill_of_materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "warehouse_bins" ADD CONSTRAINT "warehouse_bins_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_zones" ADD CONSTRAINT "warehouse_zones_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_stock_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("stock_adjustment_id") REFERENCES "public"."stock_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_cycle_count_id_cycle_counts_id_fk" FOREIGN KEY ("cycle_count_id") REFERENCES "public"."cycle_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_count_lines" ADD CONSTRAINT "cycle_count_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_counts" ADD CONSTRAINT "cycle_counts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfer_lines" ADD CONSTRAINT "warehouse_transfer_lines_transfer_id_warehouse_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."warehouse_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfer_lines" ADD CONSTRAINT "warehouse_transfer_lines_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_source_location_id_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_destination_location_id_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_policies" ADD CONSTRAINT "warehouse_policies_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_policies" ADD CONSTRAINT "warehouse_policies_default_receiving_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("default_receiving_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_policies" ADD CONSTRAINT "warehouse_policies_default_production_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("default_production_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_policies" ADD CONSTRAINT "warehouse_policies_default_shipping_bin_id_warehouse_bins_id_fk" FOREIGN KEY ("default_shipping_bin_id") REFERENCES "public"."warehouse_bins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD CONSTRAINT "receivable_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_invoices" ADD CONSTRAINT "receivable_invoices_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivable_invoice_id_receivable_invoices_id_fk" FOREIGN KEY ("receivable_invoice_id") REFERENCES "public"."receivable_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payable_invoices" ADD CONSTRAINT "payable_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payable_invoices" ADD CONSTRAINT "payable_invoices_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_payable_invoice_id_payable_invoices_id_fk" FOREIGN KEY ("payable_invoice_id") REFERENCES "public"."payable_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_reconciliation_id_bank_reconciliations_id_fk" FOREIGN KEY ("bank_reconciliation_id") REFERENCES "public"."bank_reconciliations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_payment_id_payments_id_fk" FOREIGN KEY ("matched_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_crm_account_id_crm_accounts_id_fk" FOREIGN KEY ("crm_account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_crm_account_id_crm_accounts_id_fk" FOREIGN KEY ("crm_account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_related_lead_id_crm_leads_id_fk" FOREIGN KEY ("related_lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_related_account_id_crm_accounts_id_fk" FOREIGN KEY ("related_account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_related_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("related_opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_crm_account_id_crm_accounts_id_fk" FOREIGN KEY ("crm_account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_opportunity_id_crm_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."crm_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_activity_id_crm_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."crm_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "capacity_plans" ADD CONSTRAINT "capacity_plans_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_messages" ADD CONSTRAINT "planning_messages_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recommendations" ADD CONSTRAINT "production_recommendations_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recommendations" ADD CONSTRAINT "production_recommendations_product_id_components_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_planning_run_id_planning_runs_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_setup_status" ADD CONSTRAINT "organization_setup_status_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_export_jobs" ADD CONSTRAINT "import_export_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_dashboard_layouts" ADD CONSTRAINT "user_dashboard_layouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorites" ADD CONSTRAINT "user_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_views" ADD CONSTRAINT "user_saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_workspace_preferences" ADD CONSTRAINT "user_workspace_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_code_unique" ON "locations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "locations_parent_id_idx" ON "locations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "locations_kind_idx" ON "locations" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "components_sku_unique" ON "components" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "components_manufacturer_id_idx" ON "components" USING btree ("manufacturer_id");--> statement-breakpoint
CREATE INDEX "components_category_id_idx" ON "components" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "components_default_location_id_idx" ON "components" USING btree ("default_location_id");--> statement-breakpoint
CREATE INDEX "components_unit_idx" ON "components" USING btree ("unit");--> statement-breakpoint
CREATE UNIQUE INDEX "manufacturers_code_idx" ON "manufacturers" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_code_unique" ON "categories" USING btree ("code");--> statement-breakpoint
CREATE INDEX "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "inventory_transactions_component_id_idx" ON "inventory_transactions" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "inventory_transactions_source_location_id_idx" ON "inventory_transactions" USING btree ("source_location_id");--> statement-breakpoint
CREATE INDEX "inventory_transactions_destination_location_id_idx" ON "inventory_transactions" USING btree ("destination_location_id");--> statement-breakpoint
CREATE INDEX "inventory_transactions_transaction_type_idx" ON "inventory_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE INDEX "inventory_transactions_created_at_idx" ON "inventory_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "units_name_unique" ON "units" USING btree ("name");--> statement-breakpoint
CREATE INDEX "units_category_idx" ON "units" USING btree ("category");--> statement-breakpoint
CREATE INDEX "units_is_base_unit_idx" ON "units" USING btree ("is_base_unit");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_projections_comp_loc_unique" ON "inventory_projections" USING btree ("component_id","location_id");--> statement-breakpoint
CREATE INDEX "inventory_projections_component_id_idx" ON "inventory_projections" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "inventory_projections_location_id_idx" ON "inventory_projections" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "inventory_reservation_lines_reservation_id_idx" ON "inventory_reservation_lines" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "inventory_reservation_lines_component_id_idx" ON "inventory_reservation_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "inventory_reservation_lines_location_id_idx" ON "inventory_reservation_lines" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_number_unique" ON "inventory_reservations" USING btree ("reservation_number");--> statement-breakpoint
CREATE INDEX "inventory_reservations_status_idx" ON "inventory_reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_reservations_type_idx" ON "inventory_reservations" USING btree ("reservation_type");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_component_batch_unique" ON "batches" USING btree ("component_id","batch_number");--> statement-breakpoint
CREATE INDEX "batches_component_id_idx" ON "batches" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "serials_component_serial_unique" ON "serials" USING btree ("component_id","serial_number");--> statement-breakpoint
CREATE INDEX "serials_component_id_idx" ON "serials" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "serials_location_id_idx" ON "serials" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "supplier_components_supplier_id_idx" ON "supplier_components" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_components_component_id_idx" ON "supplier_components" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "supplier_contacts_supplier_id_idx" ON "supplier_contacts" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_unique" ON "suppliers" USING btree ("code");--> statement-breakpoint
CREATE INDEX "suppliers_is_active_idx" ON "suppliers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_po_id_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_order_lines_component_id_idx" ON "purchase_order_lines" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_po_number_unique" ON "purchase_orders" USING btree ("po_number");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "goods_receipt_lines_gr_id_idx" ON "goods_receipt_lines" USING btree ("goods_receipt_id");--> statement-breakpoint
CREATE INDEX "goods_receipt_lines_po_line_id_idx" ON "goods_receipt_lines" USING btree ("po_line_id");--> statement-breakpoint
CREATE INDEX "goods_receipt_lines_component_id_idx" ON "goods_receipt_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "goods_receipt_lines_location_id_idx" ON "goods_receipt_lines" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goods_receipts_gr_number_unique" ON "goods_receipts" USING btree ("gr_number");--> statement-breakpoint
CREATE INDEX "goods_receipts_po_id_idx" ON "goods_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "goods_receipts_supplier_id_idx" ON "goods_receipts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_return_lines_return_id_idx" ON "supplier_return_lines" USING btree ("supplier_return_id");--> statement-breakpoint
CREATE INDEX "supplier_return_lines_component_id_idx" ON "supplier_return_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "supplier_return_lines_location_id_idx" ON "supplier_return_lines" USING btree ("location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_returns_number_unique" ON "supplier_returns" USING btree ("return_number");--> statement-breakpoint
CREATE INDEX "supplier_returns_supplier_id_idx" ON "supplier_returns" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_returns_po_id_idx" ON "supplier_returns" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_invoice_lines_invoice_id_idx" ON "purchase_invoice_lines" USING btree ("purchase_invoice_id");--> statement-breakpoint
CREATE INDEX "purchase_invoice_lines_component_id_idx" ON "purchase_invoice_lines" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_invoices_number_unique" ON "purchase_invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "purchase_invoices_supplier_id_idx" ON "purchase_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_invoices_po_id_idx" ON "purchase_invoices" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "procurement_policies_type_idx" ON "procurement_policies" USING btree ("policy_type");--> statement-breakpoint
CREATE INDEX "procurement_policies_is_active_idx" ON "procurement_policies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "bill_of_material_lines_bom_id_idx" ON "bill_of_material_lines" USING btree ("bom_id");--> statement-breakpoint
CREATE INDEX "bill_of_material_lines_component_id_idx" ON "bill_of_material_lines" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "bill_of_materials_component_id_idx" ON "bill_of_materials" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "bill_of_materials_status_idx" ON "bill_of_materials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_order_operations_order_id_idx" ON "production_order_operations" USING btree ("production_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_number_unique" ON "production_orders" USING btree ("production_number");--> statement-breakpoint
CREATE INDEX "production_orders_bom_id_idx" ON "production_orders" USING btree ("bom_id");--> statement-breakpoint
CREATE INDEX "production_orders_component_id_idx" ON "production_orders" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "production_orders_location_id_idx" ON "production_orders" USING btree ("location_id");--> statement-breakpoint
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
CREATE INDEX "manufacturing_traceability_fgr_id_idx" ON "manufacturing_traceability" USING btree ("fgr_id");--> statement-breakpoint
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
CREATE INDEX "stock_adjustment_lines_adj_id_idx" ON "stock_adjustment_lines" USING btree ("stock_adjustment_id");--> statement-breakpoint
CREATE INDEX "stock_adjustment_lines_comp_id_idx" ON "stock_adjustment_lines" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_adjustments_number_unique" ON "stock_adjustments" USING btree ("adjustment_number");--> statement-breakpoint
CREATE INDEX "stock_adjustments_location_id_idx" ON "stock_adjustments" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "stock_adjustments_status_idx" ON "stock_adjustments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cycle_count_lines_count_id_idx" ON "cycle_count_lines" USING btree ("cycle_count_id");--> statement-breakpoint
CREATE INDEX "cycle_count_lines_component_id_idx" ON "cycle_count_lines" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cycle_counts_number_unique" ON "cycle_counts" USING btree ("count_number");--> statement-breakpoint
CREATE INDEX "cycle_counts_location_id_idx" ON "cycle_counts" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "cycle_counts_status_idx" ON "cycle_counts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "warehouse_transfer_lines_transfer_id_idx" ON "warehouse_transfer_lines" USING btree ("transfer_id");--> statement-breakpoint
CREATE INDEX "warehouse_transfer_lines_component_id_idx" ON "warehouse_transfer_lines" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_transfers_number_unique" ON "warehouse_transfers" USING btree ("transfer_number");--> statement-breakpoint
CREATE INDEX "warehouse_transfers_source_loc_idx" ON "warehouse_transfers" USING btree ("source_location_id");--> statement-breakpoint
CREATE INDEX "warehouse_transfers_dest_loc_idx" ON "warehouse_transfers" USING btree ("destination_location_id");--> statement-breakpoint
CREATE INDEX "warehouse_transfers_status_idx" ON "warehouse_transfers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_policies_warehouse_id_unique" ON "warehouse_policies" USING btree ("warehouse_id");--> statement-breakpoint
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
CREATE INDEX "customer_returns_status_idx" ON "customer_returns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "accounts_account_type_idx" ON "accounts" USING btree ("account_type");--> statement-breakpoint
CREATE INDEX "accounts_is_active_idx" ON "accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "journal_entries_status_idx" ON "journal_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_entry_id_idx" ON "journal_entry_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_account_id_idx" ON "journal_entry_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "receivable_invoices_customer_id_idx" ON "receivable_invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "receivable_invoices_order_id_idx" ON "receivable_invoices" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "receivable_invoices_status_idx" ON "receivable_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "receivable_payments_invoice_id_idx" ON "receivable_payments" USING btree ("receivable_invoice_id");--> statement-breakpoint
CREATE INDEX "payable_invoices_supplier_id_idx" ON "payable_invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "payable_invoices_purchase_inv_id_idx" ON "payable_invoices" USING btree ("purchase_invoice_id");--> statement-breakpoint
CREATE INDEX "payable_invoices_status_idx" ON "payable_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payable_payments_invoice_id_idx" ON "payable_payments" USING btree ("payable_invoice_id");--> statement-breakpoint
CREATE INDEX "payments_payment_type_idx" ON "payments" USING btree ("payment_type");--> statement-breakpoint
CREATE INDEX "payments_bank_account_id_idx" ON "payments" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bank_accounts_bank_name_idx" ON "bank_accounts" USING btree ("bank_name");--> statement-breakpoint
CREATE INDEX "bank_accounts_is_active_idx" ON "bank_accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "bank_reconciliations_account_id_idx" ON "bank_reconciliations" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "bank_reconciliations_status_idx" ON "bank_reconciliations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bank_tx_recon_id_idx" ON "bank_transactions" USING btree ("bank_reconciliation_id");--> statement-breakpoint
CREATE INDEX "bank_tx_matched_payment_id_idx" ON "bank_transactions" USING btree ("matched_payment_id");--> statement-breakpoint
CREATE INDEX "crm_leads_status_idx" ON "crm_leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_leads_owner_idx" ON "crm_leads" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "crm_leads_source_idx" ON "crm_leads" USING btree ("source");--> statement-breakpoint
CREATE INDEX "crm_accounts_company_name_idx" ON "crm_accounts" USING btree ("company_name");--> statement-breakpoint
CREATE INDEX "crm_accounts_is_archived_idx" ON "crm_accounts" USING btree ("is_archived");--> statement-breakpoint
CREATE INDEX "crm_contacts_account_id_idx" ON "crm_contacts" USING btree ("crm_account_id");--> statement-breakpoint
CREATE INDEX "crm_contacts_email_idx" ON "crm_contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "crm_opportunities_account_id_idx" ON "crm_opportunities" USING btree ("crm_account_id");--> statement-breakpoint
CREATE INDEX "crm_opportunities_stage_idx" ON "crm_opportunities" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "crm_opportunities_lead_id_idx" ON "crm_opportunities" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "crm_activities_type_idx" ON "crm_activities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "crm_activities_status_idx" ON "crm_activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_activities_owner_idx" ON "crm_activities" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "crm_activities_lead_id_idx" ON "crm_activities" USING btree ("related_lead_id");--> statement-breakpoint
CREATE INDEX "crm_activities_account_id_idx" ON "crm_activities" USING btree ("related_account_id");--> statement-breakpoint
CREATE INDEX "crm_activities_opp_id_idx" ON "crm_activities" USING btree ("related_opportunity_id");--> statement-breakpoint
CREATE INDEX "crm_notes_lead_id_idx" ON "crm_notes" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "crm_notes_account_id_idx" ON "crm_notes" USING btree ("crm_account_id");--> statement-breakpoint
CREATE INDEX "crm_notes_opp_id_idx" ON "crm_notes" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "crm_notes_activity_id_idx" ON "crm_notes" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "project_activities_project_id_idx" ON "project_activities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_activities_type_idx" ON "project_activities" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "project_materials_project_id_idx" ON "project_materials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_materials_component_id_idx" ON "project_materials" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "project_materials_location_id_idx" ON "project_materials" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "project_milestones_project_id_idx" ON "project_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_milestones_status_idx" ON "project_milestones" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_tasks_project_id_idx" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_tasks_assigned_user_idx" ON "project_tasks" USING btree ("assigned_user");--> statement-breakpoint
CREATE INDEX "project_tasks_status_idx" ON "project_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_customer_id_idx" ON "projects" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "projects_sales_order_id_idx" ON "projects" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_type_idx" ON "projects" USING btree ("project_type");--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "projects_manager_idx" ON "projects" USING btree ("project_manager");--> statement-breakpoint
CREATE INDEX "task_assignments_task_id_idx" ON "task_assignments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_assignments_user_id_idx" ON "task_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_entries_user_id_idx" ON "time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_entries_task_id_idx" ON "time_entries" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "time_entries_date_idx" ON "time_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "time_entries_status_idx" ON "time_entries" USING btree ("status");--> statement-breakpoint
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
CREATE INDEX "warranty_claims_decision_idx" ON "warranty_claims" USING btree ("decision");--> statement-breakpoint
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
CREATE INDEX "purchase_recommendations_status_idx" ON "purchase_recommendations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_unique" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_unique" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "roles_is_system_idx" ON "roles" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "security_audit_logs_user_id_idx" ON "security_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_audit_logs_action_idx" ON "security_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "security_audit_logs_category_idx" ON "security_audit_logs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "security_audit_logs_created_at_idx" ON "security_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_invitations_token_unique" ON "user_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "user_invitations_email_idx" ON "user_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_invitations_status_idx" ON "user_invitations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_unique" ON "user_sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_sessions_is_revoked_idx" ON "user_sessions" USING btree ("is_revoked");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_id_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "activity_events_module_idx" ON "activity_events" USING btree ("module");--> statement-breakpoint
CREATE INDEX "activity_events_entity_type_idx" ON "activity_events" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "activity_events_entity_id_idx" ON "activity_events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "activity_events_user_id_idx" ON "activity_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_events_event_type_idx" ON "activity_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "activity_events_created_at_idx" ON "activity_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "import_export_jobs_user_id_idx" ON "import_export_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "import_export_jobs_entity_type_idx" ON "import_export_jobs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "import_export_jobs_job_type_idx" ON "import_export_jobs" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "import_export_jobs_status_idx" ON "import_export_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "document_versions_document_id_idx" ON "document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_versions_version_number_idx" ON "document_versions" USING btree ("version_number");--> statement-breakpoint
CREATE INDEX "documents_entity_type_entity_id_idx" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "documents_uploaded_by_id_idx" ON "documents" USING btree ("uploaded_by_id");--> statement-breakpoint
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notifications_module_idx" ON "notifications" USING btree ("module");--> statement-breakpoint
CREATE INDEX "workflow_executions_workflow_id_idx" ON "workflow_executions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflows_trigger_type_idx" ON "workflows" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "workflows_is_active_idx" ON "workflows" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "feature_flags_key_idx" ON "feature_flags" USING btree ("key");--> statement-breakpoint
CREATE INDEX "numbering_series_entity_type_idx" ON "numbering_series" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "user_dashboard_layouts_user_id_idx" ON "user_dashboard_layouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_favorites_user_id_idx" ON "user_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_saved_views_user_id_idx" ON "user_saved_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_saved_views_module_idx" ON "user_saved_views" USING btree ("module");--> statement-breakpoint
CREATE INDEX "user_workspace_preferences_user_id_idx" ON "user_workspace_preferences" USING btree ("user_id");