-- Modelo Word opcional por atividade da Trilha do GP.
ALTER TABLE "gp_checklist_items" ADD COLUMN IF NOT EXISTS "documentTemplateFileName" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gp_checklist_items" ADD COLUMN IF NOT EXISTS "documentTemplateFileContentType" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gp_checklist_items" ADD COLUMN IF NOT EXISTS "documentTemplateFileUrl" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gp_fit_to_standard_steps" ADD COLUMN IF NOT EXISTS "documentTemplateFileName" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gp_fit_to_standard_steps" ADD COLUMN IF NOT EXISTS "documentTemplateFileContentType" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "gp_fit_to_standard_steps" ADD COLUMN IF NOT EXISTS "documentTemplateFileUrl" text DEFAULT '' NOT NULL;
