import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const clientQuery = vi.fn();
const release = vi.fn();
const connect = vi.fn(async () => ({ query: clientQuery, release }));

vi.mock("./db", () => ({
  getPgPool: () => ({ query, connect }),
}));

describe("workflow PostgreSQL persistence", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    clientQuery.mockReset(); release.mockReset(); connect.mockClear();
  });

  it("lists workflow records by project", async () => {
    const db = await import("./routers/workflowDb");
    await db.listScopeItems("project-1");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "scope_items" WHERE "projectId" = $1'),
      ["project-1"],
    );
  });

  it("applies bounded offset pagination when requested", async () => {
    const db = await import("./routers/workflowDb");
    await db.listGaps("project-1", { limit: 50, offset: 100 });
    expect(query.mock.calls[0][0]).toContain("LIMIT $2 OFFSET $3");
    expect(query.mock.calls[0][1]).toEqual(["project-1", 50, 100]);
  });

  it("loads BDCQ answers only for the questions visible on the current page", async () => {
    const db = await import("./routers/workflowDb");
    await db.listBdcqAnswersForQuestions("project-1", ["q-1", "q-2"]);
    expect(query.mock.calls[0][0]).toContain('"questionId" = ANY($2::varchar[])');
    expect(query.mock.calls[0][1]).toEqual(["project-1", ["q-1", "q-2"]]);
  });

  it("serializes JSON columns when creating a workshop", async () => {
    const db = await import("./routers/workflowDb");
    query.mockResolvedValueOnce({ rows: [{ id: "workshop-1" }] });
    await db.createWorkshop({
      id: "workshop-1", projectId: "project-1", title: "Descoberta",
      participants: ["Ana"], agenda: ["Processo atual"],
    });
    const values = query.mock.calls[0][1] as unknown[];
    expect(values).toContain(JSON.stringify(["Ana"]));
    expect(values).toContain(JSON.stringify(["Processo atual"]));
  });

  it("ignores non-whitelisted fields during updates", async () => {
    const db = await import("./routers/workflowDb");
    await db.updateGap("gap-1", { status: "Resolvido", projectId: "other-project" });
    expect(query.mock.calls[0][0]).toContain('"status" = $2');
    expect(query.mock.calls[0][0]).not.toContain('"projectId"');
    expect(query.mock.calls[0][1]).toEqual(["gap-1", "Resolvido"]);
  });

  it("persists client requirements with their workshop link", async () => {
    const db = await import("./routers/workflowDb");
    query.mockResolvedValueOnce({ rows: [{ id: "req-1" }] });
    await db.createClientRequirement({
      id: "req-1", projectId: "project-1", workshopId: "workshop-1",
      title: "Aprovação", description: "Aprovar pedidos por alçada",
    });
    expect(query.mock.calls[0][0]).toContain('INSERT INTO "client_requirements"');
    expect(query.mock.calls[0][1]).toContain("workshop-1");
  });

  it("finds a cached DCD using the source hash", async () => {
    const db = await import("./routers/workflowDb");
    query.mockResolvedValueOnce({ rows: [{ id: "dcd-1", sourceHash: "hash-1" }] });
    const cached = await db.findDcdBySourceHash("project-1", "hash-1");
    expect(query.mock.calls[0][0]).toContain('"sourceHash" = $2');
    expect(query.mock.calls[0][1]).toEqual(["project-1", "hash-1"]);
    expect(cached).toMatchObject({ id: "dcd-1" });
  });

  it("selects the latest DCD version for a module", async () => {
    const db = await import("./routers/workflowDb");
    query.mockResolvedValueOnce({ rows: [{ id: "dcd-2", version: 2 }] });
    await db.getLatestDcdByModule("project-1", "MM");
    expect(query.mock.calls[0][0]).toContain('ORDER BY "version" DESC');
    expect(query.mock.calls[0][1]).toEqual(["project-1", "MM"]);
  });

  it("stores the previous BDCQ answer in the same transaction", async () => {
    const db = await import("./routers/workflowDb");
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "answer-1", questionId: "q-1", projectId: "project-1", answer: "Anterior", answeredBy: "Ana", attachments: [] }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "answer-1", answer: "Nova" }] })
      .mockResolvedValueOnce({ rows: [] });
    await db.updateBdcqAnswerWithHistory("answer-1", { answer: "Nova" }, "history-1", "Gestor");
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes('INSERT INTO "bdcq_answer_history"'))).toBe(true);
    expect(clientQuery.mock.calls.some(call => String(call[0]).includes('UPDATE "bdcq_answers"'))).toBe(true);
    expect(release).toHaveBeenCalled();
  });
});
