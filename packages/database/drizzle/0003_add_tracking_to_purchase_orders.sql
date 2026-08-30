ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "tracking_number" varchar(128);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "carrier" varchar(64);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "shipping_provider" varchar(64);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "tracking_url" text;
