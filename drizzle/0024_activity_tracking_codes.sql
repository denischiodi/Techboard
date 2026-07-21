ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "stage" varchar(16) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "sequenceNumber" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

UPDATE "activities"
SET "stage" = CASE
  WHEN "sourceType" IN ('bdcq_question', 'techmove_question') THEN 'BDCQ'
  WHEN "sourceType" = 'workflow_test' THEN 'TESTE'
  WHEN "sourceType" IN ('workflow_configuration', 'techmove_gap', 'techmove_configuration') THEN 'DCD'
  WHEN "sourceType" = 'approval' AND COALESCE("sourceUrl", '') LIKE '%/bdcq%' THEN 'BDCQ'
  WHEN "sourceType" = 'approval' AND COALESCE("sourceUrl", '') LIKE '%/tests%' THEN 'TESTE'
  WHEN "sourceType" = 'approval' AND COALESCE("sourceUrl", '') LIKE '%/dcd%' THEN 'DCD'
  ELSE 'GERAL'
END
WHERE "stage" = '';--> statement-breakpoint

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "scope", "projectId", "stage"
    ORDER BY "createdAt", "id"
  ) AS sequence_number
  FROM "activities"
)
UPDATE "activities" AS activity
SET "sequenceNumber" = ranked.sequence_number
FROM ranked
WHERE ranked."id" = activity."id" AND activity."sequenceNumber" = 0;--> statement-breakpoint

ALTER TABLE "activities" ALTER COLUMN "stage" SET DEFAULT 'GERAL';--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "sequenceNumber" SET DEFAULT 1;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "activity_sequence_counters" (
  "counterKey" varchar(160) PRIMARY KEY,
  "scope" varchar(16) NOT NULL,
  "projectId" varchar(64) DEFAULT '' NOT NULL,
  "stage" varchar(16) DEFAULT 'GERAL' NOT NULL,
  "lastNumber" integer DEFAULT 0 NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

INSERT INTO "activity_sequence_counters" ("counterKey", "scope", "projectId", "stage", "lastNumber")
SELECT "scope" || ':' || "projectId" || ':' || "stage", "scope", "projectId", "stage", MAX("sequenceNumber")
FROM "activities"
GROUP BY "scope", "projectId", "stage"
ON CONFLICT ("counterKey") DO UPDATE
SET "lastNumber" = GREATEST("activity_sequence_counters"."lastNumber", EXCLUDED."lastNumber"), "updatedAt" = now();--> statement-breakpoint

ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_stage_check";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_stage_check" CHECK ("stage" IN ('DCD', 'BDCQ', 'TESTE', 'GERAL'));--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_sequence_positive_check";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_sequence_positive_check" CHECK ("sequenceNumber" > 0);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activities_tracking_sequence_unique" ON "activities" ("scope", "projectId", "stage", "sequenceNumber");
