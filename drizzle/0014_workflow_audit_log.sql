CREATE TABLE IF NOT EXISTS "workflow_audit_log" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "userId" varchar(128) NOT NULL,
  "userName" varchar(255) DEFAULT '' NOT NULL,
  "action" varchar(128) NOT NULL,
  "entityType" varchar(128) NOT NULL,
  "entityId" varchar(64) NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workflow_audit_project_created_idx" ON "workflow_audit_log" ("projectId", "createdAt");
