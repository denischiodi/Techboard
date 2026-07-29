ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "projectCode" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "clientManager" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "seidorExecutive" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "sponsor" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_cost_codes" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "code" varchar(128) NOT NULL,
  "description" varchar(512) DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "isPrimary" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_cost_codes_project_code_unique" UNIQUE ("projectId", "code")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_cost_codes_project_idx" ON "project_cost_codes" ("projectId", "active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_cost_codes_one_primary_idx" ON "project_cost_codes" ("projectId") WHERE "isPrimary" = true;--> statement-breakpoint

ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_minutes" ADD COLUMN IF NOT EXISTS "structuredContent" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_minutes" ADD COLUMN IF NOT EXISTS "docxUrl" varchar(1024) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_minutes" ADD COLUMN IF NOT EXISTS "pdfUrl" varchar(1024) DEFAULT '' NOT NULL;
