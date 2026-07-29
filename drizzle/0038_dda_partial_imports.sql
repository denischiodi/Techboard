CREATE TABLE IF NOT EXISTS "dda_import_batches" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "fileName" varchar(512) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'processing',
  "total" integer NOT NULL DEFAULT 0,
  "created" integer NOT NULL DEFAULT 0,
  "updated" integer NOT NULL DEFAULT 0,
  "pending" integer NOT NULL DEFAULT 0,
  "importedBy" varchar(64) NOT NULL DEFAULT '',
  "completedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "dda_import_items" (
  "id" varchar(64) PRIMARY KEY,
  "batchId" varchar(64) NOT NULL,
  "projectId" varchar(64) NOT NULL,
  "code" varchar(128) NOT NULL DEFAULT '',
  "normalizedCode" varchar(128) NOT NULL DEFAULT '',
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "result" varchar(32) NOT NULL DEFAULT '',
  "errorCode" varchar(64) NOT NULL DEFAULT '',
  "errorMessage" text NOT NULL DEFAULT '',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "attempts" integer NOT NULL DEFAULT 0,
  "scopeItemId" varchar(64) NOT NULL DEFAULT '',
  "resolvedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dda_import_batches_project_idx"
  ON "dda_import_batches" ("projectId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "dda_import_items_batch_idx"
  ON "dda_import_items" ("batchId", "createdAt");
CREATE INDEX IF NOT EXISTS "dda_import_items_pending_code_idx"
  ON "dda_import_items" ("status", "normalizedCode")
  WHERE "status" = 'pending';
