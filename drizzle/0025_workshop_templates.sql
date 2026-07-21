CREATE TABLE IF NOT EXISTS "workflow_workshop_templates" (
  "id" varchar(64) PRIMARY KEY,
  "title" varchar(512) NOT NULL,
  "objective" text,
  "content" text,
  "duration" varchar(64) DEFAULT '' NOT NULL,
  "modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "projectIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scopeItemKeys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "agenda" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expectedOutcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "requiredRoles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "presentationFiles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "createdBy" varchar(255) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "workflow_workshop_templates_active_idx" ON "workflow_workshop_templates" ("active");--> statement-breakpoint

ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "modules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "scopeItemIds" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "objective" text;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "content" text;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "expectedOutcomes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "prerequisites" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "requiredRoles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "presentationFiles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "templateId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "source" varchar(32) DEFAULT 'manual' NOT NULL;--> statement-breakpoint

UPDATE "workshops" SET "modules" = jsonb_build_array("module") WHERE "module" <> '' AND "modules" = '[]'::jsonb;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshops_project_template_idx" ON "workshops" ("projectId", "templateId");
