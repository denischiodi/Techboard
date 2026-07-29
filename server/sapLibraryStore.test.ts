import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("./db", () => ({
  getPgPool: () => ({ query }),
}));

vi.mock("./storage", () => ({
  localStoragePath: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  storagePut: vi.fn(),
}));

vi.mock("./ddaImportStore", () => ({
  reprocessDdaImportsForRelease: vi.fn(),
}));

import { listActiveScopeDetailsByCodes } from "./sapLibraryStore";

describe("SAP library active scope details", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("normalizes codes and groups assets from the active release", async () => {
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
        ],
      });

    const result = await listActiveScopeDetailsByCodes([" 1nj ", "1NJ", ""]);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`WHERE "status"='active'`),
      [["1NJ"]]
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(`WHERE "scopeId"=ANY($1::text[])`),
      [["scope-1"]]
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "scope-1",
        normalizedCode: "1NJ",
        releaseCode: "2608_BR",
        assets: [expect.objectContaining({ id: "asset-1" })],
      }),
    ]);
  });

  it("does not load assets when no active-release scope matches", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(listActiveScopeDetailsByCodes(["NOT_FOUND"])).resolves.toEqual(
      []
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not query the database when every code is empty", async () => {
    await expect(listActiveScopeDetailsByCodes(["", "   "])).resolves.toEqual(
      []
    );
    expect(query).not.toHaveBeenCalled();
  });
});
