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
CREATE INDEX "crm_notes_activity_id_idx" ON "crm_notes" USING btree ("activity_id");