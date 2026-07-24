ALTER TABLE "delivery_items" ADD COLUMN IF NOT EXISTS "occurrenceKey" varchar(512) DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "delivery_items"
SET "occurrenceKey" = "templateId" || '|' || COALESCE("module", '') || '|' ||
  COALESCE((SELECT string_agg(value, ',' ORDER BY value) FROM jsonb_array_elements_text("scopeItemIds")), '')
WHERE "templateId" <> '' AND "occurrenceKey" = '';--> statement-breakpoint
DROP INDEX IF EXISTS "delivery_items_project_template_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_items_project_template_occurrence_unique"
  ON "delivery_items" ("projectId", "templateId", "occurrenceKey")
  WHERE "templateId" <> '';--> statement-breakpoint

INSERT INTO "delivery_templates"
  ("id","type","title","description","phase","stage","modules","scopeItemKeys","required","ownerRole","active","createdBy")
SELECT 'dt_mig_' || md5("id"), 'bdcq', left("question", 512), "question", 'Explore', 'bdcq',
  COALESCE("modules",'[]'::jsonb), COALESCE("scopeItemKeys",'[]'::jsonb), COALESCE("required",false),
  'consultant', "active" <> 0, COALESCE("createdBy",'migration')
FROM "workflow_bdcq_templates"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "delivery_templates"
  ("id","type","title","description","phase","stage","modules","scopeItemKeys","required","ownerRole","active","createdBy")
SELECT 'dt_mig_' || md5("id"), 'configuration', left("description", 512), "description", 'Realize', 'configuration',
  COALESCE("modules",'[]'::jsonb), COALESCE("scopeItemKeys",'[]'::jsonb), true,
  'consultant', COALESCE("active",true), COALESCE("createdBy",'migration')
FROM "workflow_configuration_templates"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "delivery_templates"
  ("id","type","title","description","instructions","phase","stage","modules","scopeItemKeys","projectIds","required","ownerRole","payload","active","createdBy")
SELECT 'dt_mig_' || md5("id"), 'workshop', "title", COALESCE("objective",''), COALESCE("content",''),
  'Explore', 'workshops', COALESCE("modules",'[]'::jsonb), COALESCE("scopeItemKeys",'[]'::jsonb),
  COALESCE("projectIds",'[]'::jsonb), true, 'consultant',
  jsonb_build_object('objective',COALESCE("objective",''),'content',COALESCE("content",''),
    'duration',COALESCE("duration",''),'agenda',COALESCE("agenda",'[]'::jsonb),
    'expectedOutcomes',COALESCE("expectedOutcomes",'[]'::jsonb),
    'prerequisites',COALESCE("prerequisites",'[]'::jsonb),
    'requiredRoles',COALESCE("requiredRoles",'[]'::jsonb)),
  COALESCE("active",true), COALESCE("createdBy",'migration')
FROM "workflow_workshop_templates"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "delivery_templates"
  ("id","type","title","description","phase","stage","projectIds","required","ownerRole","dueOffsetDays","payload","active","createdBy")
SELECT 'dt_mig_' || md5("id"), 'activity', "title", COALESCE("description",''), COALESCE("gpPhase",'Prepare'),
  'preparation', CASE WHEN COALESCE("appliesToAllProjects",false) THEN '[]'::jsonb
    ELSE COALESCE((SELECT jsonb_agg("projectId") FROM "activity_template_projects" p WHERE p."templateId"=a."id"),'[]'::jsonb) END,
  COALESCE("required",true), COALESCE("ownerRole",'manager'), COALESCE("dueOffsetDays",0),
  jsonb_build_object('recurrence',COALESCE("recurrence",'none'),'weekday',COALESCE("weekday",1),'monthDay',COALESCE("monthDay",1)),
  COALESCE("active",true), COALESCE("createdByUserId",'migration')
FROM "activity_templates" a
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "delivery_template_versions" ("id","templateId","version","snapshot","changedBy")
SELECT 'dtv_mig_' || md5(t."id"), t."id", 1, to_jsonb(t), t."createdBy"
FROM "delivery_templates" t
WHERE t."id" LIKE 'dt_mig_%'
ON CONFLICT ("templateId","version") DO NOTHING;
