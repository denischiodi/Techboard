CREATE SEQUENCE IF NOT EXISTS "delivery_card_global_seq" START 1;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_templates" (
  "id" varchar(64) PRIMARY KEY,
  "type" varchar(32) NOT NULL,
  "title" varchar(512) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "phase" varchar(32) DEFAULT 'Prepare' NOT NULL,
  "stage" varchar(64) DEFAULT 'governance' NOT NULL,
  "modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scopeItemKeys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "projectIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required" boolean DEFAULT true NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "dependencyTemplateIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ownerRole" varchar(64) DEFAULT 'consultant' NOT NULL,
  "dueOffsetDays" integer DEFAULT 0 NOT NULL,
  "evidenceRequirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "approvalPolicy" jsonb DEFAULT '{"mode":"none","minimumApprovals":1}'::jsonb NOT NULL,
  "completionCriteria" text DEFAULT '' NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "effectiveFrom" varchar(10) DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "archivedAt" timestamp,
  "archivedBy" varchar(64) DEFAULT '' NOT NULL,
  "createdBy" varchar(64) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_templates_type_active_idx" ON "delivery_templates" ("type", "active", "archivedAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_template_versions" (
  "id" varchar(64) PRIMARY KEY,
  "templateId" varchar(64) NOT NULL REFERENCES "delivery_templates"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "changedBy" varchar(64) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "delivery_template_versions_unique" UNIQUE ("templateId", "version")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_items" (
  "id" varchar(64) PRIMARY KEY,
  "code" varchar(32) NOT NULL UNIQUE,
  "sequenceNumber" bigint NOT NULL UNIQUE,
  "projectId" varchar(64) NOT NULL,
  "templateId" varchar(64) DEFAULT '' NOT NULL,
  "templateVersion" integer DEFAULT 1 NOT NULL,
  "type" varchar(32) NOT NULL,
  "title" varchar(512) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "phase" varchar(32) DEFAULT 'Prepare' NOT NULL,
  "stage" varchar(64) NOT NULL,
  "module" varchar(128) DEFAULT '' NOT NULL,
  "scopeItemIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required" boolean DEFAULT true NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "dependencyItemIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ownerRole" varchar(64) DEFAULT 'consultant' NOT NULL,
  "responsibleId" varchar(64) DEFAULT '' NOT NULL,
  "dueDate" varchar(10) DEFAULT '' NOT NULL,
  "status" varchar(32) DEFAULT 'not_started' NOT NULL,
  "evidenceRequirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidences" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "approvalPolicy" jsonb DEFAULT '{"mode":"none","minimumApprovals":1}'::jsonb NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "customized" boolean DEFAULT false NOT NULL,
  "archivedAt" timestamp,
  "archivedBy" varchar(64) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_items_project_stage_idx" ON "delivery_items" ("projectId", "stage", "status", "archivedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_items_project_template_unique" ON "delivery_items" ("projectId", "templateId") WHERE "templateId" <> '';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_raid_items" (
  "id" varchar(64) PRIMARY KEY,
  "deliveryItemId" varchar(64) NOT NULL UNIQUE REFERENCES "delivery_items"("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL,
  "category" varchar(128) DEFAULT '' NOT NULL,
  "cause" text DEFAULT '' NOT NULL,
  "consequence" text DEFAULT '' NOT NULL,
  "probability" integer DEFAULT 1 NOT NULL,
  "impact" integer DEFAULT 1 NOT NULL,
  "severity" integer DEFAULT 1 NOT NULL,
  "strategy" varchar(32) DEFAULT '' NOT NULL,
  "responsePlan" text DEFAULT '' NOT NULL,
  "workaround" text DEFAULT '' NOT NULL,
  "rootCause" text DEFAULT '' NOT NULL,
  "sponsorId" varchar(64) DEFAULT '' NOT NULL,
  "nextAction" text DEFAULT '' NOT NULL,
  "reviewDate" varchar(10) DEFAULT '' NOT NULL,
  "escalated" boolean DEFAULT false NOT NULL,
  "acceptedReason" text DEFAULT '' NOT NULL,
  "materializedIssueId" varchar(64) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "delivery_raid_kind_check" CHECK ("kind" IN ('risk', 'issue')),
  CONSTRAINT "delivery_raid_score_check" CHECK ("probability" BETWEEN 1 AND 5 AND "impact" BETWEEN 1 AND 5)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_archive_batches" (
  "id" varchar(64) PRIMARY KEY,
  "reason" text NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdBy" varchar(64) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "restoredAt" timestamp,
  "restoredBy" varchar(64) DEFAULT '' NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_archive_records" (
  "id" varchar(64) PRIMARY KEY,
  "batchId" varchar(64) NOT NULL REFERENCES "delivery_archive_batches"("id") ON DELETE CASCADE,
  "tableName" varchar(128) NOT NULL,
  "recordId" varchar(64) NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_archive_records_batch_idx" ON "delivery_archive_records" ("batchId", "tableName");--> statement-breakpoint

ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "bdcq_answers" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "configurations" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_test_cases" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_configuration_templates" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "workflow_workshop_templates" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;
