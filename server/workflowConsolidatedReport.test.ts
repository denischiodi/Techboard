import { describe, expect, it } from "vitest";
import { buildWorkflowConsolidatedMarkdown } from "./workflowConsolidatedReport";

describe("Workflow consolidated report", () => {
  it("includes every delivery section and status totals", () => {
    const markdown = buildWorkflowConsolidatedMarkdown({
      project: { name: "Projeto Alpha", client: "Cliente A", manager: "Ana" },
      requirements: [{ title: "Aprovação", status: "Validado", priority: "Alta" }],
      dcds: [{ title: "DCD MM", status: "Aprovado", version: 2, content: "## Design" }],
      gaps: [{ module: "MM", status: "Resolvido", description: "Gap 1" }],
      configurations: [{ status: "Concluído", description: "Config 1" }],
      testCases: [{ type: "Integrado", code: "TI-001", title: "Pedido ao faturamento", status: "Aprovado", expectedResult: "Fluxo concluído" }],
    });
    expect(markdown).toContain("Requisitos do cliente: 1");
    expect(markdown).toContain("DCDs: 1 (1 aprovados)");
    expect(markdown).toContain("## Gaps");
    expect(markdown).toContain("## Configurações");
    expect(markdown).toContain("Testes: 1 (1 aprovados, 0 reprovados)");
    expect(markdown).toContain("## Testes unitários e integrados");
    expect(markdown).toContain("TI-001 - Pedido ao faturamento");
  });
});
