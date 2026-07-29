ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "questionOriginal" text;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "sapId" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "level" varchar(16) DEFAULT 'L3' NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "process" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "sscuiReference" text;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "area" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "topic" varchar(256) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "topicDefinition" text;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "solution" text;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "sourceFile" varchar(512) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "sourceRelease" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "active" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "bdcq_questions" ADD COLUMN IF NOT EXISTS "metadataInitialized" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bdcq_questions_project_metadata_idx" ON "bdcq_questions" ("projectId", "active", "level", "module");
