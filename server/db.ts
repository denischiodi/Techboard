import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: any = null;
let _pool: mysql.Pool | null = null;

function getMysqlPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!_pool) {
    _pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      ssl: { rejectUnauthorized: true },
    });
  }
  return _pool;
}

/**
 * getPgPool - returns a pg-compatible pool wrapper over mysql2
 * plannerStore.ts uses pool.query(sql, params) with $1,$2 placeholders and expects { rows: T[] }
 */
export function getPgPool() {
  const pool = getMysqlPool();
  if (!pool) return null;
  return {
    query: async <T = any>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> => {
      // Convert PostgreSQL-style $1, $2 placeholders to MySQL ? placeholders
      let idx = 0;
      const mysqlSql = sql.replace(/\$(\d+)/g, () => {
        idx++;
        return '?';
      });
      // Convert PostgreSQL-style quoted identifiers and casting
      const cleanSql = mysqlSql
        .replace(/::text/g, '')
        .replace(/RETURNING \*/g, '')
        .replace(/"(\w+)"/g, '`$1`');
      
      const [rows] = await pool.query(cleanSql, params);
      return { rows: rows as T[] };
    },
    end: () => pool.end(),
  };
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  const pool = getMysqlPool();
  if (!_db && pool) {
    try {
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function checkDatabaseReadiness() {
  const pool = getMysqlPool();
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

  const db = await getDb();
  if (!db) {
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

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
