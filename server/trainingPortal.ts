import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import path from "node:path";
import { createContext } from "./_core/context";
import * as store from "./plannerStore";
import { getPgPool } from "./db";
import {
  TRAINING_CATALOG,
  TRAINING_COVERAGE,
  type TrainingCourseSeed,
} from "./trainingCatalog";
import type {
  AppProduct,
  AppScreen,
  AppTab,
  UserPermissions,
} from "../shared/types";

type PortalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
  permissions: UserPermissions;
};

type UploadedFile = {
  field: string;
  originalName: string;
  mimeType: string;
  size: number;
  data: Buffer;
};

type EditableLesson = {
  id: string;
  title: string;
  description: string;
  content: string;
  routePath: string;
  keywords: string[];
  audiences: string[];
  videoUrl: string;
  videoName: string;
  published: boolean;
  position: number;
  versionLabel: string;
  updatedAt: string;
  files: Array<{ id: string; name: string; size: number; url: string }>;
};

type EditableModule = {
  id: string;
  title: string;
  description: string;
  position: number;
  lessons: EditableLesson[];
};

type EditableCourse = {
  id: string;
  title: string;
  description: string;
  category: string;
  color: string;
  published: boolean;
  modules: EditableModule[];
};

const publicDir = path.resolve(process.cwd(), "techeduca", "public");
const memoryCourses = new Map<string, EditableCourse>();

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function send(res: Response, status: number, body: unknown) {
  res.status(status).json(body);
}

function parseJsonList(value: unknown) {
  if (Array.isArray(value))
    return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed))
      return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return value
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function seedToCourse(course: TrainingCourseSeed): EditableCourse {
  return {
    id: course.id,
    title: course.title,
    description: course.description,
    category: course.category,
    color: course.color,
    published: true,
    modules: course.modules.map((module, moduleIndex) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      position: moduleIndex + 1,
      lessons: module.lessons.map((item, lessonIndex) => ({
        id: item.id,
        title: item.title,
        description: item.summary,
        content: item.content,
        routePath: item.route,
        keywords: item.keywords,
        audiences: item.audiences,
        videoUrl: "",
        videoName: "",
        published: true,
        position: lessonIndex + 1,
        versionLabel: "2026.07",
        updatedAt: new Date().toISOString(),
        files: [],
      })),
    })),
  };
}

function seedMemoryCatalog() {
  for (const course of TRAINING_CATALOG) {
    if (!memoryCourses.has(course.id))
      memoryCourses.set(course.id, seedToCourse(course));
  }
}

const routePermissions: Array<{
  prefix: string;
  screen: AppScreen;
  tab: AppTab;
  product: AppProduct;
}> = [
  {
    prefix: "/techboard/resources",
    screen: "techboard.resources",
    tab: "resources",
    product: "techboard",
  },
  {
    prefix: "/techboard/projects",
    screen: "techboard.projects",
    tab: "projects",
    product: "techboard",
  },
  {
    prefix: "/techboard/absences",
    screen: "techboard.absences",
    tab: "absences",
    product: "techboard",
  },
  {
    prefix: "/techboard/planner",
    screen: "techboard.planner",
    tab: "planner",
    product: "techboard",
  },
  {
    prefix: "/techboard/org-chart",
    screen: "techboard.organogram",
    tab: "organogram",
    product: "techboard",
  },
  {
    prefix: "/techboard",
    screen: "techboard.overview",
    tab: "dashboard",
    product: "techboard",
  },
  {
    prefix: "/techlead/gp-track",
    screen: "techlead.gpTrack",
    tab: "gpChecklist",
    product: "techlead",
  },
  {
    prefix: "/techlead/teams",
    screen: "techlead.teams",
    tab: "gpChecklist",
    product: "techlead",
  },
  {
    prefix: "/techlead/indicators",
    screen: "techlead.indicators",
    tab: "gpChecklist",
    product: "techlead",
  },
  {
    prefix: "/techlead",
    screen: "techlead.overview",
    tab: "gpChecklist",
    product: "techlead",
  },
  {
    prefix: "/techmove/scope-items",
    screen: "techmove.scopeItems",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techmove/bdcq",
    screen: "techmove.bdcq",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techmove/workshops",
    screen: "techmove.workshops",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techmove/dcd",
    screen: "techmove.dcd",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techmove/gaps",
    screen: "techmove.gaps",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techmove/configurations",
    screen: "techmove.configurations",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techmove/tests",
    screen: "techmove.tests",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techmove/governance",
    screen: "techmove.governance",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techmove",
    screen: "techmove.projects",
    tab: "techmove",
    product: "techmove",
  },
  {
    prefix: "/techtask/my-work",
    screen: "techtask.myWork",
    tab: "activities",
    product: "techtask",
  },
  {
    prefix: "/techtask/board",
    screen: "techtask.board",
    tab: "activities",
    product: "techtask",
  },
  {
    prefix: "/techtask",
    screen: "techtask.overview",
    tab: "activities",
    product: "techtask",
  },
  {
    prefix: "/admin/users",
    screen: "admin.users",
    tab: "access",
    product: "admin",
  },
  {
    prefix: "/admin/registrations",
    screen: "admin.registrations",
    tab: "settings",
    product: "admin",
  },
  {
    prefix: "/admin/standards",
    screen: "admin.standards",
    tab: "access",
    product: "admin",
  },
  {
    prefix: "/admin",
    screen: "admin.overview",
    tab: "access",
    product: "admin",
  },
];

