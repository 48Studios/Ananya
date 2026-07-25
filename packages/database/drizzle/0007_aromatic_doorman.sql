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
CREATE INDEX "bank_tx_matched_payment_id_idx" ON "bank_transactions" USING btree ("matched_payment_id");