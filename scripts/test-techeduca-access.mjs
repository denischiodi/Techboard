// Run with Node 24+: node --test scripts/test-techeduca-access.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import {
  canLearnCourse,
  createTrainingStudentStore,
} from "../server/trainingAccess.ts";

const now = Date.parse("2026-10-27T15:00:00Z");
const student = (overrides = {}) => ({
  userId: "student-1",
  active: true,
  enrollments: [{ courseId: "course-1", expiresAt: null }],
  updatedAt: new Date(now).toISOString(),
  ...overrides,
});

test("course access requires an active student and an explicit valid enrollment", () => {
  assert.equal(canLearnCourse(undefined, "course-1", now), false);
  assert.equal(canLearnCourse(student(), "course-1", now), true);
  assert.equal(canLearnCourse(student(), "other-course", now), false);
  assert.equal(
    canLearnCourse(student({ active: false }), "course-1", now),
    false
  );
  assert.equal(
    canLearnCourse(student({ enrollments: [] }), "course-1", now),
    false
  );
  for (const expiresAt of [
    "2026-10-26T15:00:00Z",
    "2026-10-27T15:00:00Z",
    "invalid",
  ]) {
    assert.equal(
      canLearnCourse(
        student({ enrollments: [{ courseId: "course-1", expiresAt }] }),
        "course-1",
        now
      ),
      false
    );
  }
  assert.equal(
    canLearnCourse(
      student({
        enrollments: [
          { courseId: "course-1", expiresAt: "2026-10-28T15:00:00Z" },
        ],
      }),
      "course-1",
      now
    ),
    true
  );
});

test("local enrollments persist through restart and concurrent registrations do not lose students", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "techeduca-access-"));
  try {
    const file = path.join(dir, "students.json");
    const store = createTrainingStudentStore(() => null, file);
    assert.deepEqual(await store.list(), []);
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.save(student({ userId: `student-${index}` }))
      )
    );
    const restarted = createTrainingStudentStore(() => null, file);
    assert.equal((await restarted.list()).length, 20);
    await restarted.save(student({ active: false }));
    const saved = await createTrainingStudentStore(() => null, file).list();
    assert.equal(saved.length, 20);
    assert.equal(
      canLearnCourse(
        saved.find(s => s.userId === "student-1"),
        "course-1",
        now
      ),
      false
    );
    await writeFile(file, "invalid JSON");
    await assert.rejects(() => restarted.list());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("database persistence uses parameterized upserts and restores course permissions", async () => {
  const records = new Map();
  const pool = {
    async query(sql, args) {
      if (sql.startsWith("insert")) {
        assert.ok(sql.includes("on conflict"));
        records.set(args[0], JSON.parse(args[1]));
        return { rows: [] };
      }
      return { rows: [...records.values()].map(payload => ({ payload })) };
    },
  };
  const store = createTrainingStudentStore(() => pool);
  await store.save(student());
  await store.save(student({ active: false }));
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.list())[0].active, false);
});

test("student UI includes unstarted learners and per-course progress without exposing the admin form to students", async () => {
  const html = await readFile(
    new URL("../techeduca/public/index.html", import.meta.url),
    "utf8"
  );
  const script = html.split("<script>")[1].split("</script>")[0];
  const definitions = script.slice(
    0,
    script.lastIndexOf('      $$("[data-view]").forEach(')
  );
  const result = vm.runInNewContext(
    definitions +
      `
    state.user={id:'admin',isAdmin:true};
    state.courses=[{id:'course-1',title:'Curso',published:true,modules:[{lessons:[{id:'lesson-1',title:'Aula',published:true,videoUrl:'/video.mp4'}]}]}];
    state.students=[{userId:'student-1',name:'<Aluno>',email:'aluno@example.com',active:true,accountActive:true,enrollments:[{courseId:'course-1',expiresAt:null}]}];
    const before = studentCard(state.students[0]);
    state.learning=[{userId:'student-1',lessonId:'lesson-1',completed:true}];
    const after = studentCard(state.students[0]);
    const roster = studentsView();
    state.user={id:'student-1',isAdmin:false};
    ({before,after,roster,learning:learningView()});
  `,
    { URLSearchParams, console }
  );
  assert.ok(result.before.includes("Ainda não iniciou"));
  assert.ok(result.before.includes("&lt;Aluno&gt;"));
  assert.ok(result.after.includes("1/1 vídeos assistidos"));
  assert.ok(result.roster.includes("Cadastrar aluno"));
  assert.ok(result.roster.includes("Validade"));
  assert.ok(!result.learning.includes("Controle de alunos"));
  assert.ok(!result.learning.includes("studentForm"));
});

