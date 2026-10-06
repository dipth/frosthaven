CREATE TABLE "tile_overrides" (
	"name" text PRIMARY KEY NOT NULL,
	"override" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tile_overrides" ADD CONSTRAINT "tile_overrides_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;