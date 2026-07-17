CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" varchar(320) DEFAULT '' NOT NULL,
	"profile" text NOT NULL,
	"front" text DEFAULT '' NOT NULL,
	"fronts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dailyCapacity" real DEFAULT 8 NOT NULL,
	"status" text DEFAULT 'Ativo' NOT NULL,
	"birthDate" varchar(10) DEFAULT '' NOT NULL,
	"startDate" varchar(10) DEFAULT '' NOT NULL,
	"endDate" varchar(10) DEFAULT '' NOT NULL,
	"contractType" text DEFAULT 'CLT' NOT NULL,
	"vacationDaysEntitled" integer DEFAULT 30 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"client" text NOT NULL,
	"manager" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Planejado' NOT NULL,
	"startDate" varchar(10) NOT NULL,
	"endDate" varchar(10) NOT NULL,
	"fronts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"projectId" varchar(64) NOT NULL,
	"phase" text NOT NULL,
	"startDate" varchar(10) NOT NULL,
	"endDate" varchar(10) NOT NULL,
	"responsible" text DEFAULT '' NOT NULL,
	"completionPercent" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Planejado' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "absences" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"resourceId" varchar(64) NOT NULL,
	"type" text NOT NULL,
	"startDate" varchar(10) NOT NULL,
	"endDate" varchar(10) NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"resourceId" varchar(64) NOT NULL,
	"projectId" varchar(64) NOT NULL,
	"phaseId" varchar(64) DEFAULT '' NOT NULL,
	"front" text NOT NULL,
	"startDate" varchar(10) NOT NULL,
	"endDate" varchar(10) NOT NULL,
	"hoursPerDay" real NOT NULL,
	"allocationType" text DEFAULT 'Projeto' NOT NULL,
	"status" text DEFAULT 'Planejado' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" varchar(320) NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"permissions" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "lookups" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "resources_status_idx" ON "resources" ("status");
--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" ("status");
--> statement-breakpoint
CREATE INDEX "phases_project_idx" ON "phases" ("projectId");
--> statement-breakpoint
CREATE INDEX "absences_resource_idx" ON "absences" ("resourceId");
--> statement-breakpoint
CREATE INDEX "allocations_resource_idx" ON "allocations" ("resourceId");
--> statement-breakpoint
CREATE INDEX "allocations_project_idx" ON "allocations" ("projectId");
--> statement-breakpoint
CREATE INDEX "lookups_category_idx" ON "lookups" ("category");
