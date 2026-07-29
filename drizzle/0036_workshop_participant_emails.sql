ALTER TABLE "workshops" ADD COLUMN IF NOT EXISTS "participantEmails" jsonb DEFAULT '[]'::jsonb;
