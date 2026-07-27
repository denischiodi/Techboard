ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "templateVersion" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "occurrenceKey" varchar(512) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN IF NOT EXISTS "templateVersion" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN IF NOT EXISTS "occurrenceKey" varchar(512) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "templateId" varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "templateVersion" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "occurrenceKey" varchar(512) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "source" varchar(32) NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "workflow_test_cases" ADD COLUMN IF NOT EXISTS "templateId" varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "workflow_test_cases" ADD COLUMN IF NOT EXISTS "templateVersion" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "workflow_test_cases" ADD COLUMN IF NOT EXISTS "occurrenceKey" varchar(512) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "workflow_test_cases" ADD COLUMN IF NOT EXISTS "source" varchar(32) NOT NULL DEFAULT 'manual';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshops_project_occurrence_idx" ON "workshops" ("projectId","occurrenceKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bdcq_questions_project_occurrence_idx" ON "bdcq_questions" ("projectId","occurrenceKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "configurations_project_occurrence_idx" ON "configurations" ("projectId","occurrenceKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gaps_project_occurrence_idx" ON "gaps" ("projectId","occurrenceKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_test_cases_project_occurrence_idx" ON "workflow_test_cases" ("projectId","occurrenceKey");
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "templateVersion" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "occurrenceKey" varchar(512) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "source" varchar(32) NOT NULL DEFAULT 'manual';--> statement-breakpoint
