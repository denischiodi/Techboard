import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: string[] = [];
const query = vi.fn();

vi.mock("./db", () => ({
  getPgPool: () => ({ query }),
}));

vi.mock("./storage", () => ({
  localStoragePath: vi.fn(),
  storageDeleteLocal: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./ddaImportStore", () => ({
  reprocessDdaImportsForRelease: vi.fn(),
}));

import {
  createManualScope,
  listActiveScopeDetailsByCodes,
} from "./sapLibraryStore";

describe("cadastro manual da biblioteca SAP", () => {
  beforeEach(() => {
    queries.length = 0;
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
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
  });

  it("cadastra scope item sem exigir documento Word", async () => {
    const created = await createManualScope({
      code: "1FD",
      name: "Capacitação de pessoal",
      module: "HCM",
      userId: "admin-1",
    });

    expect(created).toMatchObject({ id: "created-scope", code: "1FD" });
    expect(
      queries.some(sql => sql.includes('INSERT INTO "sap_scope_catalog"'))
    ).toBe(true);
    expect(
      queries.some(sql => sql.includes('INSERT INTO "sap_scope_assets"'))
    ).toBe(false);
  });
});

describe("consulta do cadastro SAP da release ativa", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("normaliza códigos e agrupa os arquivos do scope item", async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "scope-1",
            code: "1nj",
            name: "Gestão de Responsabilidades",
            module: "Platform",
            processArea: "Governança",
            summary: "Resumo oficial",
            releaseCode: "2608_BR",
          },
          {
            id: "scope-manual",
            code: "1NJ",
            name: "Cadastro complementar",
            module: "Platform",
            processArea: "Governança",
            summary: "Resumo manual",
            releaseCode: "__MANUAL_BR__",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "asset-1",
            scopeId: "scope-1",
            fileName: "1NJ_PT_BR.pdf",
            language: "PT_BR",
            url: "/arquivo/1",
          },
          {
            id: "asset-manual",
            scopeId: "scope-manual",
            fileName: "1NJ_COMPLEMENTAR.docx",
            language: "PT_BR",
            url: "/arquivo/manual",
          },
        ],
      });

    const result = await listActiveScopeDetailsByCodes([" 1nj ", "1NJ", ""]);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`WHERE "status"='active'`),
      [["1NJ"], "__MANUAL_BR__"]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`WHERE "scopeId"=ANY($1::text[])`),
      [["scope-1", "scope-manual"]]
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "scope-1",
        normalizedCode: "1NJ",
        releaseCode: "2608_BR",
        includesManualRegistry: true,
        assets: [
          expect.objectContaining({ id: "asset-1" }),
          expect.objectContaining({ id: "asset-manual" }),
        ],
      }),
    ]);
  });

  it("não consulta arquivos quando nenhum código corresponde", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(listActiveScopeDetailsByCodes(["NOT_FOUND"])).resolves.toEqual(
      []
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("não consulta o banco quando todos os códigos estão vazios", async () => {
    await expect(listActiveScopeDetailsByCodes(["", "   "])).resolves.toEqual(
      []
    );
    expect(query).not.toHaveBeenCalled();
  });
});
