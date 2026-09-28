ALTER TABLE "organization_profile" ALTER COLUMN "company_name" SET DEFAULT 'ACME Corporation';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "legal_name" SET DEFAULT 'ACME Corporation';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "tax_id" SET DEFAULT 'EXAMPLE-TAX-ID';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "email" SET DEFAULT 'operations@example.com';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "phone" SET DEFAULT '+1 202-555-0100';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "website" SET DEFAULT 'https://example.com';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "address" SET DEFAULT '123 Example Street';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "city" SET DEFAULT 'Example City';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "state" SET DEFAULT 'Example Region';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "country" SET DEFAULT 'United States';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "postal_code" SET DEFAULT '00000';--> statement-breakpoint
ALTER TABLE "organization_profile" ALTER COLUMN "primary_timezone" SET DEFAULT 'Etc/UTC';