test("portal routes enforce enrollments, privacy and blocking even for an existing session", async () => {
  // Load the actual route implementations without the app's database/auth runtime.
  // Authentication identity, account persistence and Zod are fixtures here; only valid
  // bodies are submitted. Access decisions, multipart handling and learning storage
  // execute the production code.
  const { stripTypeScriptTypes } = await import("node:module");
  const crypto = await import("node:crypto");
  const { promises: fs } = await import("node:fs");
  const dir = await mkdtemp(path.join(tmpdir(), "techeduca-routes-"));
  try {
    const source = await readFile(
      new URL("../server/trainingPortal.ts", import.meta.url),
      "utf8"
    );
    const body = stripTypeScriptTypes(source)
      .replace(/^import[\s\S]*?from\s*["'][^"']+["'];?\n/gm, "")
      .replace(/^export /gm, "");
    const users = [
      {
        id: "admin",
        name: "Admin",
        email: "admin@example.com",
        active: true,
        role: "admin",
        permissions: {},
      },
    ];
    const accountStore = {
      async listAppUsers() {
        return users;
      },
      async getAppUserByEmail(email) {
        return users.find(u => u.email === email) || null;
      },
      async createAppUser(input) {
        const account = {
          ...input,
          id: `user-${users.filter(u => u.id.startsWith("user-")).length + 1}`,
        };
        users.push(account);
        return account;
      },
    };
    const catalog = ["course-1", "course-2"].map(id => ({
      id,
      title: id,
      description: "",
      category: "Educação",
      color: "#000",
      modules: [
        {
          id: `module-${id}`,
          title: "Módulo",
          description: "",
          lessons: [
            {
              id: `lesson-${id}`,
              title: "Aula",
              summary: "",
              content: "",
              route: "",
              keywords: [],
              audiences: ["Consultor"],
            },
          ],
        },
      ],
    }));
    let schema;
    schema = new Proxy(() => schema, {
      get(_target, key) {
        if (key === "safeParse") return data => ({ success: true, data });
        return schema;
      },
    });
    const portal = vm.compileFunction(
      body + "\nreturn {registerTrainingPortal};",
      [
        "crypto",
        "fs",
        "express",
        "path",
        "createContext",
        "store",
        "getPgPool",
        "TRAINING_CATALOG",
        "TRAINING_COVERAGE",
        "z",
        "canLearnCourse",
        "createTrainingStudentStore",
        "process",
        "Buffer",
        "console",
      ]
    )(
      crypto,
      fs,
      { static: () => () => {} },
      path,
      async ({ req }) => ({
        user: req.identity ? users.find(u => u.id === req.identity) : null,
      }),
      accountStore,
      () => null,
      catalog,
      [],
      schema,
      canLearnCourse,
      getPool =>
        createTrainingStudentStore(getPool, path.join(dir, "students.json")),
      { cwd: () => dir },
      Buffer,
      console
    );
    const routes = new Map();
    const app = { use() {} };
    for (const method of ["get", "post", "patch", "delete"])
      app[method] = (route, handler) =>
        routes.set(`${method}:${route}`, handler);
    await portal.registerTrainingPortal(app);
    const request = async (
      method,
      route,
      identity,
      { params = {}, body = {}, raw = "", headers = {} } = {}
    ) => {
      const req = {
        identity,
        params,
        body,
        headers,
        query: {},
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(raw);
        },
      };
      const res = {
        code: 200,
        headers: {},
        status(code) {
          this.code = code;
          return this;
        },
        json(value) {
          this.body = value;
          return this;
        },
        send(value) {
          this.body = value;
          return this;
        },
        sendStatus(code) {
          this.code = code;
          return this;
        },
        setHeader(key, value) {
          this.headers[key] = value;
        },
        end(value) {
          this.body = value;
          return this;
        },
      };
      await routes.get(`${method}:${route}`)(req, res);
      return res;
    };
    const multipart = fields => {
      const boundary = "training-boundary";
      return {
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        raw:
          Object.entries(fields)
            .map(
              ([name, value]) =>
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
            )
            .join("") + `--${boundary}--\r\n`,
      };
    };
    const register = email =>
      request("post", "/techeduca/api/students", "admin", {
        body: {
          name: "Aluno",
          email,
          active: true,
          enrollments: [{ courseId: "course-1", expiresAt: null }],
        },
      });
    assert.equal(
      (await request("get", "/techeduca/api/catalog", null)).code,
      401
    );
    users.push({
      id: "existing",
      name: "Consultor existente",
      email: "existing@example.com",
      active: true,
      role: "consultant",
      permissions: { projects: true },
    });
    assert.equal(
      (await request("get", "/techeduca/api/catalog", "existing")).body.courses
        .length,
      0
    );
    assert.equal((await register("admin@example.com")).code, 400);
    assert.equal((await register("existing@example.com")).code, 201);
    assert.equal(
      users.find(u => u.id === "existing").name,
      "Consultor existente"
    );
    assert.equal(users.find(u => u.id === "existing").role, "consultant");
    assert.equal(
      users.find(u => u.id === "existing").permissions.projects,
      true
    );
    assert.equal((await register("existing@example.com")).code, 409);
    assert.equal((await register("student@example.com")).code, 201);
    assert.equal((await register("other@example.com")).code, 201);
    assert.equal(users.find(u => u.id === "user-1").role, "viewer");
    assert.ok(
      Object.values(
        users.find(u => u.id === "user-1").permissions.products
      ).every(value => value === false)
    );
    assert.equal(
      (await request("get", "/techeduca/api/students", "user-1")).code,
      403
    );
    assert.equal(
      (
        await request("patch", "/techeduca/api/students/:userId", "user-1", {
          params: { userId: "user-1" },
          body: {
            active: true,
            enrollments: [{ courseId: "course-2", expiresAt: null }],
          },
        })
      ).code,
      403
    );
    const visible = await request("get", "/techeduca/api/catalog", "user-1");
    assert.deepEqual(
      visible.body.courses.map(c => c.id),
      ["course-1"]
    );
    const edit = await request(
      "patch",
      "/techeduca/api/courses/:courseId/modules/:moduleId/lessons/:lessonId",
      "admin",
      {
        params: {
          courseId: "course-1",
          moduleId: "module-course-1",
          lessonId: "lesson-course-1",
        },
        ...multipart({
          title: "Aula",
          videoUrl: "/techeduca/api/files/video-1",
        }),
      }
    );
    assert.equal(edit.code, 200);
    const fileRoute = "/techeduca/api/files/:id";
    assert.equal(
      (await request("get", fileRoute, "user-1", { params: { id: "video-1" } }))
        .body,
      "Arquivo não disponível no modo local."
    );
    const progressRoute = "/techeduca/api/learning/:lessonId/progress";
    const uploadRoute = "/techeduca/api/learning/:lessonId/files";
    assert.equal(
      (
        await request("post", progressRoute, "user-1", {
          params: { lessonId: "lesson-course-2" },
          body: { seconds: 10, duration: 100 },
        })
      ).code,
      404
    );
    assert.equal(
      (
        await request("post", uploadRoute, "user-1", {
          params: { lessonId: "lesson-course-2" },
        })
      ).code,
      404
    );
    const raw =
      '--boundary\r\nContent-Disposition: form-data; name="kind"\r\n\r\nsubmission\r\n--boundary\r\nContent-Disposition: form-data; name="file"; filename="resposta.txt"\r\nContent-Type: text/plain\r\n\r\nMinha resposta\r\n--boundary--\r\n';
    assert.equal(
      (
        await request("post", uploadRoute, "user-1", {
          params: { lessonId: "lesson-course-1" },
          headers: { "content-type": "multipart/form-data; boundary=boundary" },
          raw,
        })
      ).code,
      201
    );
    const learning = await request("get", "/techeduca/api/learning", "user-1");
    const fileId = learning.body.records[0].id;
    const assessmentRoute = "/techeduca/api/learning/files/:id";
    assert.equal(
      (
        await request("get", assessmentRoute, "user-2", {
          params: { id: fileId },
        })
      ).code,
      404
    );
    assert.equal(
      (
        await request("get", assessmentRoute, "user-1", {
          params: { id: fileId },
        })
      ).body.toString(),
      "Minha resposta"
    );
    assert.equal(
      (
        await request("get", assessmentRoute, "admin", {
          params: { id: fileId },
        })
      ).code,
      200
    );
    const update = async (active, enrollments) =>
      request("patch", "/techeduca/api/students/:userId", "admin", {
        params: { userId: "user-1" },
        body: { active, enrollments },
      });
    await update(true, []);
    assert.equal(
      (await request("get", "/techeduca/api/catalog", "user-1")).body.courses
        .length,
      0
    );
    assert.equal(
      (await request("get", fileRoute, "user-1", { params: { id: "video-1" } }))
        .body,
      undefined
    );
    assert.equal(
      (
        await request("get", assessmentRoute, "user-1", {
          params: { id: fileId },
        })
      ).code,
      404
    );
    await update(true, [
      { courseId: "course-1", expiresAt: "2020-01-01T00:00:00Z" },
    ]);
    assert.equal(
      (await request("get", "/techeduca/api/catalog", "user-1")).body.courses
        .length,
      0
    );
    await update(false, [{ courseId: "course-1", expiresAt: null }]);
    for (const route of [
      "/techeduca/api/me",
      "/techeduca/api/catalog",
      "/techeduca/api/learning",
      fileRoute,
      assessmentRoute,
    ]) {
      assert.equal(
        (await request("get", route, "user-1", { params: { id: fileId } }))
          .code,
        403
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
