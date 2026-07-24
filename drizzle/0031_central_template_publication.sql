CREATE TABLE IF NOT EXISTS "delivery_publication_jobs" (
  "id" varchar(64) PRIMARY KEY,
  "templateId" varchar(64) NOT NULL,
  "templateVersion" integer NOT NULL DEFAULT 1,
  "trigger" varchar(64) NOT NULL DEFAULT 'template_changed',
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastError" text NOT NULL DEFAULT '',
  "createdBy" varchar(64) NOT NULL DEFAULT '',
  "startedAt" timestamp,
  "finishedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_publication_jobs_status_idx"
  ON "delivery_publication_jobs" ("status", "createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_publication_jobs_template_idx"
  ON "delivery_publication_jobs" ("templateId", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_materializations" (
  "id" varchar(64) PRIMARY KEY,
  "templateId" varchar(64) NOT NULL,
  "templateVersion" integer NOT NULL DEFAULT 1,
  "projectId" varchar(64) NOT NULL,
  "occurrenceKey" varchar(512) NOT NULL,
  "targetType" varchar(64) NOT NULL,
  "targetId" varchar(64) NOT NULL DEFAULT '',
  "state" varchar(32) NOT NULL DEFAULT 'current',
  "reason" text NOT NULL DEFAULT '',
  "publishedAt" timestamp,
  "confirmedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_materializations_occurrence_unique"
  ON "delivery_materializations" ("templateId", "projectId", "occurrenceKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_materializations_project_state_idx"
  ON "delivery_materializations" ("projectId", "state", "targetType");--> statement-breakpoint
