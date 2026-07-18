import { describe, expect, it } from "vitest";
import { DCD_FEW_SHOT_EXAMPLE, getSapKnowledgeContext } from "./workflowSapKnowledge";

describe("Workflow SAP knowledge", () => {
  it("returns module-specific references with release caveat", () => {
    const context = getSapKnowledgeContext("MM");
    expect(context).toContain("ME21N");
    expect(context).toContain("validar disponibilidade");
  });

  it("does not fabricate references for unknown modules", () => {
    expect(getSapKnowledgeContext("XYZ")).toContain("Não invente");
    expect(DCD_FEW_SHOT_EXAMPLE).toContain("não copiar fatos");
  });
});
