import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

type Session = {
  userId: string;
  createdAt: number;
};

type UploadedFile = {
  field: string;
  originalName: string;
  mimeType: string;
  size: number;
  data: Buffer;
};

const sessions = new Map<string, Session>();
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  ssl: { rejectUnauthorized: false },
});
const pool = {
  async query(sql: string, params?: any[]): Promise<{ rows: any[]; rowCount: number }> {
    const result = await pgPool.query(sql, params);
    return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
  }
};
const publicDir = path.resolve(process.cwd(), "techeduca", "public");

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function id() {
  return crypto.randomUUID();
}

function send(res: Response, status: number, body: unknown) {
  res.status(status).json(body);
}

function getCookie(req: Request, name: string) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

async function currentUser(req: Request) {
  const token = getCookie(req, "techeduca_session");
  const session = token ? sessions.get(token) : null;
  if (!session) return null;

  const result = await pool.query(
    "select id, name, email, role from techeduca_users where id = $1",
    [session.userId],
  );
  return result.rows[0] || null;
}

async function requireUser(req: Request, res: Response) {
  const user = await currentUser(req);
  if (!user) {
    send(res, 401, { error: "login_required" });
    return null;
  }
  return user;
}

async function requireAdmin(req: Request, res: Response) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== "admin") {
    send(res, 403, { error: "admin_required" });
    return null;
  }
  return user;
}

async function ensureTechEducaSchema() {
  await pool.query(`
    create table if not exists techeduca_users (
      id text primary key,
      name text not null,
      email text not null unique,
      password_hash text not null,
      role text not null check (role in ('admin', 'student')),
      created_at timestamptz not null default now()
    );

    create table if not exists techeduca_courses (
      id text primary key,
      title text not null,
      description text not null default '',
      category text not null default 'Treinamento',
      published boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists techeduca_modules (
      id text primary key,
      course_id text not null references techeduca_courses(id) on delete cascade,
      title text not null,
      position integer not null default 0,
      created_at timestamptz not null default now()
    );

    create table if not exists techeduca_lessons (
      id text primary key,
      module_id text not null references techeduca_modules(id) on delete cascade,
      title text not null,
      description text not null default '',
      video_url text not null default '',
      video_name text not null default '',
      published boolean not null default true,
      release_type text not null default 'immediate',
      release_value text not null default '',
      position integer not null default 0,
      created_at timestamptz not null default now()
    );

    create table if not exists techeduca_files (
      id text primary key,
      lesson_id text references techeduca_lessons(id) on delete cascade,
      name text not null,
      mime_type text not null default 'application/octet-stream',
      size integer not null default 0,
      data bytea not null,
      created_at timestamptz not null default now()
    );

    create table if not exists techeduca_quiz (
      id text primary key,
      module_id text not null references techeduca_modules(id) on delete cascade,
      question text not null,
      options jsonb not null default '[]'::jsonb,
      answer integer not null default 0,
      created_at timestamptz not null default now()
    );

    create table if not exists techeduca_enrollments (
      id text primary key,
      user_id text not null references techeduca_users(id) on delete cascade,
      course_id text not null references techeduca_courses(id) on delete cascade,
      expires_at text not null default '',
      active boolean not null default true,
      created_at timestamptz not null default now()
    );

    create table if not exists techeduca_progress (
      user_id text not null references techeduca_users(id) on delete cascade,
      course_id text not null references techeduca_courses(id) on delete cascade,
      completed_lessons jsonb not null default '[]'::jsonb,
      quiz_answers jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      primary key (user_id, course_id)
    );
  `);

  await pool.query("alter table techeduca_modules add column if not exists description text not null default ''");
  await pool.query("alter table techeduca_lessons add column if not exists published boolean not null default true");
  await pool.query("alter table techeduca_lessons add column if not exists release_type text not null default 'immediate'");
  await pool.query("alter table techeduca_lessons add column if not exists release_value text not null default ''");

  await pool.query(
    `insert into techeduca_users (id, name, email, password_hash, role)
     values ($1, $2, $3, $4, $5)
     on conflict (email) do nothing`,
    ["admin", "Administrador", "admin@techeduca.com", hash("admin123"), "admin"],
  );

  await pool.query(
    `insert into techeduca_users (id, name, email, password_hash, role)
     values ($1, $2, $3, $4, $5)
     on conflict (email) do nothing`,
    ["aluno-demo", "Aluno Demonstração", "aluno@techeduca.com", hash("aluno123"), "student"],
  );

  const hasCourse = await pool.query("select id from techeduca_courses limit 1");
  if (hasCourse.rowCount === 0) {
    await seedDemoData();
  }
}

