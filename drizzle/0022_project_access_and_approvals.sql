CREATE TABLE IF NOT EXISTS "project_memberships" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "appUserId" varchar(64) NOT NULL,
  "profile" varchar(32) DEFAULT 'reader' NOT NULL,
  "jobTitle" varchar(255) DEFAULT '' NOT NULL,
  "capabilityOverrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_memberships_project_user_unique" UNIQUE ("projectId", "appUserId")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_memberships_user_idx" ON "project_memberships" ("appUserId", "active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_memberships_project_idx" ON "project_memberships" ("projectId", "active");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_approval_policies" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "entityType" varchar(32) NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "quorum" varchar(16) DEFAULT 'any' NOT NULL,
  "minimumApprovals" integer DEFAULT 1 NOT NULL,
  "approverMembershipIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "project_approval_policies_type_unique" UNIQUE ("projectId", "entityType")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "approval_rounds" (
  "id" varchar(64) PRIMARY KEY,
  "projectId" varchar(64) NOT NULL,
  "entityType" varchar(32) NOT NULL,
  "entityId" varchar(64) NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "quorum" varchar(16) DEFAULT 'any' NOT NULL,
  "minimumApprovals" integer DEFAULT 1 NOT NULL,
  "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "requestedByUserId" varchar(64) NOT NULL,
  "requestedAt" timestamp DEFAULT now() NOT NULL,
  "completedAt" timestamp,
  "reopenedFromRoundId" varchar(64) DEFAULT '' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "approval_rounds_entity_version_unique" UNIQUE ("projectId", "entityType", "entityId", "version")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_rounds_entity_idx" ON "approval_rounds" ("projectId", "entityType", "entityId", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "approval_decisions" (
  "id" varchar(64) PRIMARY KEY,
  "roundId" varchar(64) NOT NULL,
  "approverMembershipId" varchar(64) NOT NULL,
  "decision" varchar(16) DEFAULT 'pending' NOT NULL,
  "comment" text,
  "decidedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "approval_decisions_round_approver_unique" UNIQUE ("roundId", "approverMembershipId")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_decisions_approver_idx" ON "approval_decisions" ("approverMembershipId", "decision");--> statement-breakpoint

-- Preserve the partial key-user implementation and link contacts that already have an app account.
INSERT INTO "project_memberships" ("id", "projectId", "appUserId", "profile", "jobTitle", "active")
SELECT 'pm_' || substr(md5(k."projectId" || ':' || lower(k."email")), 1, 20), k."projectId", u."id", 'key_user', k."role", (k."active" = 1)
FROM "workflow_project_key_users" k
JOIN "app_users" u ON lower(u."email") = lower(k."email")
ON CONFLICT ("projectId", "appUserId") DO NOTHING;
