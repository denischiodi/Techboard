ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "consultantResourceId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "keyUserId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_project_key_users" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "name" varchar(255) NOT NULL,
  "email" varchar(320) DEFAULT '' NOT NULL,
  "role" varchar(255) DEFAULT '' NOT NULL,
  "active" integer DEFAULT 1 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_project_key_users_project_email_unique" UNIQUE ("projectId", "email")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bdcq_questions_consultant_idx" ON "bdcq_questions" ("projectId", "consultantResourceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bdcq_questions_key_user_idx" ON "bdcq_questions" ("projectId", "keyUserId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_project_key_users_project_idx" ON "workflow_project_key_users" ("projectId", "active", "name");
