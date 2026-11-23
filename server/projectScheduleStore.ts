import { getPgPool } from "./db";
import type { ProjectScheduleView } from "../shared/projectSchedule";
import { withExpectedProgress } from "../shared/scheduleProgress";

export type SavedProjectSchedule = ProjectScheduleView & { savedAt: string };
const memory = new Map<string, SavedProjectSchedule>();

export async function getProjectSchedule(
  projectId: string
): Promise<SavedProjectSchedule | null> {
  const db = getPgPool();
  if (!db) {
    const snapshot = memory.get(projectId);
    return snapshot ? withExpectedProgress(snapshot) : null;
  }
  const result = await db.query(
    'SELECT "snapshot", "savedAt" FROM "project_schedules" WHERE "projectId"=$1',
    [projectId]
  );
  const row = result.rows[0];
  return row
    ? withExpectedProgress({
        ...row.snapshot,
        savedAt: new Date(row.savedAt).toISOString(),
      })
    : null;
}

export async function saveProjectSchedule(
  projectId: string,
  snapshot: ProjectScheduleView,
  bytes: Buffer,
  userId: string
) {
  const savedAt = new Date().toISOString();
  const db = getPgPool();
  if (!db) {
    memory.set(projectId, { ...snapshot, savedAt });
    return { savedAt };
  }
  await db.query(
    `INSERT INTO "project_schedules" ("projectId","snapshot","originalFile","savedBy","savedAt")
    VALUES ($1,$2::jsonb,$3,$4,$5) ON CONFLICT ("projectId") DO UPDATE SET
    "snapshot"=EXCLUDED."snapshot", "originalFile"=EXCLUDED."originalFile",
    "savedBy"=EXCLUDED."savedBy", "savedAt"=EXCLUDED."savedAt"`,
    [projectId, JSON.stringify(snapshot), bytes, userId, savedAt]
  );
  return { savedAt };
}