function canViewTrainingRoute(user: PortalUser, routePath: string) {
  if (!routePath || routePath === "/") return true;
  if (user.isAdmin) return true;
  const match = routePermissions.find(
    item => routePath === item.prefix || routePath.startsWith(`${item.prefix}/`)
  );
  if (!match) return true;
  if (user.permissions.products?.[match.product] === false) return false;
  const screenActions = user.permissions.actions?.[match.screen];
  if (screenActions) return Boolean(screenActions.view);
  const tabActions = user.permissions.actions?.[match.tab];
  return Boolean(
    user.permissions[match.tab] &&
      (!tabActions || tabActions.view) &&
      user.permissions.products?.[match.product] !== false
  );
}

function filterCoursesForUser(courses: EditableCourse[], user: PortalUser) {
  return courses
    .map(course => ({
      ...course,
      modules: course.modules
        .map(module => ({
          ...module,
          lessons: module.lessons.filter(item =>
            canViewTrainingRoute(user, item.routePath)
          ),
        }))
        .filter(module => module.lessons.length > 0),
    }))
    .filter(course => course.modules.length > 0);
}

async function currentUser(
  req: Request,
  res: Response
): Promise<PortalUser | null> {
  const context = await createContext({ req, res });
  if (!context.user?.email) return null;
  const appUser = await store.getAppUserByEmail(context.user.email);
  if (!appUser?.active) return null;
  return {
    id: appUser.id,
    name: appUser.name,
    email: appUser.email,
    role: appUser.role,
    isAdmin: appUser.role === "admin",
    permissions: appUser.permissions,
  };
}

async function requireUser(req: Request, res: Response) {
  const user = await currentUser(req, res);
  if (!user) send(res, 401, { error: "portal_login_required" });
  return user;
}

async function requireAdmin(req: Request, res: Response) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!user.isAdmin) {
    send(res, 403, { error: "admin_required" });
    return null;
  }
  return user;
}

async function readBody(req: Request) {
  const chunks: Buffer[] = [];
  for await (const chunk of req)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function multipart(req: Request) {
  const contentType = req.headers["content-type"] || "";
  const boundary = String(contentType).match(/boundary=(.+)$/)?.[1];
  if (!boundary)
    return {
      fields: {} as Record<string, string>,
      files: [] as UploadedFile[],
    };
  const raw = await readBody(req);
  const marker = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];
  let cursor = raw.indexOf(marker);
  while (cursor >= 0) {
    const next = raw.indexOf(marker, cursor + marker.length);
    if (next < 0) break;
    let part = raw.subarray(cursor + marker.length, next);
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === "\r\n")
      part = part.subarray(0, part.length - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd > -1) {
      const header = part.subarray(0, headerEnd).toString("utf8");
      const data = part.subarray(headerEnd + 4);
      const name = header.match(/name="([^"]+)"/)?.[1] || "";
      const fileName = header.match(/filename="([^"]*)"/)?.[1] || "";
      if (name && fileName) {
        files.push({
          field: name,
          originalName: fileName,
          mimeType:
            header.match(/content-type:\s*([^\r\n]+)/i)?.[1] ||
            "application/octet-stream",
          size: data.length,
          data,
        });
      } else if (name) fields[name] = data.toString("utf8");
    }
    cursor = next;
  }
  return { fields, files };
}

