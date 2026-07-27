ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "consultantResourceId" varchar(64) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "responsible" varchar(255) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "learningKey" varchar(128) NOT NULL DEFAULT '';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workshops_project_learning_key_unique" ON "workshops" ("projectId","learningKey") WHERE "learningKey" <> '' AND "archivedAt" IS NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workshop_learning_patterns" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "workshopId" varchar(64) NOT NULL DEFAULT '',
  "learningKey" varchar(128) NOT NULL,
  "module" varchar(128) NOT NULL DEFAULT '',
  "phase" varchar(64) NOT NULL DEFAULT 'Explore',
  "stage" varchar(128) NOT NULL DEFAULT 'workshops',
  "scopeItemCodes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "title" varchar(512) NOT NULL,
  "objective" text,
  "content" text,
  "duration" varchar(64) NOT NULL DEFAULT '',
  "agenda" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "expectedOutcomes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "prerequisites" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "requiredRoles" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "decision" varchar(32) NOT NULL DEFAULT 'confirmed',
  "confidence" integer NOT NULL DEFAULT 50,
  "usageCount" integer NOT NULL DEFAULT 1,
  "createdBy" varchar(64) NOT NULL DEFAULT '',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workshop_learning_patterns_workshop_unique" ON "workshop_learning_patterns" ("workshopId") WHERE "workshopId" <> '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workshop_learning_patterns_module_idx" ON "workshop_learning_patterns" ("module","decision","confidence");
