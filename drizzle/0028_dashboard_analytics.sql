CREATE TABLE IF NOT EXISTS "dashboard_snapshots" (
  "snapshotDate" varchar(10) NOT NULL,
  "module" varchar(32) NOT NULL,
  "metricId" varchar(128) NOT NULL,
  "dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "value" numeric NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "dashboard_snapshots_unique" UNIQUE ("snapshotDate", "module", "metricId", "dimensions")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_snapshots_history_idx" ON "dashboard_snapshots" ("module", "metricId", "snapshotDate");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dashboard_audit_log" (
  "id" varchar(64) PRIMARY KEY,
  "userId" varchar(128) NOT NULL,
  "userName" varchar(255) DEFAULT '' NOT NULL,
  "module" varchar(32) NOT NULL,
  "action" varchar(128) NOT NULL,
  "entityType" varchar(128) NOT NULL,
  "entityId" varchar(64) NOT NULL,
  "before" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "after" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_audit_log_entity_idx" ON "dashboard_audit_log" ("entityType", "entityId", "createdAt");
