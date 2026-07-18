CREATE TABLE IF NOT EXISTS "workflow_test_cases" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "type" varchar(32) DEFAULT 'Unitário' NOT NULL,
  "code" varchar(128) DEFAULT '' NOT NULL,
  "title" varchar(512) NOT NULL,
  "description" text,
  "module" varchar(128) DEFAULT '' NOT NULL,
  "requirementId" varchar(64) DEFAULT '' NOT NULL,
  "scopeItemId" varchar(64) DEFAULT '' NOT NULL,
  "dcdId" varchar(64) DEFAULT '' NOT NULL,
  "preconditions" text,
  "steps" text,
  "expectedResult" text,
  "actualResult" text,
  "responsible" varchar(255) DEFAULT '' NOT NULL,
  "evidence" text,
  "status" varchar(64) DEFAULT 'Não iniciado' NOT NULL,
  "executedAt" varchar(10) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workflow_test_cases_project_type_status_idx" ON "workflow_test_cases" ("projectId", "type", "status");
