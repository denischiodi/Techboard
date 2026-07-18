CREATE TABLE IF NOT EXISTS "activities" (
  "id" varchar(64) PRIMARY KEY,
  "scope" varchar(16) DEFAULT 'project' NOT NULL,
  "projectId" varchar(64) DEFAULT '' NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "status" varchar(32) DEFAULT 'A fazer' NOT NULL,
  "priority" varchar(16) DEFAULT 'Média' NOT NULL,
  "assigneeUserId" varchar(64) DEFAULT '' NOT NULL,
  "creatorUserId" varchar(64) NOT NULL,
  "dueDate" varchar(10) DEFAULT '' NOT NULL,
  "sourceType" varchar(64) DEFAULT 'manual' NOT NULL,
  "sourceKey" varchar(255) DEFAULT '' NOT NULL,
  "sourceUrl" text DEFAULT '' NOT NULL,
  "sourceResolved" boolean DEFAULT false NOT NULL,
  "archivedAt" timestamp,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "activities_scope_check" CHECK ("scope" IN ('project', 'internal')),
  CONSTRAINT "activities_status_check" CHECK ("status" IN ('A fazer', 'Em andamento', 'Bloqueada', 'Em validação', 'Concluída')),
  CONSTRAINT "activities_priority_check" CHECK ("priority" IN ('Baixa', 'Média', 'Alta', 'Crítica')),
  CONSTRAINT "activities_due_date_check" CHECK ("dueDate" = '' OR "dueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activities_source_unique" ON "activities" ("sourceType", "sourceKey") WHERE "sourceKey" <> '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_project_status_idx" ON "activities" ("projectId", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_assignee_idx" ON "activities" ("assigneeUserId", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_due_date_idx" ON "activities" ("dueDate") WHERE "dueDate" <> '';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_participants" (
  "activityId" varchar(64) NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "userId" varchar(64) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  PRIMARY KEY ("activityId", "userId")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_participants_user_idx" ON "activity_participants" ("userId");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_checklist_items" (
  "id" varchar(64) PRIMARY KEY,
  "activityId" varchar(64) NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "assigneeUserId" varchar(64) DEFAULT '' NOT NULL,
  "dueDate" varchar(10) DEFAULT '' NOT NULL,
  "required" boolean DEFAULT true NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "createdByUserId" varchar(64) NOT NULL,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "activity_checklist_due_date_check" CHECK ("dueDate" = '' OR "dueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_checklist_activity_position_idx" ON "activity_checklist_items" ("activityId", "position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_checklist_assignee_idx" ON "activity_checklist_items" ("assigneeUserId", "completed");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_comments" (
  "id" varchar(64) PRIMARY KEY,
  "activityId" varchar(64) NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "authorUserId" varchar(64) NOT NULL,
  "content" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_comments_activity_idx" ON "activity_comments" ("activityId", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_attachments" (
  "id" varchar(64) PRIMARY KEY,
  "activityId" varchar(64) NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "fileName" text NOT NULL,
  "contentType" varchar(255) DEFAULT 'application/octet-stream' NOT NULL,
  "url" text NOT NULL,
  "uploadedByUserId" varchar(64) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_history" (
  "id" varchar(64) PRIMARY KEY,
  "activityId" varchar(64) NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "actorUserId" varchar(64) DEFAULT '' NOT NULL,
  "actorName" varchar(255) DEFAULT 'Sistema' NOT NULL,
  "action" varchar(128) NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_history_activity_idx" ON "activity_history" ("activityId", "createdAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_notifications" (
  "id" varchar(64) PRIMARY KEY,
  "userId" varchar(64) NOT NULL,
  "activityId" varchar(64) NOT NULL REFERENCES "activities"("id") ON DELETE CASCADE,
  "eventKey" varchar(255) NOT NULL,
  "eventType" varchar(64) NOT NULL,
  "title" text NOT NULL,
  "message" text DEFAULT '' NOT NULL,
  "readAt" timestamp,
  "emailStatus" varchar(16) DEFAULT 'pending' NOT NULL,
  "emailAttempts" integer DEFAULT 0 NOT NULL,
  "lastEmailError" text DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "activity_notification_event_user_unique" UNIQUE ("eventKey", "userId")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_notifications_user_unread_idx" ON "activity_notifications" ("userId", "readAt", "createdAt");--> statement-breakpoint

ALTER TABLE "gp_checklist_items" DROP CONSTRAINT IF EXISTS "gp_checklist_status_check";--> statement-breakpoint
ALTER TABLE "gp_checklist_items" ADD CONSTRAINT "gp_checklist_status_check" CHECK ("status" IN ('Pendente', 'Em andamento', 'Em validação', 'Concluído', 'Bloqueado', 'Não aplicável'));--> statement-breakpoint
ALTER TABLE "gp_fit_to_standard_cycles" DROP CONSTRAINT IF EXISTS "gp_fit_cycle_status_check";--> statement-breakpoint
ALTER TABLE "gp_fit_to_standard_cycles" ADD CONSTRAINT "gp_fit_cycle_status_check" CHECK ("status" IN ('Pendente', 'Em andamento', 'Em validação', 'Concluído', 'Bloqueado', 'Não aplicável'));--> statement-breakpoint
ALTER TABLE "gp_fit_to_standard_steps" DROP CONSTRAINT IF EXISTS "gp_fit_step_status_check";--> statement-breakpoint
ALTER TABLE "gp_fit_to_standard_steps" ADD CONSTRAINT "gp_fit_step_status_check" CHECK ("status" IN ('Pendente', 'Em andamento', 'Em validação', 'Concluído', 'Bloqueado', 'Não aplicável'));