async function seedDemoData() {
  const courseId = "curso-atendimento";
  const moduleId = "mod-boas-vindas";
  const lessonId = "aula-introducao";

  await pool.query(
    `insert into techeduca_courses (id, title, description, category, published)
     values ($1, $2, $3, $4, true)`,
    [
      courseId,
      "Atendimento e Suporte TechEduca+",
      "Trilha inicial para padronizar atendimento, materiais e avaliação dos alunos.",
      "Atendimento",
    ],
  );
  await pool.query(
    "insert into techeduca_modules (id, course_id, title, position) values ($1, $2, $3, 1)",
    [moduleId, courseId, "Boas-vindas"],
  );
  await pool.query(
    `insert into techeduca_lessons (id, module_id, title, description, position)
     values ($1, $2, $3, $4, 1)`,
    [lessonId, moduleId, "Introdução à trilha", "Visão geral da plataforma, combinados e próximos passos."],
  );
  await pool.query(
    `insert into techeduca_quiz (id, module_id, question, options, answer)
     values ($1, $2, $3, $4::jsonb, 0)`,
    [
      "q1",
      moduleId,
      "O que libera o progresso do aluno na trilha?",
      JSON.stringify(["Concluir aulas e responder atividades", "Somente abrir a página", "Apenas baixar arquivos"]),
    ],
  );
  await pool.query(
    `insert into techeduca_enrollments (id, user_id, course_id, expires_at, active)
     values ($1, $2, $3, $4, true)`,
    ["matricula-demo", "aluno-demo", courseId, "2026-12-31"],
  );
  await ensureProgress("aluno-demo", courseId);
}

async function ensureProgress(userId: string, courseId: string) {
  await pool.query(
    `insert into techeduca_progress (user_id, course_id)
     values ($1, $2)
     on conflict (user_id, course_id) do nothing`,
    [userId, courseId],
  );
}

async function readBody(req: Request) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function multipart(req: Request) {
  const contentType = req.headers["content-type"] || "";
  const boundary = String(contentType).match(/boundary=(.+)$/)?.[1];
  if (!boundary) return { fields: {} as Record<string, string>, files: [] as UploadedFile[] };

  const raw = await readBody(req);
  const marker = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];
  let start = raw.indexOf(marker) + marker.length + 2;

  while (start > marker.length && start < raw.length) {
    const next = raw.indexOf(marker, start);
    if (next === -1) break;
    const part = raw.subarray(start, next - 2);
    const split = part.indexOf(Buffer.from("\r\n\r\n"));
    if (split > -1) {
      const header = part.subarray(0, split).toString("utf8");
      const value = part.subarray(split + 4);
      const name = header.match(/name="([^"]+)"/)?.[1];
      const filename = header.match(/filename="([^"]*)"/)?.[1];
      const mimeType = header.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || "application/octet-stream";
      if (name && filename) {
        files.push({ field: name, originalName: path.basename(filename), mimeType, size: value.length, data: value });
      } else if (name) {
        fields[name] = value.toString("utf8");
      }
    }
    start = next + marker.length + 2;
  }
  return { fields, files };
}

function lessonIsReleased(lesson: any, enrollment?: any) {
  if (!lesson.published) return false;
  if (lesson.release_type === "date" && lesson.release_value) {
    return new Date(`${lesson.release_value}T00:00:00`).getTime() <= Date.now();
  }
  if (lesson.release_type === "days" && lesson.release_value && enrollment?.created_at) {
    const days = Number(lesson.release_value || 0);
    const availableAt = new Date(enrollment.created_at).getTime() + days * 24 * 60 * 60 * 1000;
    return availableAt <= Date.now();
  }
  return true;
}

