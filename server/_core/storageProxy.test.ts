import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { bundledLegacyStoragePath } from "./storageProxy";

const historicalKey =
  "sap-library/2608_BR/1NJ/1NJ_S4CLD2608_BPD_PT_XX_a2197402.docx";

describe("recuperação de arquivos históricos da biblioteca SAP", () => {
  it("resolve o documento 1NJ original para a chave pública existente", async () => {
    const path = bundledLegacyStoragePath(historicalKey);
    expect(path).toContain(
      "server/data/sap-library-recovery/1NJ_S4CLD2608_BPD_PT_XX.docx"
    );

    const file = await readFile(path!);
    expect(file.subarray(0, 2).toString()).toBe("PK");
    expect(file.length).toBeGreaterThan(80_000);
  });

  it("não redireciona chaves desconhecidas para outro documento", () => {
    expect(bundledLegacyStoragePath("sap-library/outro.docx")).toBeNull();
  });
});