async function ensureSchema() {
  const db = getPgPool();
  if (!db) {
    seedMemoryCatalog();
    return;
  }
  await db.query(`
    create table if not exists techeduca_courses (
      id text primary key,
      title text not null,
      description text not null default '',
      category text not null default 'Treinamento',
      color text not null default '#2563eb',
      published boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists techeduca_modules (
      id text primary key,
      course_id text not null references techeduca_courses(id) on delete cascade,
      title text not null,
      description text not null default '',
      position integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists techeduca_lessons (
      id text primary key,
      module_id text not null references techeduca_modules(id) on delete cascade,
      title text not null,
      description text not null default '',
      content text not null default '',
      route_path text not null default '',
      keywords jsonb not null default '[]'::jsonb,
      audiences jsonb not null default '[]'::jsonb,
      video_url text not null default '',
      video_name text not null default '',
      published boolean not null default true,
      position integer not null default 0,
      version_label text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
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
    create table if not exists techeduca_content_history (
      id text primary key,
      entity_type text not null,
      entity_id text not null,
      action text not null,
      actor_id text not null,
      actor_name text not null,
      snapshot jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  const alterations = [
    "alter table techeduca_courses add column if not exists color text not null default '#2563eb'",
    "alter table techeduca_courses add column if not exists updated_at timestamptz not null default now()",
    "alter table techeduca_modules add column if not exists description text not null default ''",
    "alter table techeduca_modules add column if not exists updated_at timestamptz not null default now()",
    "alter table techeduca_lessons add column if not exists content text not null default ''",
    "alter table techeduca_lessons add column if not exists route_path text not null default ''",
    "alter table techeduca_lessons add column if not exists keywords jsonb not null default '[]'::jsonb",
    "alter table techeduca_lessons add column if not exists audiences jsonb not null default '[]'::jsonb",
    "alter table techeduca_lessons add column if not exists version_label text not null default ''",
    "alter table techeduca_lessons add column if not exists updated_at timestamptz not null default now()",
  ];
  for (const sql of alterations) await db.query(sql);
  await seedDatabaseCatalog();
}

async function seedDatabaseCatalog() {
  const db = getPgPool();
  if (!db) return;
  for (const course of TRAINING_CATALOG) {
    await db.query(
      `insert into techeduca_courses
       (id,title,description,category,color,published)
       values ($1,$2,$3,$4,$5,true) on conflict (id) do nothing`,
      [
        course.id,
        course.title,
        course.description,
        course.category,
        course.color,
      ]
    );
    for (const [moduleIndex, module] of course.modules.entries()) {
      await db.query(
        `insert into techeduca_modules
         (id,course_id,title,description,position)
         values ($1,$2,$3,$4,$5) on conflict (id) do nothing`,
        [
          module.id,
          course.id,
          module.title,
          module.description,
          moduleIndex + 1,
        ]
      );
      for (const [lessonIndex, item] of module.lessons.entries()) {
        await db.query(
          `insert into techeduca_lessons
           (id,module_id,title,description,content,route_path,keywords,audiences,published,position,version_label)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,true,$9,$10)
           on conflict (id) do nothing`,
          [
            item.id,
            module.id,
            item.title,
            item.summary,
            item.content,
            item.route,
            JSON.stringify(item.keywords),
            JSON.stringify(item.audiences),
            lessonIndex + 1,
            "2026.07",
          ]
        );
      }
    }
  }
}

async function listCourses(includeDrafts: boolean): Promise<EditableCourse[]> {
  const db = getPgPool();
  if (!db)
    return [...memoryCourses.values()]
      .filter(course => includeDrafts || course.published)
      .map(course => ({
        ...course,
        modules: course.modules.map(module => ({
          ...module,
          lessons: module.lessons.filter(
            item => includeDrafts || item.published
          ),
        })),
      }));
  const courseRows = await db.query(
    `select * from techeduca_courses ${includeDrafts ? "" : "where published=true"}
     order by created_at,id`
  );
  const courses: EditableCourse[] = [];
  for (const courseRow of courseRows.rows) {
    const moduleRows = await db.query(
      "select * from techeduca_modules where course_id=$1 order by position,created_at",
      [courseRow.id]
    );
    const modules: EditableModule[] = [];
    for (const moduleRow of moduleRows.rows) {
      const lessonRows = await db.query(
        `select * from techeduca_lessons where module_id=$1
         ${includeDrafts ? "" : "and published=true"} order by position,created_at`,
        [moduleRow.id]
      );
      const lessons: EditableLesson[] = [];
      for (const row of lessonRows.rows) {
        const fileRows = await db.query(
          "select id,name,size from techeduca_files where lesson_id=$1 order by created_at",
          [row.id]
        );
        lessons.push({
          id: row.id,
          title: row.title,
          description: row.description || "",
          content: row.content || row.description || "",
          routePath: row.route_path || "",
          keywords: parseJsonList(row.keywords),
          audiences: parseJsonList(row.audiences),
          videoUrl: row.video_url || "",
          videoName: row.video_name || "",
          published: Boolean(row.published),
          position: Number(row.position || 0),
          versionLabel: row.version_label || "",
          updatedAt: row.updated_at,
          files: fileRows.rows.map(file => ({
            id: file.id,
            name: file.name,
            size: file.size,
            url: `/techeduca/api/files/${file.id}`,
          })),
        });
      }
      modules.push({
        id: moduleRow.id,
        title: moduleRow.title,
        description: moduleRow.description || "",
        position: Number(moduleRow.position || 0),
        lessons,
      });
    }
    courses.push({
      id: courseRow.id,
      title: courseRow.title,
      description: courseRow.description || "",
      category: courseRow.category || "Treinamento",
      color: courseRow.color || "#2563eb",
      published: Boolean(courseRow.published),
      modules,
    });
  }
  return courses;
}

async function history(
  user: PortalUser,
  entityType: string,
  entityId: string,
  action: string,
  snapshot: unknown
) {
  const db = getPgPool();
  if (!db) return;
  await db.query(
    `insert into techeduca_content_history
     (id,entity_type,entity_id,action,actor_id,actor_name,snapshot)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      newId("th"),
      entityType,
      entityId,
      action,
      user.id,
      user.name,
      JSON.stringify(snapshot),
    ]
  );
}

