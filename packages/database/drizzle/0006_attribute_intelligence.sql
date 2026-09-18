ALTER TABLE "attribute_definitions" ADD COLUMN IF NOT EXISTS "aliases" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "attribute_definitions" ADD COLUMN IF NOT EXISTS "group_name" varchar(100);
CREATE INDEX IF NOT EXISTS "attribute_definitions_group_name_idx" ON "attribute_definitions" USING btree ("group_name");

ALTER TABLE "ai_suggestion_feedback" ADD COLUMN IF NOT EXISTS "attribute_definition_id" uuid;
ALTER TABLE "ai_suggestion_feedback" ADD COLUMN IF NOT EXISTS "category_id" uuid;

DO $$ BEGIN
  ALTER TABLE "ai_suggestion_feedback" ADD CONSTRAINT "ai_suggestion_feedback_attribute_definition_id_attribute_definitions_id_fk" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."attribute_definitions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ai_suggestion_feedback" ADD CONSTRAINT "ai_suggestion_feedback_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "ai_suggestion_feedback_attr_def_id_idx" ON "ai_suggestion_feedback" USING btree ("attribute_definition_id");
CREATE INDEX IF NOT EXISTS "ai_suggestion_feedback_category_id_idx" ON "ai_suggestion_feedback" USING btree ("category_id");
