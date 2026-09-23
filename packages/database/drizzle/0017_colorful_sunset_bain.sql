ALTER TABLE "units" ALTER COLUMN "conversion_factor" SET DATA TYPE numeric(28, 18);--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "conversion_offset" numeric(28, 18);