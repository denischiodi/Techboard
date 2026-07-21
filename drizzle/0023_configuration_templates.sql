CREATE TABLE IF NOT EXISTS "workflow_configuration_templates" (
  "id" varchar(64) PRIMARY KEY,
  "description" text NOT NULL,
  "category" varchar(256) DEFAULT 'Configuração' NOT NULL,
  "modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scopeItemKeys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "createdBy" varchar(255) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "workflow_configuration_templates_active_idx"
  ON "workflow_configuration_templates" ("active");--> statement-breakpoint

ALTER TABLE "configurations" ADD COLUMN IF NOT EXISTS "templateId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN IF NOT EXISTS "bdcqQuestionId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN IF NOT EXISTS "scopeItemIds" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN IF NOT EXISTS "source" varchar(32) DEFAULT 'manual' NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "configurations_project_template_idx" ON "configurations" ("projectId", "templateId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "configurations_project_bdcq_idx" ON "configurations" ("projectId", "bdcqQuestionId");
