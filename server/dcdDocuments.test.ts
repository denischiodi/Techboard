import { describe, expect, it } from "vitest";
import { generateDcdDocx, generateDcdPdf } from "./dcdDocuments";

const context = {
  projectName: "Projeto Exemplo",
  module: "SD",
  title: "DCD - SD - v3",
  version: 3,
  status: "Rascunho",
  author: "Consultor",
  generatedAt: new Date("2026-07-27T12:00:00Z"),
  templateName: "DCD V5",
};

const content = `# Escopo do documento
Documento funcional [SCOPE:item-1].

## Perguntas obrigatórias do BDCQ
- [BDCQ:q-1] Pergunta: Como será o faturamento?
- Resposta: PENDÊNCIA OBRIGATÓRIA — sem resposta registrada

## Matriz de rastreabilidade
1. Decisão vinculada ao requisito [REQUISITO:req-1].`;

describe("DCD document artifacts", () => {
  it("creates a valid DOCX package with the complete DCD content", async () => {
    const result = await generateDcdDocx(context, content);
    expect(result.subarray(0, 2).toString()).toBe("PK");
    expect(result.length).toBeGreaterThan(5_000);
  });

  it("creates a paginated PDF from the same source content", async () => {
    const result = await generateDcdPdf(context, content);
    expect(result.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.toString("latin1")).toContain("/Type /Page");
    expect(result.length).toBeGreaterThan(1_000);
  });
});
