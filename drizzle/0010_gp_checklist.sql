-- Trilha do GP baseada no SAP Activate para landscape de três sistemas.
CREATE TABLE IF NOT EXISTS "gp_checklist_items" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "templateVersion" text NOT NULL,
  "itemKey" text NOT NULL,
  "phase" text NOT NULL,
  "workstream" text NOT NULL,
  "title" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "ownerRole" text DEFAULT '' NOT NULL,
  "itemType" text DEFAULT 'Atividade' NOT NULL,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'Pendente' NOT NULL,
  "responsible" text DEFAULT '' NOT NULL,
  "dueDate" varchar(10) DEFAULT '' NOT NULL,
  "evidenceUrl" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "blockingReason" text DEFAULT '' NOT NULL,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "gp_checklist_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "gp_checklist_project_template_item_unique" UNIQUE ("projectId", "templateVersion", "itemKey"),
  CONSTRAINT "gp_checklist_item_type_check" CHECK ("itemType" IN ('Atividade', 'Quality Gate')),
  CONSTRAINT "gp_checklist_status_check" CHECK ("status" IN ('Pendente', 'Em andamento', 'Concluído', 'Bloqueado', 'Não aplicável')),
  CONSTRAINT "gp_checklist_due_date_check" CHECK ("dueDate" = '' OR "dueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gp_checklist_project_idx" ON "gp_checklist_items" ("projectId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gp_checklist_phase_idx" ON "gp_checklist_items" ("projectId", "phase");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gp_fit_to_standard_cycles" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "name" text NOT NULL,
  "module" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'Pendente' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "gp_fit_cycle_project_fk" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "gp_fit_cycle_status_check" CHECK ("status" IN ('Pendente', 'Em andamento', 'Concluído', 'Bloqueado', 'Não aplicável'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gp_fit_cycle_project_idx" ON "gp_fit_to_standard_cycles" ("projectId");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gp_fit_to_standard_steps" (
  "id" varchar(64) PRIMARY KEY,
  "cycleId" varchar(64) NOT NULL,
  "stepKey" text NOT NULL,
  "stepNumber" integer NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'Pendente' NOT NULL,
  "responsible" text DEFAULT '' NOT NULL,
  "dueDate" varchar(10) DEFAULT '' NOT NULL,
  "evidenceUrl" text DEFAULT '' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  "blockingReason" text DEFAULT '' NOT NULL,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "gp_fit_step_cycle_fk" FOREIGN KEY ("cycleId") REFERENCES "gp_fit_to_standard_cycles"("id") ON DELETE CASCADE,
  CONSTRAINT "gp_fit_step_cycle_key_unique" UNIQUE ("cycleId", "stepKey"),
  CONSTRAINT "gp_fit_step_status_check" CHECK ("status" IN ('Pendente', 'Em andamento', 'Concluído', 'Bloqueado', 'Não aplicável')),
  CONSTRAINT "gp_fit_step_due_date_check" CHECK ("dueDate" = '' OR "dueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gp_fit_step_cycle_idx" ON "gp_fit_to_standard_steps" ("cycleId");
