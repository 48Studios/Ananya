ALTER TABLE "documents" ALTER COLUMN "file_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "file_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "mime_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "size_bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "document_type" varchar(50);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_type" varchar(20) DEFAULT 'UPLOADED_FILE' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "external_url" text;--> statement-breakpoint
CREATE INDEX "documents_document_type_idx" ON "documents" USING btree ("document_type");