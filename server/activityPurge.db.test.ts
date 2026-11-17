import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, pool } = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  return { client, pool: { connect: vi.fn(async () => client) } };
});
vi.mock("./db", () => ({ getPgPool: () => pool }));

describe("exclusão definitiva de atividades arquivadas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith('SELECT "id"') || sql.startsWith('DELETE FROM')
        ? [{ id: "archived-visible" }] : [],
    }));
  });

  it("restringe a exclusão aos arquivados visíveis e mantém a supressão da origem", async () => {
    const { adminPurgeArchivedActivities } = await import("./activityStore");
    const result = await adminPurgeArchivedActivities(
      ["archived-visible", "active", "private-other", "archived-visible"],
      { id: "admin", name: "Admin" }
    );
    expect(result).toEqual({ deleted: 1 });
    const calls = client.query.mock.calls;
    const select = calls.find(([sql]) => sql.startsWith('SELECT "id"'))!;
    expect(select[0]).toContain('"archivedAt" IS NOT NULL');
    expect(select[0]).toContain('"ownerUserId" = $2');
    expect(select[0]).toContain("FOR UPDATE");
    expect(select[1]).toEqual([["archived-visible", "active", "private-other"], "admin"]);
    const suppress = calls.find(([sql]) => sql.includes('INSERT INTO "activity_source_suppressions"'))!;
    const deletion = calls.find(([sql]) => sql.startsWith('DELETE FROM'))!;
    expect(suppress[1]).toEqual([["archived-visible"], "admin"]);
    expect(deletion[1]).toEqual([["archived-visible"]]);
    expect(calls.indexOf(suppress)).toBeLessThan(calls.indexOf(deletion));
    expect(calls.at(-1)?.[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("desfaz a transação se a exclusão falhar", async () => {
    const { adminPurgeArchivedActivities } = await import("./activityStore");
    client.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('DELETE FROM')) throw new Error("database failure");
      return { rows: sql.startsWith('SELECT "id"') ? [{ id: "archived-visible" }] : [] };
    });
    await expect(adminPurgeArchivedActivities(["archived-visible"], { id: "admin", name: "Admin" }))
      .rejects.toThrow("database failure");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
