import { getPgPool } from "./db";

type SnapshotMetric = { module: string; metricId: string; value: number };
let schedulerStarted = false;

async function safeCount(table: string, where = "TRUE") {
  const pool = getPgPool();
  if (!pool) return 0;
  if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid analytics table");
  try {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${table}" WHERE ${where}`
    );
    return Number(result.rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

export async function collectDashboardMetrics(): Promise<SnapshotMetric[]> {
  const [
    resources,
    projects,
    users,
    openActivities,
    blocked,
    overdue,
    gaps,
    tests,
  ] = await Promise.all([
    safeCount("resources", `"status" = 'Ativo'`),
    safeCount("projects", `"status" NOT IN ('Concluído', 'Cancelado')`),
    safeCount("app_users", `"active" = 1`),
    safeCount("activities", `"status" <> 'Concluída' AND "archivedAt" IS NULL`),
    safeCount("activities", `"status" = 'Bloqueada' AND "archivedAt" IS NULL`),
    safeCount(
      "activities",
      `"status" <> 'Concluída' AND "dueDate" <> '' AND "dueDate" < CURRENT_DATE::text AND "archivedAt" IS NULL`
    ),
    safeCount("gaps", `"status" NOT IN ('Resolvido', 'Aceito')`),
    safeCount(
      "workflow_test_cases",
      `"status" NOT IN ('Aprovado', 'Concluído')`
    ),
  ]);
  return [
    { module: "techboard", metricId: "active_resources", value: resources },
    { module: "techboard", metricId: "active_projects", value: projects },
    { module: "techtask", metricId: "open_activities", value: openActivities },
    { module: "techtask", metricId: "blocked_activities", value: blocked },
    { module: "techtask", metricId: "overdue_activities", value: overdue },
    { module: "techmove", metricId: "open_gaps", value: gaps },
    { module: "techmove", metricId: "failed_tests", value: tests },
    { module: "admin", metricId: "active_users", value: users },
    { module: "techlead", metricId: "visible_projects", value: projects },
  ];
}

export async function captureDailyDashboardSnapshots(
  date = new Date().toISOString().slice(0, 10)
) {
  const pool = getPgPool();
  if (!pool) return { captured: 0, available: false };
  await pool.query(`CREATE TABLE IF NOT EXISTS "dashboard_snapshots" (
    "snapshotDate" varchar(10) NOT NULL, "module" varchar(32) NOT NULL,
    "metricId" varchar(128) NOT NULL, "dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "value" numeric NOT NULL, "createdAt" timestamp DEFAULT now() NOT NULL,
    UNIQUE ("snapshotDate", "module", "metricId", "dimensions"))`);
  const metrics = await collectDashboardMetrics();
  for (const metric of metrics) {
    await pool.query(
      `INSERT INTO "dashboard_snapshots" ("snapshotDate","module","metricId","dimensions","value")
       VALUES ($1,$2,$3,'{}'::jsonb,$4)
       ON CONFLICT ("snapshotDate","module","metricId","dimensions")
       DO UPDATE SET "value"=EXCLUDED."value","createdAt"=now()`,
      [date, metric.module, metric.metricId, metric.value]
    );
  }
  return { captured: metrics.length, available: true };
}

export async function listDashboardHistory(
  module: string,
  metricId: string,
  startDate: string,
  endDate: string
) {
  const pool = getPgPool();
  if (!pool) return [];
  try {
    const result = await pool.query<{ snapshotDate: string; value: string }>(
      `SELECT "snapshotDate","value"::text AS value FROM "dashboard_snapshots"
       WHERE "module"=$1 AND "metricId"=$2 AND "snapshotDate" BETWEEN $3 AND $4 ORDER BY "snapshotDate"`,
      [module, metricId, startDate, endDate]
    );
    return result.rows.map(row => ({
      date: row.snapshotDate,
      value: Number(row.value),
    }));
  } catch {
    return [];
  }
}

export function startDashboardSnapshotScheduler() {
  if (schedulerStarted || process.env.NODE_ENV === "test") return;
  schedulerStarted = true;
  const capture = () =>
    captureDailyDashboardSnapshots().catch(error =>
      console.warn(
        "[DashboardSnapshots] capture failed:",
        error instanceof Error ? error.message : error
      )
    );
  void capture();
  setInterval(capture, 6 * 60 * 60 * 1000).unref();
}
