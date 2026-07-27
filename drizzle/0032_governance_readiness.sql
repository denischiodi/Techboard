CREATE TABLE IF NOT EXISTS "project_governance_readiness" (
  "projectId" varchar(64) PRIMARY KEY,
  "confirmed" boolean NOT NULL DEFAULT false,
  "confirmedByUserId" varchar(64) NOT NULL DEFAULT '',
  "confirmedByName" varchar(255) NOT NULL DEFAULT '',
  "confirmedAt" timestamp,
  "reopenedByUserId" varchar(64) NOT NULL DEFAULT '',
  "reopenedByName" varchar(255) NOT NULL DEFAULT '',
  "reopenedAt" timestamp,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
