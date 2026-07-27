ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "questionOriginal" text;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "sapId" varchar(64) DEFAULT '' NOT NULL;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "level" varchar(16) DEFAULT 'L3' NOT NULL;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "process" varchar(256) DEFAULT '' NOT NULL;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "sscuiReference" text;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "area" varchar(256) DEFAULT '' NOT NULL;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "topic" varchar(256) DEFAULT '' NOT NULL;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "topicDefinition" text;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "solution" text;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "source" varchar(64) DEFAULT 'Personalizado' NOT NULL;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "sourceFile" varchar(512) DEFAULT '' NOT NULL;
ALTER TABLE "workflow_bdcq_templates" ADD COLUMN IF NOT EXISTS "sourceRelease" varchar(64) DEFAULT '' NOT NULL;

-- O catálogo anterior era uma amostra manual. A partir desta versão, o catálogo
-- oficial SAP é servido pelo pacote versionado e os registros personalizados
-- começam limpos para evitar perguntas antigas ou duplicadas.
DELETE FROM "workflow_bdcq_templates";
