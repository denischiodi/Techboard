ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "modules" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "abapHours" integer DEFAULT 0 NOT NULL;
ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "technicalHours" integer DEFAULT 0 NOT NULL;
ALTER TABLE "gaps" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb;
UPDATE "gaps" SET "modules" = jsonb_build_array("module") WHERE "module" <> '' AND ("modules" IS NULL OR "modules" = '[]'::jsonb);
