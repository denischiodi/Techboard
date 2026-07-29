ALTER TABLE "gaps"
  ADD COLUMN IF NOT EXISTS "smdStatus" varchar(64) NOT NULL DEFAULT 'Não necessário',
  ADD COLUMN IF NOT EXISTS "smdVersion" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "smdUrl" text,
  ADD COLUMN IF NOT EXISTS "smdChangeRequest" varchar(128) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "smdNotes" text,
  ADD COLUMN IF NOT EXISTS "smdApprovedAt" varchar(10) NOT NULL DEFAULT '';--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "gaps_project_smd_status_idx"
  ON "gaps" ("projectId", "smdStatus")
  WHERE "archivedAt" IS NULL;
