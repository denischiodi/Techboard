import pg from "pg";

export function requireSafeE2eDatabaseUrl() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) return null;

  const parsed = new URL(url);
  const databaseName = parsed.pathname.replace(/^\//, "").toLowerCase();
  const host = parsed.hostname.toLowerCase();
  const safeName = /(test|e2e|ci)/.test(databaseName);
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(host);

  if (!safeName && !localHost) {
    throw new Error(
      `E2E_DATABASE_URL recusada: o banco “${databaseName}” precisa conter test/e2e/ci ou estar em localhost.`,
    );
  }
  return url;
}

export async function verifyE2eDatabase() {
  const url = requireSafeE2eDatabaseUrl();
  if (!url) return { configured: false as const };
  const pool = new pg.Pool({ connectionString: url, ssl: false, max: 1 });
  try {
    const result = await pool.query<{ database: string }>(
      "select current_database() as database",
    );
    return { configured: true as const, database: result.rows[0]?.database };
  } finally {
    await pool.end();
  }
}