async function coursesWithStructure(courseIds?: string[], options: { includeDrafts?: boolean; enrollment?: any } = {}) {
  const courseParams = courseIds?.length ? courseIds : null;
  const courseResult = courseParams
    ? await pool.query(
      `select * from techeduca_courses where id = any($1) ${options.includeDrafts ? "" : "and published = true"} order by created_at desc`,
      [courseParams],
    )
    : await pool.query(`select * from techeduca_courses ${options.includeDrafts ? "" : "where published = true"} order by created_at desc`);

  const courses = [];
  for (const course of courseResult.rows) {
    const moduleResult = await pool.query(
      "select * from techeduca_modules where course_id = $1 order by position, created_at",
      [course.id],
    );
    const modules = [];
    for (const module of moduleResult.rows) {
      const lessonResult = await pool.query(
        "select * from techeduca_lessons where module_id = $1 order by position, created_at",
        [module.id],
      );
      const quizResult = await pool.query(
        "select id, question, options, answer from techeduca_quiz where module_id = $1 order by created_at",
        [module.id],
      );
      const lessons = [];
      for (const lesson of lessonResult.rows) {
        if (!options.includeDrafts && !lessonIsReleased(lesson, options.enrollment)) continue;
        const fileResult = await pool.query(
          "select id, name, size from techeduca_files where lesson_id = $1 order by created_at",
          [lesson.id],
        );
        lessons.push({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          videoUrl: lesson.video_url,
          videoName: lesson.video_name,
          published: lesson.published,
          releaseType: lesson.release_type,
          releaseValue: lesson.release_value,
          files: fileResult.rows.map((file) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            url: `/techeduca/uploads/${file.id}`,
          })),
        });
      }
      modules.push({ id: module.id, title: module.title, description: module.description, lessons, quiz: quizResult.rows });
    }
    courses.push({
      id: course.id,
      title: course.title,
      description: course.description,
      category: course.category,
      published: course.published,
      modules,
    });
  }
  return courses;
}

function completion(course: any, progress: any) {
  const lessonCount = course.modules.flatMap((module: any) => module.lessons).length;
  if (!lessonCount) return 0;
  return Math.round(((progress?.completed_lessons || []).length / lessonCount) * 100);
}

