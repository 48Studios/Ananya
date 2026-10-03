CREATE TABLE "inventory_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid NOT NULL,
	"alert_type" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"threshold_quantity" numeric(12, 4) NOT NULL,
	"on_hand_quantity" numeric(12, 4) NOT NULL,
	"available_quantity" numeric(12, 4) NOT NULL,
	"shortage_quantity" numeric(12, 4) NOT NULL,
	"first_triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_notified_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"notification_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"recipient_email" varchar(320) NOT NULL,
	"recipient_user_id" uuid,
	"subject" varchar(500) NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"status" varchar(16) DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" varchar(1000),
	"provider_message_id" varchar(255),
	"sent_at" timestamp with time zone,
	"source_type" varchar(64),
	"source_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"category" varchar(64) DEFAULT 'Inventory' NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"subject" varchar(255) NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_event_type_unique" UNIQUE("event_type")
);
--> statement-breakpoint
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_alerts_active_unique" ON "inventory_alerts" USING btree ("component_id","alert_type") WHERE "inventory_alerts"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "inventory_alerts_status_idx" ON "inventory_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inventory_alerts_component_id_idx" ON "inventory_alerts" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "inventory_alerts_type_idx" ON "inventory_alerts" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "email_outbox_status_idx" ON "email_outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_outbox_next_attempt_idx" ON "email_outbox" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "email_outbox_event_type_idx" ON "email_outbox" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "email_outbox_recipient_user_idx" ON "email_outbox" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "email_templates_category_idx" ON "email_templates" USING btree ("category");