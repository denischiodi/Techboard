ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "templateId" varchar(64) DEFAULT '' NOT NULL;
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "scopeItemIds" jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "workflow_bdcq_templates" (
  "id" varchar(64) PRIMARY KEY,
  "question" text NOT NULL,
  "category" varchar(256) DEFAULT '' NOT NULL,
  "modules" jsonb DEFAULT '[]'::jsonb,
  "scopeItemKeys" jsonb DEFAULT '[]'::jsonb,
  "active" integer DEFAULT 1 NOT NULL,
  "createdBy" varchar(255) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workflow_bdcq_templates_active_idx" ON "workflow_bdcq_templates" ("active");
CREATE INDEX IF NOT EXISTS "bdcq_questions_project_template_idx" ON "bdcq_questions" ("projectId", "templateId");
