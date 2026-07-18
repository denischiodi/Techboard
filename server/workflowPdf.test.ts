import { describe, expect, it } from "vitest";
import { generateWorkflowPdf } from "./workflowPdf";

describe("generateWorkflowPdf", () => {
  it("creates a valid multipage A4 PDF with page labels", () => {
    const content = "# Configuração\n\n- Aprovação por alçada\n\n".repeat(140);
    const pdf = generateWorkflowPdf("DCD - Integração", content);
    const source = pdf.toString("latin1");

    expect(source.startsWith("%PDF-1.4")).toBe(true);
    expect(source).toContain("/MediaBox [0 0 595 842]");
    expect(source).toContain("Pagina 1 de");
    expect((source.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
    expect(source.endsWith("%%EOF\n")).toBe(true);
  });
});
