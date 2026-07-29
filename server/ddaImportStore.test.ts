import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: Array<{ sql: string; values: unknown[] }> = [];
let pendingRows: any[] = [];

const client = {
  query: vi.fn(async (sql: string, values: unknown[] = []) => {
    queries.push({ sql, values });
    if (
      sql.includes('FROM "sap_scope_catalog" c') &&
      sql.includes("DISTINCT")
    ) {
      return { rows: [{ code: "43D" }, { code: "18J" }] };
    }
    if (
      sql.includes('FROM "scope_items"') &&
      sql.includes('"normalizedCode"')
    ) {
      return { rows: [{ id: "scope-18j", normalizedCode: "18J" }] };
    }
    if (
      sql.includes('FROM "dda_import_items" i') &&
      sql.includes("FOR UPDATE")
    ) {
      const rows = pendingRows;
      pendingRows = [];
      return { rows };
    }
    if (sql.includes('FROM "scope_items"') && sql.includes("ORDER BY")) {
      return { rows: [] };
    }
    return { rows: [] };
  }),
  release: vi.fn(),
};

vi.mock("./db", () => ({
  getPgPool: () => ({
    connect: vi.fn(async () => client),
    query: client.query,
  }),
}));

describe("DDA partial import persistence", () => {
  beforeEach(() => {
    queries.length = 0;
    pendingRows = [];
    client.query.mockClear();
    client.release.mockClear();
  });

  it("creates and updates registered codes while preserving invalid rows as pending", async () => {
    const { importDdaBatch } = await import("./ddaImportStore");
    const result = await importDdaBatch({
      projectId: "project-1",
      fileName: "DDA.xlsx",
      importedBy: "user-1",
      items: [
        { code: " 43d ", name: "Tax", module: "Finance" },
        { code: "18j", name: "Requisitioning", module: "Procurement" },
        { code: "78l", name: "Missing", module: "Finance" },
        { code: "", name: "No code", module: "Sales" },
      ],
    });

    expect(result).toMatchObject({
      created: 1,
      updated: 1,
      pending: 2,
      total: 4,
    });
    expect(
      queries.some(
        item =>
          item.sql.includes('INSERT INTO "scope_items"') &&
          item.values.includes("43D")
      )
    ).toBe(true);
    expect(
      queries.some(
        item =>
          item.sql.includes('UPDATE "scope_items"') &&
          item.values.includes("18J")
      )
    ).toBe(true);
    expect(
      queries.filter(item =>
        item.sql.includes('INSERT INTO "dda_import_items"')
      )
    ).toHaveLength(4);
    expect(queries.some(item => item.sql === "COMMIT")).toBe(true);
  });

  it("reprocesses a pending code once and remains idempotent", async () => {
    const { reprocessDdaImportsForRelease } = await import("./ddaImportStore");
    pendingRows = [
      {
        id: "pending-1",
        batchId: "batch-1",
        projectId: "project-1",
        normalizedCode: "78L",
        payload: { code: "78L", name: "Setup", module: "Finance" },
      },
    ];

    await expect(
      reprocessDdaImportsForRelease("release-1")
    ).resolves.toMatchObject({
      resolved: 1,
      batches: 1,
    });
    await expect(
      reprocessDdaImportsForRelease("release-1")
    ).resolves.toMatchObject({
      resolved: 0,
      batches: 0,
    });
    expect(
      queries.filter(item => item.sql.includes('INSERT INTO "scope_items"'))
    ).toHaveLength(1);
    expect(
      queries.some(
        item =>
          item.sql.includes('UPDATE "dda_import_items" SET') &&
          item.values.includes("created")
      )
    ).toBe(true);
  });
});
