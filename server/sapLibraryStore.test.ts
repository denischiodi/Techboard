import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: string[] = [];
const query = vi.fn(async (sql: string) => {
  queries.push(sql);
  if (sql.includes('FROM "sap_content_releases"')) {
    return { rows: [{ id: "manual-release" }] };
  }
  if (sql.includes('SELECT 1 FROM "sap_scope_catalog"')) {
    return { rows: [] };
  }
  if (sql.includes('SELECT * FROM "sap_scope_catalog"')) {
    return { rows: [{ id: "created-scope", code: "1FD" }] };
  }
  return { rows: [] };
});

vi.mock("./db", () => ({
  getPgPool: () => ({ query }),
}));

describe("cadastro manual da biblioteca SAP", () => {
  beforeEach(() => {
    queries.length = 0;
    query.mockClear();
  });

  it("cadastra scope item sem exigir documento Word", async () => {
    const { createManualScope } = await import("./sapLibraryStore");
    const created = await createManualScope({
      code: "1FD",
      name: "Capacitação de pessoal",
      module: "HCM",
      userId: "admin-1",
    });

    expect(created).toMatchObject({ id: "created-scope", code: "1FD" });
    expect(queries.some(sql => sql.includes('INSERT INTO "sap_scope_catalog"'))).toBe(true);
    expect(queries.some(sql => sql.includes('INSERT INTO "sap_scope_assets"'))).toBe(false);
  });
});
