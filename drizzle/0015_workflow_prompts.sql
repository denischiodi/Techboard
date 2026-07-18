CREATE TABLE IF NOT EXISTS "workflow_prompts" (
  "key" varchar(128) PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "description" text,
  "systemPrompt" text NOT NULL,
  "model" varchar(255) DEFAULT '' NOT NULL,
  "updatedBy" varchar(255) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
