import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseDdaWorkbook } from "../shared/ddaImport";

function workbookBuffer(sheetName: string, rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function parse(fileName: string, sheetName: string, rows: unknown[][]) {
  return parseDdaWorkbook(workbookBuffer(sheetName, rows), fileName, {
    now: () => new Date("2026-07-21T12:00:00.000Z"),
    idFactory: index => `scope-${index}`,
  });
}

describe("parseDdaWorkbook", () => {
  it("imports the SAP DDA export with title rows and English headers", () => {
    const items = parse("DDA Export.xlsx", "DDA Capabilities", [
      ["SAP Cloud ERP - Digital Discovery Assessment (DDA) Export"],
      ["Assessment: Example"],
      ["LOB", "BA", "Code", "Name", "Priority", "Phase", "Countries", "Solution Scenario ID", "Release"],
      ["Finance", "Financial Operations", "43D", "Integration with External Tax Calculation Engines", "High", "First", "br", "SolS-013", "2602"],
      ["Procurement", "Operational Procurement", "18J", "Requisitioning", "Medium", "First", "br", "SolS-013", "2602"],
      ["Procurement", "Invoice Management", "18J", "Requisitioning", "Medium", "First", "br", "SolS-013", "2602"],
    ]);

    expect(items).toHaveLength(2);
    expect(items.find(item => item.code === "43D")).toMatchObject({
      name: "Integration with External Tax Calculation Engines",
      module: "Finance",
      processArea: "Financial Operations",
      priority: "Alta",
      status: "First",
    });
    expect(items.find(item => item.code === "18J")?.processArea).toContain("Operational Procurement");
    expect(new Set(items.map(item => item.code)).size).toBe(items.length);
  });

  it("keeps importing the curated Portuguese Scope Items model", () => {
    const items = parse("DDA.xlsx", "Scope Items", [
      ["Código", "Scope Item", "Módulo", "LOB SAP", "Processo", "Prioridade", "Fit-to-Standard", "User Story", "Status"],
      ["1NJ", "Gestão de Responsabilidades", "Platform", "Application Platform", "Governança", "Alta", "", "", ""],
      ["1FD", "Capacitação de Usuários", "Platform", "Data Mgmt", "Treinamento", "Alta", "", "", ""],
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      code: "1NJ",
      name: "Gestão de Responsabilidades",
      module: "Platform",
      lob: "Application Platform",
      processArea: "Governança",
      priority: "Alta",
    });
  });
});
