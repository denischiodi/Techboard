import { describe, expect, it } from "vitest";
import { BDCQ_TEMPLATES } from "./workflowBdcqTemplates";

describe("BDCQ template catalog", () => {
  it("covers the main SAP modules", () => {
    const modules = new Set(BDCQ_TEMPLATES.map(template => template.module));
    ["SD", "MM", "FI", "CO", "PP", "WM", "EWM", "QM", "PM", "PS"].forEach(module => expect(modules.has(module)).toBe(true));
  });

  it("does not contain duplicate questions", () => {
    const questions = BDCQ_TEMPLATES.map(template => template.question.trim().toLowerCase());
    expect(new Set(questions).size).toBe(questions.length);
  });
});
