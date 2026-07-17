ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "resourceId" varchar(64) DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "teamFronts" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_users_resource_idx" ON "app_users" ("resourceId");
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_team_fronts_array" CHECK (jsonb_typeof("teamFronts") = 'array') NOT VALID;
