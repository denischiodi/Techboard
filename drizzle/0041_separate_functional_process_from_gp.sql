UPDATE "delivery_templates"
SET
  "type"='functional_activity',
  "updatedAt"=now()
WHERE "id" LIKE 'fd-%'
  AND "type"='activity';--> statement-breakpoint

UPDATE "delivery_items"
SET
  "type"='functional_activity',
  "updatedAt"=now()
WHERE "templateId" LIKE 'fd-%'
  AND "type"='activity';--> statement-breakpoint

UPDATE "delivery_materializations"
SET
  "targetType"='delivery_item',
  "updatedAt"=now()
WHERE "templateId" LIKE 'fd-%';
