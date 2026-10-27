import { promises as fs } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

export type TrainingEnrollment = { courseId: string; expiresAt: string | null };
export type TrainingStudent = {
  userId: string;
  active: boolean;
  enrollments: TrainingEnrollment[];
  updatedAt: string;
};

/** Editors still need their existing ownership permission; student grants never confer editing rights. */
export function canLearnCourse(
  student: TrainingStudent | undefined,
  courseId: string,
  now = Date.now()
) {
  if (!student?.active) return false;
  return student.enrollments.some(
    enrollment =>
      enrollment.courseId === courseId &&
      (enrollment.expiresAt === null || Date.parse(enrollment.expiresAt) > now)
  );
}

/** Persist locally when the portal is running without PostgreSQL. */
export function createTrainingStudentStore(
  getPool: () => Pool | null,
  file = path.resolve(process.cwd(), ".local/techeduca-students.json")
) {
  let queue = Promise.resolve();
  async function list(): Promise<TrainingStudent[]> {
    const pool = getPool();
    if (pool)
      return (
        await pool.query("select payload from techeduca_students")
      ).rows.map(row => row.payload);
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error: any) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }
  async function save(student: TrainingStudent) {
    const operation = queue.then(async () => {
      const pool = getPool();
      if (pool) {
        await pool.query(
          "insert into techeduca_students(user_id,payload) values($1,$2) on conflict(user_id) do update set payload=excluded.payload",
          [student.userId, JSON.stringify(student)]
        );
        return;
      }
      const rows = await list();
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(
        file + ".tmp",
        JSON.stringify([
          ...rows.filter(row => row.userId !== student.userId),
          student,
        ]),
        { mode: 0o600 }
      );
      await fs.rename(file + ".tmp", file);
    });
    queue = operation.catch(() => {});
    await operation;
  }
  return { list, save };
}
