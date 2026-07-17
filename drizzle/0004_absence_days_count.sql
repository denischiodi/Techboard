ALTER TABLE "absences" ADD COLUMN IF NOT EXISTS "daysCount" real;--> statement-breakpoint
INSERT INTO "lookups" ("id", "category", "value", "active")
SELECT 'lk-abs-dias-vendidos', 'absenceTypes', 'Dias vendidos', true
WHERE NOT EXISTS (
  SELECT 1 FROM "lookups"
  WHERE "category" = 'absenceTypes'
    AND lower("value") IN ('dias vendidos', 'dias vendido')
) ON CONFLICT ("id") DO NOTHING;
