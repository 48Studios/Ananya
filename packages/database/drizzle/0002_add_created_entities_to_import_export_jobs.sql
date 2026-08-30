ALTER TABLE "import_export_jobs" ADD COLUMN IF NOT EXISTS "created_entities" jsonb DEFAULT '[]'::jsonb;
