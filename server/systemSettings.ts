import type pg from "pg";
import { ENV } from "./_core/env";
import { getPgPool } from "./db";

const ACTIVITY_EMAIL_NOTIFICATIONS_KEY = "activity_email_notifications_enabled";

export async function getActivityEmailNotificationsEnabled(
  db: pg.Pool | null = getPgPool()
) {
  if (!db) return ENV.activityEmailNotificationsEnabled;
  const result = await db.query(
    `SELECT "value" FROM "system_settings" WHERE "key" = $1`,
    [ACTIVITY_EMAIL_NOTIFICATIONS_KEY]
  );
  const storedValue = result.rows[0]?.value;
  return storedValue == null
    ? ENV.activityEmailNotificationsEnabled
    : storedValue === "true";
}

export async function setActivityEmailNotificationsEnabled(enabled: boolean) {
  const db = getPgPool();
  if (!db) {
    throw new Error("Banco de dados indisponível para salvar a configuração");
  }
  await db.query(
    `INSERT INTO "system_settings" ("key", "value", "updatedAt")
     VALUES ($1, $2, now())
     ON CONFLICT ("key") DO UPDATE
       SET "value" = EXCLUDED."value", "updatedAt" = now()`,
    [ACTIVITY_EMAIL_NOTIFICATIONS_KEY, String(enabled)]
  );
  return enabled;
}
