import { describe, expect, it } from "vitest";
import { BDCQ_TEMPLATES } from "./workflowBdcqTemplates";

describe("BDCQ template catalog", () => {
  it("contains the complete translated SAP catalog", () => {
    expect(BDCQ_TEMPLATES).toHaveLength(1341);
    expect(
      BDCQ_TEMPLATES.every(template => template.source === "Standard SAP")
    ).toBe(true);
    expect(
      BDCQ_TEMPLATES.every(
        template => template.question !== template.questionOriginal
      )
    ).toBe(true);
  });

  it("preserves unique IDs and the principal SAP modules", () => {
    const ids = BDCQ_TEMPLATES.map(template => template.id);
    const modules = new Set(
      BDCQ_TEMPLATES.flatMap(template => template.modules)
    );
    expect(new Set(ids).size).toBe(ids.length);
    ["SD", "MM", "FI", "PP", "QM", "HCM", "TR", "EAM", "2TIER"].forEach(
      module => expect(modules.has(module)).toBe(true)
    );
  });

  it("preserves SAP IDs, levels and scope relationships", () => {
    expect(BDCQ_TEMPLATES.filter(template => template.sapId).length).toBe(1231);
    expect(
      BDCQ_TEMPLATES.filter(template => template.scopeItemKeys.length).length
    ).toBe(1113);
    expect(
      BDCQ_TEMPLATES.every(template => ["L2", "L3"].includes(template.level))
    ).toBe(true);
  });
});
