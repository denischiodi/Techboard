CREATE TABLE IF NOT EXISTS "scope_items" (
  "id" varchar(64) PRIMARY KEY, "projectId" varchar(64) NOT NULL, "module" varchar(128) NOT NULL,
  "code" varchar(128) DEFAULT '' NOT NULL, "name" varchar(512) NOT NULL, "processArea" varchar(256) DEFAULT '' NOT NULL,
  "description" text, "active" integer DEFAULT 1 NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "bdcq_questions" (
  "id" varchar(64) PRIMARY KEY, "projectId" varchar(64) NOT NULL, "module" varchar(128) NOT NULL,
  "category" varchar(256) DEFAULT '' NOT NULL, "question" text NOT NULL, "isDefault" integer DEFAULT 0 NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "bdcq_answers" (
  "id" varchar(64) PRIMARY KEY, "questionId" varchar(64) NOT NULL, "projectId" varchar(64) NOT NULL,
  "answer" text NOT NULL, "answeredBy" varchar(255) DEFAULT '' NOT NULL, "attachments" jsonb DEFAULT '[]'::jsonb,
  "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "bdcq_answer_history" (
  "id" varchar(64) PRIMARY KEY, "answerId" varchar(64) NOT NULL, "questionId" varchar(64) NOT NULL, "projectId" varchar(64) NOT NULL,
  "answer" text NOT NULL, "answeredBy" varchar(255) DEFAULT '' NOT NULL, "changedBy" varchar(255) DEFAULT '' NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "workshops" (
  "id" varchar(64) PRIMARY KEY, "projectId" varchar(64) NOT NULL, "title" varchar(512) NOT NULL,
  "module" varchar(128) DEFAULT '' NOT NULL, "scheduledDate" varchar(10) DEFAULT '' NOT NULL, "duration" varchar(64) DEFAULT '' NOT NULL,
  "participants" jsonb DEFAULT '[]'::jsonb, "agenda" jsonb DEFAULT '[]'::jsonb, "status" varchar(64) DEFAULT 'Planejado' NOT NULL,
  "notes" text, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "workshop_transcripts" (
  "id" varchar(64) PRIMARY KEY, "workshopId" varchar(64) NOT NULL, "content" text NOT NULL,
  "fileUrl" varchar(1024) DEFAULT '', "uploadedBy" varchar(255) DEFAULT '' NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "meeting_minutes" (
  "id" varchar(64) PRIMARY KEY, "workshopId" varchar(64) NOT NULL, "content" text NOT NULL,
  "generatedBy" varchar(64) DEFAULT 'ai' NOT NULL, "version" integer DEFAULT 1 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "client_requirements" (
  "id" varchar(64) PRIMARY KEY, "projectId" varchar(64) NOT NULL, "workshopId" varchar(64) NOT NULL, "code" varchar(128) DEFAULT '' NOT NULL,
  "title" varchar(512) NOT NULL, "description" text NOT NULL, "module" varchar(128) DEFAULT '' NOT NULL,
  "category" varchar(128) DEFAULT 'Funcional' NOT NULL, "priority" varchar(64) DEFAULT 'Média' NOT NULL,
  "status" varchar(64) DEFAULT 'Identificado' NOT NULL, "source" varchar(255) DEFAULT 'Cliente' NOT NULL,
  "acceptanceCriteria" text, "responsible" varchar(255) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "dcd_documents" (
  "id" varchar(64) PRIMARY KEY, "projectId" varchar(64) NOT NULL, "seriesId" varchar(64) DEFAULT '' NOT NULL, "sourceHash" varchar(64) DEFAULT '' NOT NULL, "module" varchar(128) DEFAULT '' NOT NULL,
  "title" varchar(512) NOT NULL, "content" text NOT NULL, "version" integer DEFAULT 1 NOT NULL,
  "status" varchar(64) DEFAULT 'Rascunho' NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "gaps" (
  "id" varchar(64) PRIMARY KEY, "projectId" varchar(64) NOT NULL, "dcdId" varchar(64) DEFAULT '' NOT NULL,
  "module" varchar(128) DEFAULT '' NOT NULL, "description" text NOT NULL, "impact" varchar(64) DEFAULT 'Médio' NOT NULL, "responsible" varchar(255) DEFAULT '' NOT NULL,
  "resolution" text, "status" varchar(64) DEFAULT 'Aberto' NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "configurations" (
  "id" varchar(64) PRIMARY KEY, "projectId" varchar(64) NOT NULL, "module" varchar(128) DEFAULT '' NOT NULL,
  "category" varchar(256) DEFAULT '' NOT NULL, "description" text NOT NULL, "responsible" varchar(255) DEFAULT '' NOT NULL,
  "status" varchar(64) DEFAULT 'Pendente' NOT NULL, "notes" text, "createdAt" timestamp DEFAULT now() NOT NULL, "updatedAt" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "workflow_audit_log" (
  "id" varchar(64) PRIMARY KEY, "projectId" varchar(64) NOT NULL, "userId" varchar(128) NOT NULL, "userName" varchar(255) DEFAULT '' NOT NULL,
  "action" varchar(128) NOT NULL, "entityType" varchar(128) NOT NULL, "entityId" varchar(64) NOT NULL, "details" jsonb DEFAULT '{}'::jsonb, "createdAt" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "scope_items_project_idx" ON "scope_items" ("projectId");
CREATE INDEX IF NOT EXISTS "bdcq_questions_project_idx" ON "bdcq_questions" ("projectId");
CREATE INDEX IF NOT EXISTS "bdcq_answers_project_question_idx" ON "bdcq_answers" ("projectId", "questionId");
CREATE INDEX IF NOT EXISTS "workshops_project_idx" ON "workshops" ("projectId");
CREATE INDEX IF NOT EXISTS "client_requirements_project_status_idx" ON "client_requirements" ("projectId", "status");
CREATE INDEX IF NOT EXISTS "client_requirements_workshop_idx" ON "client_requirements" ("workshopId");
CREATE INDEX IF NOT EXISTS "dcd_documents_project_idx" ON "dcd_documents" ("projectId");
CREATE INDEX IF NOT EXISTS "gaps_project_status_idx" ON "gaps" ("projectId", "status");
CREATE INDEX IF NOT EXISTS "configurations_project_status_idx" ON "configurations" ("projectId", "status");
