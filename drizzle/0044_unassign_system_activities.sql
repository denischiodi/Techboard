INSERT INTO "activity_history" (
  "id", "activityId", "actorUserId", "actorName", "action", "details"
)
SELECT
  'ahe_unassign_' || substr(md5(a."id"), 1, 20),
  a."id",
  'maintenance_unassign_system_20260811',
  'Administração TechBoard',
  'RESPONSIBLE_REMOVED',
  jsonb_build_object(
    'reason', 'Responsável removido de atividade criada pelo sistema',
    'previousAssigneeUserId', a."assigneeUserId",
    'sourceType', a."sourceType",
    'sourceKey', a."sourceKey"
  )
FROM "activities" a
WHERE a."sourceType" <> 'manual'
  AND coalesce(a."assigneeUserId", '') <> ''
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "activities"
SET
  "assigneeUserId" = '',
  "archiveSnapshot" = CASE
    WHEN "archiveSnapshot" ? 'assigneeUserId'
      THEN jsonb_set("archiveSnapshot", '{assigneeUserId}', '""'::jsonb)
    ELSE "archiveSnapshot"
  END,
  "updatedAt" = now()
WHERE "sourceType" <> 'manual'
  AND coalesce("assigneeUserId", '') <> '';
