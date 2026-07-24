import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: Array<{ sql: string; params: unknown[] }> = [];
let current: Record<string, unknown>;

const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    if (sql.includes('FROM "delivery_items" i')) {
      return { rows: [current] };
    }
    if (sql.includes('UPDATE "delivery_items"')) {
      if (sql.includes('"archivedAt"=now()')) {
        current = {
          ...current,
          archivedAt: "2026-07-24T12:00:00.000Z",
          archivedBy: params[2],
        };
        return { rows: [current] };
      }
      if (sql.includes('"title"=$2'))
        current = { ...current, title: params[1] };
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE "delivery_raid_items" SET')) {
      current = {
        ...current,
        probability: params[1],
        impact: params[2],
        severity: params[3],
      };
      return { rows: [] };
    }
    return { rows: [] };
  }),
  release: vi.fn(),
};

const pool = {
  connect: vi.fn(async () => client),
};

vi.mock("./db", () => ({
  getPgPool: () => pool,
}));

describe("edição e arquivamento de RAID", () => {
  beforeEach(() => {
    queries.length = 0;
    client.query.mockClear();
    client.release.mockClear();
    current = {
      id: "di-risk-1",
      projectId: "p1",
      code: "RSK-000001",
      kind: "risk",
      title: "Risco original",
      probability: 2,
      impact: 3,
      severity: 6,
    };
  });

  it("atualiza os dois registros e recalcula a severidade", async () => {
    const { updateRaid } = await import("./deliveryMasterStore");

    const result = await updateRaid("p1", "di-risk-1", {
      title: "Risco atualizado",
      probability: 4,
      impact: 5,
    });

    const raidUpdate = queries.find(item =>
      item.sql.startsWith('UPDATE "delivery_raid_items"')
    );
    expect(raidUpdate?.params).toEqual(["di-risk-1", 4, 5, 20]);
    expect(result.item.title).toBe("Risco atualizado");
    expect(result.item.severity).toBe(20);
    expect(queries.some(item => item.sql === "COMMIT")).toBe(true);
  });

  it("exige o código correto antes de arquivar", async () => {
    const { archiveRaid } = await import("./deliveryMasterStore");

    await expect(
      archiveRaid("p1", "di-risk-1", "u1", "RSK-ERRADO")
    ).rejects.toThrow("Digite RSK-000001 para confirmar");

    expect(queries.some(item => item.sql.includes('"archivedAt"=now()'))).toBe(
      false
    );
    expect(queries.some(item => item.sql === "ROLLBACK")).toBe(true);
  });

  it("arquiva sem excluir fisicamente e preserva o código", async () => {
    const { archiveRaid } = await import("./deliveryMasterStore");

    const result = await archiveRaid("p1", "di-risk-1", "u1", "RSK-000001");

    const archive = queries.find(item =>
      item.sql.includes('"archivedAt"=now()')
    );
    expect(archive?.params).toEqual(["di-risk-1", "p1", "u1"]);
    expect(result.before.code).toBe("RSK-000001");
    expect(result.item.archivedBy).toBe("u1");
  });
});

describe("delivery master applicability", () => {
  const template = (patch: Record<string, unknown> = {}) => ({
    id: "template-1",
    active: true,
    projectIds: [],
    modules: [],
    scopeItemKeys: [],
    ...patch,
  });
  const scopeItems = [
    { id: "scope-fi", key: "J01", module: "FI" },
    { id: "scope-mm", key: "J45", module: "MM" },
    { id: "scope-mm-2", key: "J46", module: "MM" },
  ];

  it("gera uma ocorrência geral ou uma por módulo", async () => {
    const { applicableOccurrences } = await import("./deliveryMasterStore");
    expect(
      applicableOccurrences(template(), "project-1", ["FI", "MM"], scopeItems)
    ).toHaveLength(1);
    expect(
      applicableOccurrences(
        template({ modules: ["FI", "MM"] }),
        "project-1",
        ["FI", "MM", "SD"],
        scopeItems
      ).map(item => item.module)
    ).toEqual(["FI", "MM"]);
  });

  it("gera uma ocorrência por scope item e exige o módulo configurado", async () => {
    const { applicableOccurrences } = await import("./deliveryMasterStore");
    expect(
      applicableOccurrences(
        template({ scopeItemKeys: ["J45", "J46"] }),
        "project-1",
        ["FI", "MM"],
        scopeItems
      ).map(item => item.scopeItemIds[0])
    ).toEqual(["scope-mm", "scope-mm-2"]);
    const constrained = applicableOccurrences(
      template({ modules: ["FI"], scopeItemKeys: ["J01", "J45"] }),
      "project-1",
      ["FI", "MM"],
      scopeItems
    );
    expect(constrained).toHaveLength(1);
    expect(constrained[0].scopeItemIds).toEqual(["scope-fi"]);
  });
});
