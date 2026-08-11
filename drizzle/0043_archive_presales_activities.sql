INSERT INTO "activity_source_suppressions" (
  "id", "sourceType", "sourceKey", "activityId", "reason", "createdByUserId"
)
SELECT
  'asu_presales_' || substr(md5(a."id"), 1, 20),
  a."sourceType",
  a."sourceKey",
  a."id",
  'Arquivamento de atividades de pré-vendas',
  'maintenance_presales_20260811'
FROM "activities" a
INNER JOIN "projects" p ON p."id" = a."projectId"
WHERE upper(trim(p."name")) IN ('TECNOMYL', 'PLS', 'PRATT')
  AND a."archivedAt" IS NULL
  AND a."createdAt" <= timestamp with time zone '2026-08-11 14:53:20+00'
  AND a."sourceType" <> 'manual'
  AND a."sourceKey" <> ''
ON CONFLICT ("sourceType", "sourceKey") WHERE "restoredAt" IS NULL DO NOTHING;
--> statement-breakpoint
INSERT INTO "activity_history" (
  "id", "activityId", "actorUserId", "actorName", "action", "details"
)
SELECT
  'ahe_presales_' || substr(md5(a."id"), 1, 20),
  a."id",
  'maintenance_presales_20260811',
  'Administração TechBoard',
  'ADMIN_ARCHIVED',
  jsonb_build_object(
    'reason', 'Arquivamento de atividades de pré-vendas',
    'projectName', p."name",
    'sourceType', a."sourceType",
    'sourceKey', a."sourceKey"
  )
FROM "activities" a
INNER JOIN "projects" p ON p."id" = a."projectId"
WHERE upper(trim(p."name")) IN ('TECNOMYL', 'PLS', 'PRATT')
  AND a."archivedAt" IS NULL
  AND a."createdAt" <= timestamp with time zone '2026-08-11 14:53:20+00'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "activities" a
SET
  "archivedAt" = now(),
  "archivedByUserId" = 'maintenance_presales_20260811',
  "archiveReason" = 'Arquivamento de atividades de pré-vendas',
  "archiveSnapshot" = jsonb_build_object(
    'title', a."title",
    'description', coalesce(a."description", ''),
    'status', a."status",
    'priority', a."priority",
    'assigneeUserId', a."assigneeUserId",
    'dueDate', a."dueDate",
    'sourceResolved', a."sourceResolved"
  ),
  "updatedAt" = now()
FROM "projects" p
WHERE p."id" = a."projectId"
  AND upper(trim(p."name")) IN ('TECNOMYL', 'PLS', 'PRATT')
  AND a."archivedAt" IS NULL
  AND a."createdAt" <= timestamp with time zone '2026-08-11 14:53:20+00';
