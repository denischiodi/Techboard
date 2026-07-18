ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "seriesId" varchar(64) DEFAULT '' NOT NULL;
ALTER TABLE "dcd_documents" ADD COLUMN IF NOT EXISTS "sourceHash" varchar(64) DEFAULT '' NOT NULL;
UPDATE "dcd_documents" SET "seriesId" = "id" WHERE "seriesId" = '';
CREATE INDEX IF NOT EXISTS "dcd_documents_series_version_idx" ON "dcd_documents" ("seriesId", "version");
CREATE INDEX IF NOT EXISTS "dcd_documents_source_hash_idx" ON "dcd_documents" ("projectId", "sourceHash");
