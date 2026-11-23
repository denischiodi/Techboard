CREATE TABLE IF NOT EXISTS "project_schedules" (
  "projectId" varchar(64) PRIMARY KEY REFERENCES "projects"("id") ON DELETE CASCADE,
  "snapshot" jsonb NOT NULL,
  "originalFile" bytea NOT NULL,
  "savedBy" varchar(64) NOT NULL,
  "savedAt" timestamptz NOT NULL DEFAULT now()
);
