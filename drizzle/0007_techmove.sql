CREATE TABLE IF NOT EXISTS "techmove_projects" (
  "projectId" text PRIMARY KEY,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
