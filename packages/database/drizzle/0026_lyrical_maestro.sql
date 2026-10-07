ALTER TABLE "locations" ADD COLUMN "container_id" uuid;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_container_id_locations_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_container_id_idx" ON "locations" USING btree ("container_id");