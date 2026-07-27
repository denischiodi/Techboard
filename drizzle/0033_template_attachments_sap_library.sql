CREATE TABLE IF NOT EXISTS "delivery_template_attachments" (
  "id" varchar(64) PRIMARY KEY,
  "templateId" varchar(64) NOT NULL REFERENCES "delivery_templates"("id") ON DELETE CASCADE,
  "templateVersion" integer DEFAULT 1 NOT NULL,
  "fileName" varchar(255) NOT NULL,
  "contentType" varchar(255) NOT NULL,
  "sizeBytes" bigint NOT NULL,
  "checksum" varchar(64) NOT NULL,
  "storageKey" text NOT NULL,
  "url" text NOT NULL,
  "uploadedBy" varchar(64) NOT NULL,
  "archivedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_template_attachments_template_idx"
  ON "delivery_template_attachments" ("templateId", "templateVersion", "archivedAt");--> statement-breakpoint
INSERT INTO "delivery_template_attachments"
  ("id","templateId","templateVersion","fileName","contentType","sizeBytes","checksum","storageKey","url","uploadedBy")
SELECT 'dta_mig_' || md5(w."id" || ':' || file.ordinality::text),
  'dt_mig_' || md5(w."id"), 1,
  COALESCE(file.value->>'name','Anexo'),
  COALESCE(file.value->>'contentType','application/octet-stream'),
  0, md5(COALESCE(file.value->>'url','')),
  COALESCE(file.value->>'url',''), COALESCE(file.value->>'url',''),
  COALESCE(w."createdBy",'migration')
FROM "workflow_workshop_templates" w
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w."presentationFiles",'[]'::jsonb))
  WITH ORDINALITY AS file(value, ordinality)
WHERE COALESCE(file.value->>'url','') <> ''
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sap_content_releases" (
  "id" varchar(64) PRIMARY KEY,
  "releaseCode" varchar(64) NOT NULL UNIQUE,
  "country" varchar(8) DEFAULT 'BR' NOT NULL,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "fileName" varchar(255) NOT NULL,
  "storageKey" text NOT NULL,
  "checksum" varchar(64) NOT NULL UNIQUE,
  "sizeBytes" bigint NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "lastError" text DEFAULT '' NOT NULL,
  "uploadedBy" varchar(64) NOT NULL,
  "activatedBy" varchar(64) DEFAULT '' NOT NULL,
  "activatedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sap_scope_catalog" (
  "id" varchar(64) PRIMARY KEY,
  "releaseId" varchar(64) NOT NULL REFERENCES "sap_content_releases"("id") ON DELETE CASCADE,
  "code" varchar(128) NOT NULL,
  "name" varchar(512) NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "module" varchar(128) DEFAULT '' NOT NULL,
  "processArea" varchar(256) DEFAULT '' NOT NULL,
  "primaryLanguage" varchar(16) DEFAULT 'PT_BR' NOT NULL,
  "reviewStatus" varchar(32) DEFAULT 'review_required' NOT NULL,
  "searchText" text DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sap_scope_catalog_release_code_unique" UNIQUE ("releaseId", "code")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sap_scope_catalog_search_idx"
  ON "sap_scope_catalog" ("releaseId", "code", "module");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sap_scope_assets" (
  "id" varchar(64) PRIMARY KEY,
  "releaseId" varchar(64) NOT NULL REFERENCES "sap_content_releases"("id") ON DELETE CASCADE,
  "scopeId" varchar(64) REFERENCES "sap_scope_catalog"("id") ON DELETE CASCADE,
  "scopeCode" varchar(128) DEFAULT '' NOT NULL,
  "fileName" varchar(512) NOT NULL,
  "assetType" varchar(32) NOT NULL,
  "language" varchar(16) DEFAULT '' NOT NULL,
  "contentType" varchar(255) DEFAULT 'application/octet-stream' NOT NULL,
  "sizeBytes" bigint DEFAULT 0 NOT NULL,
  "checksum" varchar(64) NOT NULL,
  "storageKey" text NOT NULL,
  "url" text NOT NULL,
  "extractedText" text DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sap_scope_assets_release_checksum_unique" UNIQUE ("releaseId", "checksum")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sap_scope_assets_scope_idx"
  ON "sap_scope_assets" ("releaseId", "scopeCode", "language");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sap_knowledge_chunks" (
  "id" varchar(64) PRIMARY KEY,
  "releaseId" varchar(64) NOT NULL REFERENCES "sap_content_releases"("id") ON DELETE CASCADE,
  "scopeCode" varchar(128) NOT NULL,
  "assetId" varchar(64) NOT NULL REFERENCES "sap_scope_assets"("id") ON DELETE CASCADE,
  "chunkIndex" integer NOT NULL,
  "content" text NOT NULL,
  "language" varchar(16) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sap_knowledge_chunks_asset_index_unique" UNIQUE ("assetId", "chunkIndex")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sap_knowledge_chunks_scope_idx"
  ON "sap_knowledge_chunks" ("releaseId", "scopeCode");
