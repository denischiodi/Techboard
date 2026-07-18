ALTER TABLE "workflow_prompts" ADD COLUMN IF NOT EXISTS "model" varchar(255) DEFAULT '' NOT NULL;