export async function registerTechEduca(app: Express) {
  try {
    await ensureTechEducaSchema();
  } catch (e: any) {
    console.warn("TechEduca schema setup skipped (tables may already exist):", e?.message);
  }

  app.use("/techeduca", express.static(publicDir));
  app.get("/techeduca", (_req, res) => res.redirect("/techeduca/"));
  app.get("/techdemais/treinamentos", (_req, res) => res.redirect("/techeduca/"));
  app.get("/techdemais/treinamentos/", (_req, res) => res.redirect("/techeduca/"));

  app.get("/techeduca/uploads/:id", async (req, res) => {
    const result = await pool.query("select name, mime_type, data from techeduca_files where id = $1", [req.params.id]);
    const file = result.rows[0];
    if (!file) {
      res.status(404).send("Arquivo não encontrado.");
      return;
    }
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${String(file.name).replaceAll('"', "")}"`);
    res.end(file.data);
  });

  app.post("/techeduca/api/login", async (req, res) => {
    const result = await pool.query(
      "select id, name, email, role from techeduca_users where lower(email) = lower($1) and password_hash = $2",
      [req.body.email || "", hash(req.body.password || "")],
    );
    const user = result.rows[0];
    if (!user) return send(res, 401, { error: "E-mail ou senha inválidos." });
    const token = id();
    sessions.set(token, { userId: user.id, createdAt: Date.now() });
    res.setHeader("Set-Cookie", `techeduca_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
    return send(res, 200, { user });
  });

  app.post("/techeduca/api/logout", async (req, res) => {
    const token = getCookie(req, "techeduca_session");
    if (token) sessions.delete(token);
    res.setHeader("Set-Cookie", "techeduca_session=; HttpOnly; Path=/; Max-Age=0");
    return send(res, 200, { ok: true });
  });

  app.get("/techeduca/api/me", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    return send(res, 200, { user });
  });

  app.get("/techeduca/api/admin", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const courses = await coursesWithStructure(undefined, { includeDrafts: true });
    const studentsResult = await pool.query("select id, name, email, role from techeduca_users where role = 'student' order by name");
    const enrollmentsResult = await pool.query("select * from techeduca_enrollments order by created_at desc");
    const progressResult = await pool.query("select * from techeduca_progress");
    const students = studentsResult.rows.map((student) => ({
      ...student,
      enrollments: enrollmentsResult.rows.filter((enrollment) => enrollment.user_id === student.id).map((item) => ({
        id: item.id,
        userId: item.user_id,
        courseId: item.course_id,
        expiresAt: item.expires_at,
        active: item.active,
        createdAt: item.created_at,
      })),
    }));
    return send(res, 200, {
      courses,
      students,
      enrollments: enrollmentsResult.rows.map((item) => ({
        id: item.id,
        userId: item.user_id,
        courseId: item.course_id,
        expiresAt: item.expires_at,
        active: item.active,
        createdAt: item.created_at,
      })),
      progress: progressResult.rows.map((item) => ({
        userId: item.user_id,
        courseId: item.course_id,
        completedLessons: item.completed_lessons,
        quizAnswers: item.quiz_answers,
      })),
    });
  });

  app.get("/techeduca/api/student", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const enrollments = await pool.query(
      "select * from techeduca_enrollments where user_id = $1 and active = true order by created_at desc",
      [user.id],
    );
    const response = [];
    for (const enrollment of enrollments.rows) {
      await ensureProgress(user.id, enrollment.course_id);
      const progressResult = await pool.query(
        "select * from techeduca_progress where user_id = $1 and course_id = $2",
        [user.id, enrollment.course_id],
      );
      const courses = await coursesWithStructure([enrollment.course_id], { enrollment });
      const course = courses.find((item) => item.id === enrollment.course_id);
      if (course) {
        const progress = progressResult.rows[0];
        response.push({
          enrollment: {
            id: enrollment.id,
            userId: enrollment.user_id,
            courseId: enrollment.course_id,
            expiresAt: enrollment.expires_at,
            active: enrollment.active,
            createdAt: enrollment.created_at,
          },
          course,
          progress: {
            userId: progress.user_id,
            courseId: progress.course_id,
            completedLessons: progress.completed_lessons,
            quizAnswers: progress.quiz_answers,
          },
          completion: completion(course, progress),
        });
      }
    }
    return send(res, 200, { courses: response });
  });

  app.post("/techeduca/api/courses", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const course = { id: id(), ...req.body };
    await pool.query(
      "insert into techeduca_courses (id, title, description, category, published) values ($1, $2, $3, $4, $5)",
      [course.id, course.title, course.description || "", course.category || "Treinamento", Boolean(course.published)],
    );
    return send(res, 201, { course });
  });

  app.patch("/techeduca/api/courses/:courseId", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    await pool.query(
      `update techeduca_courses
       set title = $2, description = $3, category = $4, published = $5
       where id = $1`,
      [req.params.courseId, req.body.title, req.body.description || "", req.body.category || "Treinamento", Boolean(req.body.published)],
    );
    return send(res, 200, { ok: true });
  });

  app.post("/techeduca/api/courses/:courseId/modules", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const module = { id: id(), title: req.body.title, description: req.body.description || "" };
    await pool.query(
      "insert into techeduca_modules (id, course_id, title, description, position) values ($1, $2, $3, $4, (select count(*) + 1 from techeduca_modules where course_id = $2))",
      [module.id, req.params.courseId, module.title, module.description],
    );
    return send(res, 201, { module });
  });

  app.patch("/techeduca/api/courses/:courseId/modules/:moduleId", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    await pool.query(
      "update techeduca_modules set title = $3, description = $4 where id = $1 and course_id = $2",
      [req.params.moduleId, req.params.courseId, req.body.title, req.body.description || ""],
    );
    return send(res, 200, { ok: true });
  });

  app.delete("/techeduca/api/courses/:courseId/modules/:moduleId", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    await pool.query("delete from techeduca_modules where id = $1 and course_id = $2", [req.params.moduleId, req.params.courseId]);
    return send(res, 200, { ok: true });
  });

  app.post("/techeduca/api/courses/:courseId/modules/:moduleId/move", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const direction = req.body.direction === "down" ? 1 : -1;
    const current = await pool.query("select id, position from techeduca_modules where id = $1 and course_id = $2", [req.params.moduleId, req.params.courseId]);
    const module = current.rows[0];
    if (!module) return send(res, 404, { error: "Módulo não encontrado." });
    const neighbor = await pool.query(
      `select id, position from techeduca_modules
       where course_id = $1 and ${direction < 0 ? "position < $2" : "position > $2"}
       order by position ${direction < 0 ? "desc" : "asc"} limit 1`,
      [req.params.courseId, module.position],
    );
    if (neighbor.rows[0]) {
      await pool.query("update techeduca_modules set position = $2 where id = $1", [module.id, neighbor.rows[0].position]);
      await pool.query("update techeduca_modules set position = $2 where id = $1", [neighbor.rows[0].id, module.position]);
    }
    return send(res, 200, { ok: true });
  });

  app.post("/techeduca/api/courses/:courseId/modules/:moduleId/lessons", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const form = await multipart(req);
    const video = form.files.find((file) => file.field === "video");
    const lessonId = id();
    let videoUrl = form.fields.videoUrl || "";
    let videoName = "";
    if (video?.size) {
      const fileId = id();
      await pool.query(
        "insert into techeduca_files (id, lesson_id, name, mime_type, size, data) values ($1, $2, $3, $4, $5, $6)",
        [fileId, lessonId, video.originalName, video.mimeType, video.size, video.data],
      );
      videoUrl = `/techeduca/uploads/${fileId}`;
      videoName = video.originalName;
    }

    await pool.query(
      `insert into techeduca_lessons (id, module_id, title, description, video_url, video_name, published, release_type, release_value, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, (select count(*) + 1 from techeduca_lessons where module_id = $2))`,
      [
        lessonId,
        req.params.moduleId,
        form.fields.title || "Nova aula",
        form.fields.description || "",
        videoUrl,
        videoName,
        form.fields.published !== "false",
        form.fields.releaseType || "immediate",
        form.fields.releaseValue || "",
      ],
    );

    for (const file of form.files.filter((item) => item.field === "files" && item.size)) {
      await pool.query(
        "insert into techeduca_files (id, lesson_id, name, mime_type, size, data) values ($1, $2, $3, $4, $5, $6)",
        [id(), lessonId, file.originalName, file.mimeType, file.size, file.data],
      );
    }

    return send(res, 201, { lesson: { id: lessonId } });
  });

  app.patch("/techeduca/api/courses/:courseId/modules/:moduleId/lessons/:lessonId", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const form = await multipart(req);
    const video = form.files.find((file) => file.field === "video");
    let videoUrl = form.fields.videoUrl || "";
    let videoName = form.fields.videoName || "";
    if (video?.size) {
      const fileId = id();
      await pool.query(
        "insert into techeduca_files (id, lesson_id, name, mime_type, size, data) values ($1, $2, $3, $4, $5, $6)",
        [fileId, req.params.lessonId, video.originalName, video.mimeType, video.size, video.data],
      );
      videoUrl = `/techeduca/uploads/${fileId}`;
      videoName = video.originalName;
    }

    await pool.query(
      `update techeduca_lessons
       set module_id = $2, title = $3, description = $4, video_url = $5, video_name = $6,
           published = $7, release_type = $8, release_value = $9
       where id = $1`,
      [
        req.params.lessonId,
        form.fields.moduleId || req.params.moduleId,
        form.fields.title || "Aula",
        form.fields.description || "",
        videoUrl,
        videoName,
        form.fields.published !== "false",
        form.fields.releaseType || "immediate",
        form.fields.releaseValue || "",
      ],
    );

    for (const file of form.files.filter((item) => item.field === "files" && item.size)) {
      await pool.query(
        "insert into techeduca_files (id, lesson_id, name, mime_type, size, data) values ($1, $2, $3, $4, $5, $6)",
        [id(), req.params.lessonId, file.originalName, file.mimeType, file.size, file.data],
      );
    }

    return send(res, 200, { ok: true });
  });

  app.delete("/techeduca/api/courses/:courseId/modules/:moduleId/lessons/:lessonId", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    await pool.query("delete from techeduca_lessons where id = $1 and module_id = $2", [req.params.lessonId, req.params.moduleId]);
    return send(res, 200, { ok: true });
  });

  app.post("/techeduca/api/courses/:courseId/modules/:moduleId/lessons/:lessonId/move", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const direction = req.body.direction === "down" ? 1 : -1;
    const current = await pool.query("select id, position from techeduca_lessons where id = $1 and module_id = $2", [req.params.lessonId, req.params.moduleId]);
    const lesson = current.rows[0];
    if (!lesson) return send(res, 404, { error: "Aula não encontrada." });
    const neighbor = await pool.query(
      `select id, position from techeduca_lessons
       where module_id = $1 and ${direction < 0 ? "position < $2" : "position > $2"}
       order by position ${direction < 0 ? "desc" : "asc"} limit 1`,
      [req.params.moduleId, lesson.position],
    );
    if (neighbor.rows[0]) {
      await pool.query("update techeduca_lessons set position = $2 where id = $1", [lesson.id, neighbor.rows[0].position]);
      await pool.query("update techeduca_lessons set position = $2 where id = $1", [neighbor.rows[0].id, lesson.position]);
    }
    return send(res, 200, { ok: true });
  });

  app.delete("/techeduca/api/files/:fileId", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    await pool.query("delete from techeduca_files where id = $1", [req.params.fileId]);
    return send(res, 200, { ok: true });
  });

  app.post("/techeduca/api/courses/:courseId/modules/:moduleId/quiz", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const question = {
      id: id(),
      question: req.body.question,
      options: [req.body.optionA, req.body.optionB, req.body.optionC].filter(Boolean),
      answer: Number(req.body.answer || 0),
    };
    await pool.query(
      "insert into techeduca_quiz (id, module_id, question, options, answer) values ($1, $2, $3, $4::jsonb, $5)",
      [question.id, req.params.moduleId, question.question, JSON.stringify(question.options), question.answer],
    );
    return send(res, 201, { question });
  });

  app.post("/techeduca/api/students", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const userId = id();
    try {
      await pool.query(
        "insert into techeduca_users (id, name, email, password_hash, role) values ($1, $2, $3, $4, 'student')",
        [userId, req.body.name, req.body.email, hash(req.body.password || "123456")],
      );
    } catch {
      return send(res, 409, { error: "Já existe aluno com este e-mail." });
    }
    if (req.body.courseId) {
      await pool.query(
        "insert into techeduca_enrollments (id, user_id, course_id, expires_at, active) values ($1, $2, $3, $4, true)",
        [id(), userId, req.body.courseId, req.body.expiresAt || ""],
      );
      await ensureProgress(userId, req.body.courseId);
    }
    return send(res, 201, { student: { id: userId, name: req.body.name, email: req.body.email, role: "student" } });
  });

  app.post("/techeduca/api/enrollments", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const enrollment = { id: id(), ...req.body };
    await pool.query(
      "insert into techeduca_enrollments (id, user_id, course_id, expires_at, active) values ($1, $2, $3, $4, true)",
      [enrollment.id, enrollment.userId, enrollment.courseId, enrollment.expiresAt || ""],
    );
    await ensureProgress(enrollment.userId, enrollment.courseId);
    return send(res, 201, { enrollment });
  });

  app.post("/techeduca/api/progress/lesson", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    await ensureProgress(user.id, req.body.courseId);
    await pool.query(
      `update techeduca_progress
       set completed_lessons = (
         select jsonb_agg(distinct value)
         from jsonb_array_elements_text(completed_lessons || to_jsonb($3::text)) as value
       ), updated_at = now()
       where user_id = $1 and course_id = $2`,
      [user.id, req.body.courseId, req.body.lessonId],
    );
    return send(res, 200, { ok: true });
  });

  app.post("/techeduca/api/progress/quiz", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    await ensureProgress(user.id, req.body.courseId);
    await pool.query(
      `update techeduca_progress
       set quiz_answers = quiz_answers || jsonb_build_object($3::text, $4::int), updated_at = now()
       where user_id = $1 and course_id = $2`,
      [user.id, req.body.courseId, req.body.questionId, Number(req.body.answer)],
    );
    return send(res, 200, { ok: true });
  });

  app.get("/techeduca/*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}
