UPDATE "allocations" SET "phaseId" = NULL WHERE "phaseId" = '';--> statement-breakpoint
UPDATE "allocations" a SET "phaseId" = NULL WHERE a."phaseId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "phases" p WHERE p."id" = a."phaseId");--> statement-breakpoint
ALTER TABLE "allocations" ALTER COLUMN "phaseId" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "allocations" ALTER COLUMN "phaseId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_project_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_resource_fk" FOREIGN KEY ("resourceId") REFERENCES "public"."resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_resource_fk" FOREIGN KEY ("resourceId") REFERENCES "public"."resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_project_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_phase_fk" FOREIGN KEY ("phaseId") REFERENCES "public"."phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_daily_capacity_range" CHECK ("dailyCapacity" > 0 AND "dailyCapacity" <= 24) NOT VALID;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_vacation_days_range" CHECK ("vacationDaysEntitled" >= 0 AND "vacationDaysEntitled" <= 365) NOT VALID;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_dates_order" CHECK ("startDate" = '' OR "endDate" = '' OR "startDate" <= "endDate") NOT VALID;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_fronts_array" CHECK (jsonb_typeof("fronts") = 'array') NOT VALID;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_dates_order" CHECK ("startDate" <= "endDate") NOT VALID;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_fronts_array" CHECK (jsonb_typeof("fronts") = 'array') NOT VALID;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_dates_order" CHECK ("startDate" <= "endDate") NOT VALID;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_completion_percent_range" CHECK ("completionPercent" >= 0 AND "completionPercent" <= 100) NOT VALID;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_dates_order" CHECK ("startDate" <= "endDate") NOT VALID;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_dates_order" CHECK ("startDate" <= "endDate") NOT VALID;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_hours_per_day_range" CHECK ("hoursPerDay" > 0 AND "hoursPerDay" <= 24) NOT VALID;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "allocations_phase_idx" ON "allocations" ("phaseId");
