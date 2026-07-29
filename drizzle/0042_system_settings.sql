CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" varchar(128) PRIMARY KEY,
  "value" text NOT NULL,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
