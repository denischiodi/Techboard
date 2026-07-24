ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "archivedByUserId" varchar(64) DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "archiveReason" text;
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "archiveSnapshot" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_source_suppressions" (
  "id" varchar(64) PRIMARY KEY,
  "sourceType" varchar(64) NOT NULL,
  "sourceKey" varchar(255) NOT NULL,
  "activityId" varchar(64) NOT NULL,
  "reason" text NOT NULL,
  "createdByUserId" varchar(64) NOT NULL,
  "restoredAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_source_suppressions_active_unique"
  ON "activity_source_suppressions" ("sourceType", "sourceKey")
  WHERE "restoredAt" IS NULL;
