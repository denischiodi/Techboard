ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "ownerUserId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "activities" SET "ownerUserId" = "creatorUserId" WHERE "ownerUserId" = '';--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "visibility" varchar(16) DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "startDate" varchar(10) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "dueTime" varchar(5) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "timezone" varchar(64) DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "reminderMinutesBefore" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "reminderSentAt" timestamp;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "recurrence" varchar(16) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "recurrenceInterval" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "recurrenceParentId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "recurrenceSequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_visibility_check";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_visibility_check" CHECK ("visibility" IN ('shared', 'private'));--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_start_date_check";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_start_date_check" CHECK ("startDate" = '' OR "startDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_due_time_check";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_due_time_check" CHECK ("dueTime" = '' OR "dueTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_recurrence_check";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_recurrence_check" CHECK ("recurrence" IN ('none', 'daily', 'weekly', 'monthly'));--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_recurrence_interval_check";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_recurrence_interval_check" CHECK ("recurrenceInterval" BETWEEN 1 AND 365);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_owner_visibility_idx" ON "activities" ("ownerUserId", "visibility", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_reminder_idx" ON "activities" ("dueDate", "dueTime", "reminderSentAt") WHERE "reminderMinutesBefore" >= 0 AND "status" <> 'Concluída';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activities_recurrence_occurrence_unique" ON "activities" ("recurrenceParentId", "recurrenceSequence") WHERE "recurrenceParentId" <> '';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_labels" (
  "id" varchar(64) PRIMARY KEY,
  "scope" varchar(16) DEFAULT 'internal' NOT NULL,
  "projectId" varchar(64) DEFAULT '' NOT NULL,
  "name" varchar(80) NOT NULL,
  "color" varchar(16) NOT NULL,
  "createdByUserId" varchar(64) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "activity_labels_scope_check" CHECK ("scope" IN ('project', 'internal')),
  CONSTRAINT "activity_labels_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$')
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_labels_board_name_unique" ON "activity_labels" ("scope", "projectId", lower("name"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_labels_board_idx" ON "activity_labels" ("scope", "projectId", "name");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_label_assignments" (
  "activityId" varchar(64) NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "labelId" varchar(64) NOT NULL REFERENCES "activity_labels"("id") ON DELETE CASCADE,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("activityId", "labelId")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_label_assignments_label_idx" ON "activity_label_assignments" ("labelId", "activityId");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_user_planning" (
  "activityId" varchar(64) NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "userId" varchar(64) NOT NULL,
  "bucket" varchar(16) DEFAULT 'inbox' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("activityId", "userId"),
  CONSTRAINT "activity_user_planning_bucket_check" CHECK ("bucket" IN ('today', 'week', 'scheduled', 'inbox'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_user_planning_user_bucket_idx" ON "activity_user_planning" ("userId", "bucket", "position");
