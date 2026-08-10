-- TechMove unified project trail: configurable teams, roles and process models.
CREATE TABLE IF NOT EXISTS "delivery_teams" (
  "id" varchar(64) PRIMARY KEY,
  "name" varchar(255) NOT NULL UNIQUE,
  "description" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "createdBy" varchar(64) DEFAULT 'system' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_roles" (
  "id" varchar(64) PRIMARY KEY,
  "teamId" varchar(64) NOT NULL REFERENCES "delivery_teams"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "delivery_roles_team_name_unique" UNIQUE ("teamId", "name")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_team_members" (
  "id" varchar(64) PRIMARY KEY,
  "teamId" varchar(64) NOT NULL REFERENCES "delivery_teams"("id") ON DELETE CASCADE,
  "appUserId" varchar(64) NOT NULL,
  "roleId" varchar(64) NOT NULL REFERENCES "delivery_roles"("id") ON DELETE CASCADE,
  "active" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "delivery_team_member_unique" UNIQUE ("teamId", "appUserId", "roleId")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_delivery_members" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "teamId" varchar(64) NOT NULL REFERENCES "delivery_teams"("id") ON DELETE CASCADE,
  "appUserId" varchar(64) NOT NULL,
  "roleId" varchar(64) NOT NULL REFERENCES "delivery_roles"("id") ON DELETE CASCADE,
  "active" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_delivery_member_unique" UNIQUE ("projectId", "teamId", "appUserId", "roleId")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "process_models" (
  "id" varchar(64) PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "kind" varchar(32) DEFAULT 'complementary' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "createdBy" varchar(64) DEFAULT 'system' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "process_models_kind_check" CHECK ("kind" IN ('primary','complementary'))
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "process_model_versions" (
  "id" varchar(64) PRIMARY KEY,
  "modelId" varchar(64) NOT NULL REFERENCES "process_models"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "changedBy" varchar(64) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "process_model_version_unique" UNIQUE ("modelId", "version")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "process_model_templates" (
  "modelId" varchar(64) NOT NULL REFERENCES "process_models"("id") ON DELETE CASCADE,
  "templateId" varchar(64) NOT NULL REFERENCES "delivery_templates"("id") ON DELETE CASCADE,
  "position" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("modelId", "templateId")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_process_applications" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "modelId" varchar(64) NOT NULL REFERENCES "process_models"("id") ON DELETE CASCADE,
  "modelVersion" integer DEFAULT 1 NOT NULL,
  "kind" varchar(32) NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "appliedBy" varchar(64) DEFAULT '' NOT NULL,
  "appliedAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_process_application_unique" UNIQUE ("projectId", "modelId")
);--> statement-breakpoint

ALTER TABLE "delivery_templates" ADD COLUMN IF NOT EXISTS "criticality" varchar(32) DEFAULT 'required' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_templates" ADD COLUMN IF NOT EXISTS "teamId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD COLUMN IF NOT EXISTS "criticality" varchar(32) DEFAULT 'required' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD COLUMN IF NOT EXISTS "teamId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD COLUMN IF NOT EXISTS "exceptionReason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD COLUMN IF NOT EXISTS "exceptionBy" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_items" ADD COLUMN IF NOT EXISTS "exceptionAt" timestamp;--> statement-breakpoint

INSERT INTO "delivery_teams" ("id","name","description") VALUES
  ('team-directoria-delivery','Diretoria Delivery','Governança executiva e decisões do portfólio'),
  ('team-gerencia-projetos','Gerência de Projetos','Gestão e governança dos projetos'),
  ('team-lideranca-delivery','Liderança Delivery','Acompanhamento de frentes e entregas'),
  ('team-consultoria','Consultoria','Execução funcional e técnica')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "delivery_roles" ("id","teamId","name") VALUES
  ('role-delivery-director','team-directoria-delivery','Diretor(a) Delivery'),
  ('role-project-manager','team-gerencia-projetos','GP do projeto'),
  ('role-delivery-lead','team-lideranca-delivery','Líder Delivery'),
  ('role-consultant','team-consultoria','Consultor(a)')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "process_models" ("id","name","description","kind","phases") VALUES
  ('process-sap-implementation','Implementação SAP','Trilha SAP Activate completa','primary','["Discover","Prepare","Explore","Realize","Deploy","Run"]'::jsonb),
  ('process-delivery-governance','Governança da Diretoria Delivery','Marcos, decisões e Quality Gates executivos','complementary','["Discover","Prepare","Explore","Realize","Deploy","Run"]'::jsonb),
  ('process-cutover','Cutover','Planejamento e execução de cutover','complementary','["Realize","Deploy"]'::jsonb),
  ('process-hypercare','Hypercare','Estabilização e suporte pós-go-live','complementary','["Deploy","Run"]'::jsonb),
  ('process-ams','AMS','Operação e melhoria contínua','complementary','["Run"]'::jsonb)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "process_model_templates" ("modelId","templateId","position")
SELECT 'process-sap-implementation', "id", "sortOrder"
FROM "delivery_templates"
WHERE "payload"->>'standardProcess' = 'consultor_funcional_v1'
ON CONFLICT DO NOTHING;--> statement-breakpoint

INSERT INTO "process_model_templates" ("modelId","templateId","position")
SELECT 'process-delivery-governance', "id", "sortOrder" FROM "delivery_templates"
WHERE "ownerRole" IN ('manager','technical_lead','delivery_director') OR "payload"->>'workstream' IN ('Quality Gate','Go/No-Go','Governança','Planejamento')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "process_model_templates" ("modelId","templateId","position")
SELECT 'process-cutover', "id", "sortOrder" FROM "delivery_templates" WHERE "stage"='cutover'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "process_model_templates" ("modelId","templateId","position")
SELECT 'process-hypercare', "id", "sortOrder" FROM "delivery_templates" WHERE "payload"->>'workstream' IN ('Hypercare','Suporte')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "process_model_templates" ("modelId","templateId","position")
SELECT 'process-ams', "id", "sortOrder" FROM "delivery_templates" WHERE "phase"='Run'
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Permanently retire the former GP trail and every TechTask record generated by it.
DELETE FROM "activity_source_suppressions"
WHERE "sourceType" IN ('gp_checklist','gp_fit_step','techlead');--> statement-breakpoint
DELETE FROM "activities"
WHERE "sourceType" IN ('gp_checklist','gp_fit_step','techlead');--> statement-breakpoint
DELETE FROM "gp_fit_to_standard_steps";--> statement-breakpoint
DELETE FROM "gp_fit_to_standard_cycles";--> statement-breakpoint
DELETE FROM "gp_checklist_items";
