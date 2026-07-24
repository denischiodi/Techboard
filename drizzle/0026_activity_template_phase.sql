ALTER TABLE "activity_templates"
  ADD COLUMN IF NOT EXISTS "gpPhase" varchar(32) DEFAULT 'Prepare' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_templates"
  ADD COLUMN IF NOT EXISTS "required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_templates" DROP CONSTRAINT IF EXISTS "activity_templates_gp_phase_check";--> statement-breakpoint
ALTER TABLE "activity_templates"
  ADD CONSTRAINT "activity_templates_gp_phase_check"
  CHECK ("gpPhase" IN ('Discover', 'Prepare', 'Explore', 'Realize', 'Deploy', 'Run'));
