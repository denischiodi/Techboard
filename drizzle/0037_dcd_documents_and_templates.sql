CREATE TABLE IF NOT EXISTS "dcd_templates" (
  "id" varchar(64) PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "fileUrl" varchar(1024) NOT NULL DEFAULT '',
  "fileHash" varchar(64) NOT NULL DEFAULT '',
  "active" boolean NOT NULL DEFAULT false,
  "structure" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy" varchar(255) NOT NULL DEFAULT '',
  "publishedAt" timestamp,
  "archivedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "sourceSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "templateId" varchar(64) NOT NULL DEFAULT '';
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "templateVersion" integer NOT NULL DEFAULT 0;
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "docxUrl" varchar(1024) NOT NULL DEFAULT '';
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "pdfUrl" varchar(1024) NOT NULL DEFAULT '';
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "versionReason" varchar(64) NOT NULL DEFAULT 'generated';
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "restoredFromId" varchar(64) NOT NULL DEFAULT '';
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "createdBy" varchar(255) NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS "dcd_documents_series_version_idx" ON "dcd_documents" ("projectId", "seriesId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "dcd_templates_single_active_idx" ON "dcd_templates" ("active") WHERE "active" = true;
