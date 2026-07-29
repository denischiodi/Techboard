import { describe, expect, it } from "vitest";
import {
  generateMinutesDocx,
  generateMinutesPdf,
  normalizeMeetingMinutesData,
} from "./meetingMinutesDocuments";

const context = {
  projectName: "Projeto S/4HANA",
  projectCode: "PRJ-001",
  costCode: "OI-200",
  costCodeDescription: "Implantação",
  client: "Cliente",
  seidorManager: "Gerente SEIDOR",
  clientManager: "Gerente Cliente",
  seidorExecutive: "Executivo",
  sponsor: "Patrocinador",
  workshopTitle: "Workshop de Vendas",
  meetingDate: "27/07/2026",
  meetingTime: "14:00",
  author: "Consultor",
  version: 2,
  generatedAt: new Date("2026-07-27T12:00:00-03:00"),
};

const minutes = {
  summary: "Resumo",
  participants: [{ name: "Ana", company: "Cliente" }],
  topics: [{ title: "Margem", items: ["Cálculo atual em planilha"] }],
  decisions: ["Usar workflow por valor"],
  nextSteps: ["Validar cenário padrão"],
};

describe("meeting minutes documents", () => {
  it("normalizes unsafe or incomplete AI output", () => {
    expect(
      normalizeMeetingMinutesData({
        summary: " Resumo ",
        participants: ["Ana", { name: "Bruno", company: "SEIDOR" }, null],
        topics: [{ title: " Tema ", items: [" Item ", 12] }],
        decisions: "not-an-array",
      })
    ).toEqual({
      summary: "Resumo",
      participants: [
        { name: "Ana", company: "" },
        { name: "Bruno", company: "SEIDOR" },
      ],
      topics: [{ title: "Tema", items: ["Item", "12"] }],
      decisions: [],
      nextSteps: [],
    });
  });

  it("creates valid Word and PDF buffers from the same structured content", async () => {
    const [docx, pdf] = await Promise.all([
      generateMinutesDocx(context, minutes),
      generateMinutesPdf(context, minutes),
    ]);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(docx.length).toBeGreaterThan(5_000);
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});