async function listHistory() {
  const db = getPgPool();
  if (!db) return [];
  const result = await db.query(
    `select id,entity_type,entity_id,action,actor_name,created_at
     from techeduca_content_history order by created_at desc limit 100`
  );
  return result.rows.map(row => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }));
}

function memoryFindModule(courseId: string, moduleId: string) {
  return memoryCourses
    .get(courseId)
    ?.modules.find(item => item.id === moduleId);
}

function parseFormLesson(
  fields: Record<string, string>,
  fallback?: EditableLesson
) {
  return {
    title: fields.title?.trim() || fallback?.title || "Nova aula",
    description: fields.description?.trim() || "",
    content: fields.content?.trim() || fields.description?.trim() || "",
    routePath: fields.routePath?.trim() || "",
    keywords: parseJsonList(fields.keywords),
    audiences: parseJsonList(fields.audiences),
    videoUrl: fields.videoUrl?.trim() || fallback?.videoUrl || "",
    videoName: fields.videoName || fallback?.videoName || "",
    published: fields.published !== "false",
    versionLabel: fields.versionLabel?.trim() || "2026.07",
  };
}

export async function registerTrainingPortal(app: Express) {
  try {
    await ensureSchema();
  } catch (error: any) {
    console.warn("Training portal schema setup skipped:", error?.message);
    seedMemoryCatalog();
  }

  app.use("/techeduca", express.static(publicDir));
  app.get("/techeduca", (_req, res) => res.redirect("/techeduca/"));
  app.use("/techdemais/techeduca", express.static(publicDir));
  app.get("/techdemais/techeduca", (_req, res) =>
    res.redirect("/techdemais/techeduca/")
  );
  app.get("/techdemais/treinamentos", (_req, res) =>
    res.redirect("/techdemais/techeduca/")
  );
  app.get("/techdemais/treinamentos/", (_req, res) =>
    res.redirect("/techdemais/techeduca/")
  );

  app.get("/techeduca/api/me", async (req, res) => {
    const user = await requireUser(req, res);
    if (user) send(res, 200, { user });
  });

  app.get("/techeduca/api/catalog", async (req, res) => {
    const user = await requireUser(req, res);
    if (!user) return;
    const allCourses = await listCourses(
      Boolean(user.isAdmin && req.query.drafts === "1")
    );
    const courses = filterCoursesForUser(allCourses, user);
    const visibleLessonIds = new Set(
      courses.flatMap(course =>
        course.modules.flatMap(module => module.lessons.map(item => item.id))
      )
    );
    send(res, 200, {
      courses,
      coverage: TRAINING_COVERAGE.filter(
        item => user.isAdmin || visibleLessonIds.has(item.lessonId)
      ),
      history: user.isAdmin ? await listHistory() : [],
      user,
    });
  });

  app.get("/techeduca/api/coverage", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    send(res, 200, { coverage: TRAINING_COVERAGE });
  });

  app.get("/techeduca/api/files/:id", async (req, res) => {
    if (!(await requireUser(req, res))) return;
    const db = getPgPool();
    if (!db)
      return res.status(404).send("Arquivo não disponível no modo local.");
    const result = await db.query(
      "select name,mime_type,data from techeduca_files where id=$1",
      [req.params.id]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).send("Arquivo não encontrado.");
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(file.name).replaceAll('"', "")}"`
    );
    res.end(file.data);
  });

  app.post("/techeduca/api/courses", async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const course: EditableCourse = {
      id: newId("tc"),
      title: String(req.body.title || "Novo curso").trim(),
      description: String(req.body.description || ""),
      category: String(req.body.category || "Treinamento"),
      color: String(req.body.color || "#2563eb"),
      published: Boolean(req.body.published),
      modules: [],
    };
    const db = getPgPool();
    if (db)
      await db.query(
        `insert into techeduca_courses
         (id,title,description,category,color,published) values ($1,$2,$3,$4,$5,$6)`,
        [
          course.id,
          course.title,
          course.description,
          course.category,
          course.color,
          course.published,
        ]
      );
    else memoryCourses.set(course.id, course);
    await history(user, "course", course.id, "created", course);
    send(res, 201, { course });
  });

  app.patch("/techeduca/api/courses/:courseId", async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const data = {
      title: String(req.body.title || "").trim(),
      description: String(req.body.description || ""),
      category: String(req.body.category || "Treinamento"),
      color: String(req.body.color || "#2563eb"),
      published: Boolean(req.body.published),
    };
    const db = getPgPool();
    if (db)
      await db.query(
        `update techeduca_courses set title=$2,description=$3,category=$4,
         color=$5,published=$6,updated_at=now() where id=$1`,
        [
          req.params.courseId,
          data.title,
          data.description,
          data.category,
          data.color,
          data.published,
        ]
      );
    else {
      const course = memoryCourses.get(req.params.courseId);
      if (course) Object.assign(course, data);
    }
    await history(user, "course", req.params.courseId, "updated", data);
    send(res, 200, { ok: true });
  });

  app.post("/techeduca/api/courses/:courseId/modules", async (req, res) => {
    const user = await requireAdmin(req, res);
    if (!user) return;
    const module: EditableModule = {
      id: newId("tm"),
      title: String(req.body.title || "Novo módulo").trim(),
      description: String(req.body.description || ""),
      position: 999,
      lessons: [],
    };
    const db = getPgPool();
    if (db)
      await db.query(
        `insert into techeduca_modules
         (id,course_id,title,description,position)
         values ($1,$2,$3,$4,(select count(*)+1 from techeduca_modules where course_id=$2))`,
        [module.id, req.params.courseId, module.title, module.description]
      );
    else {
      const course = memoryCourses.get(req.params.courseId);
      if (course) {
        module.position = course.modules.length + 1;
        course.modules.push(module);
      }
    }
    await history(user, "module", module.id, "created", module);
    send(res, 201, { module });
  });

  app.post(
    "/techeduca/api/courses/:courseId/modules/:moduleId/move",
    async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const direction = req.body.direction === "down" ? 1 : -1;
      const db = getPgPool();
      if (db) {
        const current = await db.query(
          "select id,position from techeduca_modules where id=$1 and course_id=$2",
          [req.params.moduleId, req.params.courseId]
        );
        const item = current.rows[0];
        if (item) {
          const neighbor = await db.query(
            `select id,position from techeduca_modules where course_id=$1
             and position ${direction < 0 ? "<" : ">"} $2
             order by position ${direction < 0 ? "desc" : "asc"} limit 1`,
            [req.params.courseId, item.position]
          );
          if (neighbor.rows[0]) {
            await db.query(
              "update techeduca_modules set position=$2 where id=$1",
              [item.id, neighbor.rows[0].position]
            );
            await db.query(
              "update techeduca_modules set position=$2 where id=$1",
              [neighbor.rows[0].id, item.position]
            );
          }
        }
      } else {
        const course = memoryCourses.get(req.params.courseId);
        const index =
          course?.modules.findIndex(item => item.id === req.params.moduleId) ??
          -1;
        const target = index + direction;
        if (
          course &&
          index >= 0 &&
          target >= 0 &&
          target < course.modules.length
        ) {
          [course.modules[index], course.modules[target]] = [
            course.modules[target],
            course.modules[index],
          ];
          course.modules.forEach(
            (item, itemIndex) => (item.position = itemIndex + 1)
          );
        }
      }
      await history(user, "module", req.params.moduleId, "moved", {
        direction,
      });
      send(res, 200, { ok: true });
    }
  );

  app.post(
    "/techeduca/api/courses/:courseId/modules/:moduleId/lessons",
    async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const form = await multipart(req);
      const data = parseFormLesson(form.fields);
      const lesson: EditableLesson = {
        id: newId("tl"),
        ...data,
        position: 999,
        updatedAt: new Date().toISOString(),
        files: [],
      };
      const db = getPgPool();
      if (db) {
        const video = form.files.find(file => file.field === "video");
        const videoFileId = video?.size ? newId("tf") : "";
        if (videoFileId) {
          lesson.videoUrl = `/techeduca/api/files/${videoFileId}`;
          lesson.videoName = video?.originalName || "";
        }
        await db.query(
          `insert into techeduca_lessons
           (id,module_id,title,description,content,route_path,keywords,audiences,
            video_url,video_name,published,position,version_label)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,
            (select count(*)+1 from techeduca_lessons where module_id=$2),$12)`,
          [
            lesson.id,
            req.params.moduleId,
            lesson.title,
            lesson.description,
            lesson.content,
            lesson.routePath,
            JSON.stringify(lesson.keywords),
            JSON.stringify(lesson.audiences),
            lesson.videoUrl,
            lesson.videoName,
            lesson.published,
            lesson.versionLabel,
          ]
        );
        if (video?.size && videoFileId) {
          await db.query(
            `insert into techeduca_files
             (id,lesson_id,name,mime_type,size,data) values ($1,$2,$3,$4,$5,$6)`,
            [
              videoFileId,
              lesson.id,
              video.originalName,
              video.mimeType,
              video.size,
              video.data,
            ]
          );
        }
        for (const file of form.files.filter(item => item.field === "files")) {
          await db.query(
            `insert into techeduca_files
             (id,lesson_id,name,mime_type,size,data) values ($1,$2,$3,$4,$5,$6)`,
            [
              newId("tf"),
              lesson.id,
              file.originalName,
              file.mimeType,
              file.size,
              file.data,
            ]
          );
        }
      } else {
        const module = memoryFindModule(
          req.params.courseId,
          req.params.moduleId
        );
        if (module) {
          lesson.position = module.lessons.length + 1;
          module.lessons.push(lesson);
        }
      }
      await history(user, "lesson", lesson.id, "created", lesson);
      send(res, 201, { lesson });
    }
  );

  app.patch(
    "/techeduca/api/courses/:courseId/modules/:moduleId/lessons/:lessonId",
    async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const form = await multipart(req);
      const memoryModule = memoryFindModule(
        req.params.courseId,
        req.params.moduleId
      );
      const fallback = memoryModule?.lessons.find(
        item => item.id === req.params.lessonId
      );
      const data = parseFormLesson(form.fields, fallback);
      const db = getPgPool();
      if (db) {
        const video = form.files.find(file => file.field === "video");
        if (video?.size) {
          const fileId = newId("tf");
          await db.query(
            `insert into techeduca_files
             (id,lesson_id,name,mime_type,size,data) values ($1,$2,$3,$4,$5,$6)`,
            [
              fileId,
              req.params.lessonId,
              video.originalName,
              video.mimeType,
              video.size,
              video.data,
            ]
          );
          data.videoUrl = `/techeduca/api/files/${fileId}`;
          data.videoName = video.originalName;
        }
        await db.query(
          `update techeduca_lessons set title=$2,description=$3,content=$4,
           route_path=$5,keywords=$6::jsonb,audiences=$7::jsonb,video_url=$8,
           video_name=$9,published=$10,version_label=$11,updated_at=now()
           where id=$1`,
          [
            req.params.lessonId,
            data.title,
            data.description,
            data.content,
            data.routePath,
            JSON.stringify(data.keywords),
            JSON.stringify(data.audiences),
            data.videoUrl,
            data.videoName,
            data.published,
            data.versionLabel,
          ]
        );
        for (const file of form.files.filter(item => item.field === "files")) {
          await db.query(
            `insert into techeduca_files
             (id,lesson_id,name,mime_type,size,data) values ($1,$2,$3,$4,$5,$6)`,
            [
              newId("tf"),
              req.params.lessonId,
              file.originalName,
              file.mimeType,
              file.size,
              file.data,
            ]
          );
        }
      } else if (fallback) {
        Object.assign(fallback, data, { updatedAt: new Date().toISOString() });
      }
      await history(user, "lesson", req.params.lessonId, "updated", data);
      send(res, 200, { ok: true });
    }
  );

  app.post(
    "/techeduca/api/courses/:courseId/modules/:moduleId/lessons/:lessonId/move",
    async (req, res) => {
      const user = await requireAdmin(req, res);
      if (!user) return;
      const direction = req.body.direction === "down" ? 1 : -1;
      const db = getPgPool();
      if (db) {
        const current = await db.query(
          "select id,position from techeduca_lessons where id=$1 and module_id=$2",
          [req.params.lessonId, req.params.moduleId]
        );
        const item = current.rows[0];
        if (item) {
          const neighbor = await db.query(
            `select id,position from techeduca_lessons where module_id=$1
             and position ${direction < 0 ? "<" : ">"} $2
             order by position ${direction < 0 ? "desc" : "asc"} limit 1`,
            [req.params.moduleId, item.position]
          );
          if (neighbor.rows[0]) {
            await db.query(
              "update techeduca_lessons set position=$2 where id=$1",
              [item.id, neighbor.rows[0].position]
            );
            await db.query(
              "update techeduca_lessons set position=$2 where id=$1",
              [neighbor.rows[0].id, item.position]
            );
          }
        }
      } else {
        const module = memoryFindModule(
          req.params.courseId,
          req.params.moduleId
        );
        const index =
          module?.lessons.findIndex(item => item.id === req.params.lessonId) ??
          -1;
        const target = index + direction;
        if (
          module &&
          index >= 0 &&
          target >= 0 &&
          target < module.lessons.length
        ) {
          [module.lessons[index], module.lessons[target]] = [
            module.lessons[target],
            module.lessons[index],
          ];
          module.lessons.forEach(
            (item, itemIndex) => (item.position = itemIndex + 1)
          );
        }
      }
      await history(user, "lesson", req.params.lessonId, "moved", {
        direction,
      });
      send(res, 200, { ok: true });
    }
  );

  app.delete("/techeduca/api/files/:id", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const db = getPgPool();
    if (db)
      await db.query("delete from techeduca_files where id=$1", [
        req.params.id,
      ]);
    send(res, 200, { ok: true });
  });

  app.get("/techeduca/*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
  app.get("/techdemais/techeduca/*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}
