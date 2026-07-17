import pg from "pg";
import type { InsertUser, User } from "../drizzle/schema";
import { ENV } from './_core/env';

let _pool: pg.Pool | null = null;

function getPostgresPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!_pool) {
    _pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ssl: { rejectUnauthorized: false },
    });
  }
  return _pool;
}

/**
 * getPgPool - returns the shared PostgreSQL pool.
 * plannerStore.ts uses pool.query(sql, params) with $1,$2 placeholders and expects { rows: T[] }.
 */
export function getPgPool() {
  const pool = getPostgresPool();
  if (!pool) return null;
  return pool;
}

export async function getDb() {
  console.warn("[Database] Drizzle/MySQL access is disabled; use getPgPool() for PostgreSQL queries.");
  return null;
}

export async function checkDatabaseReadiness() {
  const pool = getPostgresPool();
  if (!pool) {
    return {
      ok: false,
      reason: "DATABASE_URL is not configured",
    } as const;
  }

  const startedAt = Date.now();
  try {
    await pool.query("SELECT 1");
    return {
      ok: true,
      latencyMs: Date.now() - startedAt,
    } as const;
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Database readiness check failed",
    } as const;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const pool = getPostgresPool();
  if (!pool) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await pool.query(
      `INSERT INTO "users" ("openId", "name", "email", "loginMethod", "role", "lastSignedIn")
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT ("openId") DO UPDATE SET
         "name" = EXCLUDED."name",
         "email" = EXCLUDED."email",
         "loginMethod" = EXCLUDED."loginMethod",
         "role" = EXCLUDED."role",
         "lastSignedIn" = EXCLUDED."lastSignedIn",
         "updatedAt" = now()`,
      [
        values.openId,
        values.name ?? null,
        values.email ?? null,
        values.loginMethod ?? null,
        values.role ?? "user",
        values.lastSignedIn ?? new Date(),
      ],
    );
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const pool = getPostgresPool();
  if (!pool) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await pool.query<User>(
    `SELECT * FROM "users" WHERE "openId" = $1 LIMIT 1`,
    [openId],
  );

  return result.rows.length > 0 ? result.rows[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
