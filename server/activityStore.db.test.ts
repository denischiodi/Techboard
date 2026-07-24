import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: Array<{ sql: string; params: unknown[] }> = [];

const database = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.startsWith('SELECT * FROM "activities"')) {
      return {
        rows: [
          {
            id: "act-existing",
            status: "A fazer",
            priority: "Média",
          },
        ],
      };
    }
    if (sql.startsWith("SELECT COUNT(*)::text")) {
      return { rows: [{ count: "0" }] };
    }
    return { rows: [] };
  }),
};

vi.mock("./db", () => ({
  getPgPool: () => database,
}));

describe("upsert de atividade automática no PostgreSQL", () => {
  beforeEach(() => {
    queries.length = 0;
    database.query.mockClear();
  });

  it("separa o status do indicador de conclusão para evitar tipos incompatíveis", async () => {
    const { upsertSourceActivity } = await import("./activityStore");

    await upsertSourceActivity({
      scope: "project",
      projectId: "p1",
      title: "Atividade padrão",
      status: "Concluída",
      priority: "Média",
      creatorUserId: "u1",
      sourceType: "activity_template",
      sourceKey: "template:p1:once",
    });

    const update = queries.find(item =>
      item.sql.startsWith('UPDATE "activities"')
    );
    expect(update?.sql).toContain("$10::boolean");
    expect(update?.params[3]).toBe("Concluída");
    expect(update?.params[9]).toBe(true);
  }, 30_000);
});
