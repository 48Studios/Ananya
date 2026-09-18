CREATE TABLE "ai_suggestion_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"component_id" uuid,
	"attribute_definition_id" uuid,
	"category_id" uuid,
	"creation_context" jsonb DEFAULT '{}'::jsonb,
	"suggestion_type" varchar(64) NOT NULL,
	"field" varchar(128) NOT NULL,
	"predicted_value" jsonb,
	"confidence" numeric(5, 4),
	"confidence_level" varchar(32) DEFAULT 'MEDIUM' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"model_version" varchar(64) DEFAULT '1.0.0' NOT NULL,
	"user_action" varchar(32) NOT NULL,
	"final_value" jsonb,
	"reviewer_id" uuid,
	"reviewer_email" varchar(255),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD COLUMN "aliases" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "attribute_definitions" ADD COLUMN "group_name" varchar(100);--> statement-breakpoint
ALTER TABLE "ai_suggestion_feedback" ADD CONSTRAINT "ai_suggestion_feedback_component_id_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion_feedback" ADD CONSTRAINT "ai_suggestion_feedback_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion_feedback" ADD CONSTRAINT "ai_suggestion_feedback_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestion_feedback" ADD CONSTRAINT "ai_suggestion_feedback_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_suggestion_feedback_component_id_idx" ON "ai_suggestion_feedback" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "ai_suggestion_feedback_attr_def_id_idx" ON "ai_suggestion_feedback" USING btree ("attribute_definition_id");--> statement-breakpoint
CREATE INDEX "ai_suggestion_feedback_category_id_idx" ON "ai_suggestion_feedback" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "ai_suggestion_feedback_suggestion_type_idx" ON "ai_suggestion_feedback" USING btree ("suggestion_type");--> statement-breakpoint
CREATE INDEX "ai_suggestion_feedback_field_idx" ON "ai_suggestion_feedback" USING btree ("field");--> statement-breakpoint
CREATE INDEX "ai_suggestion_feedback_user_action_idx" ON "ai_suggestion_feedback" USING btree ("user_action");--> statement-breakpoint
CREATE INDEX "ai_suggestion_feedback_model_version_idx" ON "ai_suggestion_feedback" USING btree ("model_version");--> statement-breakpoint
CREATE INDEX "ai_suggestion_feedback_created_at_idx" ON "ai_suggestion_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "attribute_definitions_group_name_idx" ON "attribute_definitions" USING btree ("group_name");