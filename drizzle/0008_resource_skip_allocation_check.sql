ALTER TABLE "resources" ADD COLUMN IF NOT EXISTS "skipAllocationCheck" boolean DEFAULT false NOT NULL;
