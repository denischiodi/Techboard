CREATE TABLE IF NOT EXISTS "workflow_test_steps" (
  "id" varchar(64) PRIMARY KEY,
  "testCaseId" varchar(64) NOT NULL REFERENCES "workflow_test_cases"("id") ON DELETE CASCADE,
  "position" integer DEFAULT 1 NOT NULL,
  "title" varchar(512) NOT NULL,
  "instruction" text,
  "expectedResult" text,
  "actualResult" text,
  "responsible" varchar(255) DEFAULT '' NOT NULL,
  "status" varchar(64) DEFAULT 'Não iniciado' NOT NULL,
  "evidences" jsonb DEFAULT '[]'::jsonb,
  "executedAt" varchar(10) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "workflow_test_steps_case_position_idx" ON "workflow_test_steps" ("testCaseId", "position");
