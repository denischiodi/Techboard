import pg from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL não configurada para a migração");
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(
    `ALTER TABLE "workshops"
     ADD COLUMN IF NOT EXISTS "participantEmails" jsonb DEFAULT '[]'::jsonb`
  );
  console.log("Migração de e-mails dos participantes aplicada.");
} finally {
  await client.end();
}
