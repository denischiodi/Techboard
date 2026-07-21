import * as XLSX from "xlsx";
import type { TechMoveScopeItem } from "./types";

type CellRow = unknown[];

const HEADER_ALIASES = {
  code: ["código", "codigo", "code", "scope item id"],
  name: ["scope item", "nome", "name", "descrição", "descricao"],
  module: ["módulo", "modulo", "module", "frente"],
  lob: ["lob sap", "lob", "linha de negócio", "linha de negocio"],
  processArea: ["processo", "process area", "área de processo", "area de processo", "ba", "business area"],
  priority: ["prioridade", "priority"],
  fitToStandard: ["fit-to-standard", "fit to standard", "fts"],
  userStory: ["user story", "história", "historia"],
  status: ["status", "phase", "fase"],
  countries: ["countries", "country", "países", "paises", "país", "pais"],
  solutionScenario: ["solution scenario id", "solution scenario", "cenário da solução", "cenario da solucao"],
  release: ["release", "versão", "versao"],
} as const;

type Field = keyof typeof HEADER_ALIASES;

export function normalizeDdaHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function findHeaderIndex(row: CellRow, field: Field) {
  const wanted = HEADER_ALIASES[field].map(normalizeDdaHeader);
  return row.findIndex(cell => wanted.includes(normalizeDdaHeader(cell)));
}

function findHeaderRow(rows: CellRow[]) {
  const inspectedRows = rows.slice(0, 25);
  let best = { index: -1, score: 0 };

  inspectedRows.forEach((row, index) => {
    const hasCode = findHeaderIndex(row, "code") >= 0;
    const hasName = findHeaderIndex(row, "name") >= 0;
    if (!hasCode || !hasName) return;

    const score = (Object.keys(HEADER_ALIASES) as Field[])
      .filter(field => findHeaderIndex(row, field) >= 0).length;
    if (score > best.score) best = { index, score };
  });

  return best.index;
}

function normalizePriority(value: string) {
  const priority = value.trim().toLowerCase();
  if (priority.startsWith("high") || priority.startsWith("alt")) return "Alta";
  if (priority.startsWith("low") || priority.startsWith("baix")) return "Baixa";
  if (priority.startsWith("medium") || priority.startsWith("med")) return "Média";
  return value || "Normal";
}

function joinDistinct(left: string, right: string) {
  return Array.from(new Set([...left.split(" / "), ...right.split(" / ")].map(value => value.trim()).filter(Boolean))).join(" / ");
}

function cellText(row: CellRow, index: number) {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

export function parseDdaWorkbook(
  data: ArrayBuffer,
  fileName: string,
  options: { now?: () => Date; idFactory?: (index: number) => string } = {},
): TechMoveScopeItem[] {
  const workbook = XLSX.read(data, { type: "array", cellDates: false });
  const candidates = workbook.SheetNames
    .map((name, order) => ({
      name,
      order,
      score: ["scope", "capabilit", "dda"].reduce((score, token) => score + (normalizeDdaHeader(name).includes(token) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const importedAt = (options.now?.() ?? new Date()).toISOString();
  const idFactory = options.idFactory ?? (index => `scope-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`);

  for (const candidate of candidates) {
    const sheet = workbook.Sheets[candidate.name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<CellRow>(sheet, { header: 1, defval: "", raw: false });
    const headerRowIndex = findHeaderRow(rows);
    if (headerRowIndex < 0) continue;

    const header = rows[headerRowIndex];
    const indexes = Object.fromEntries(
      (Object.keys(HEADER_ALIASES) as Field[]).map(field => [field, findHeaderIndex(header, field)]),
    ) as Record<Field, number>;
    const itemsByCode = new Map<string, TechMoveScopeItem>();

    rows.slice(headerRowIndex + 1).forEach((row, index) => {
      const code = cellText(row, indexes.code);
      const name = cellText(row, indexes.name);
      if (!code && !name) return;

      const lob = cellText(row, indexes.lob);
      const explicitModule = cellText(row, indexes.module);
      const processArea = cellText(row, indexes.processArea);
      const module = explicitModule || lob || "Geral";
      const resolvedProcessArea = processArea || lob || module;
      const status = cellText(row, indexes.status);
      const countries = cellText(row, indexes.countries);
      const scenario = cellText(row, indexes.solutionScenario);
      const release = cellText(row, indexes.release);
      const description = [
        lob ? `LOB SAP: ${lob}` : "",
        resolvedProcessArea ? `Processo: ${resolvedProcessArea}` : "",
        countries ? `Países: ${countries}` : "",
        scenario ? `Cenário da solução: ${scenario}` : "",
        release ? `Release: ${release}` : "",
      ].filter(Boolean).join(" | ");
      const resolvedCode = code || `DDA-${index + 1}`;
      const key = normalizeDdaHeader(resolvedCode);
      const existing = itemsByCode.get(key);

      if (existing) {
        existing.module = joinDistinct(existing.module, module);
        existing.processArea = joinDistinct(existing.processArea, resolvedProcessArea);
        existing.lob = joinDistinct(existing.lob || "", lob);
        existing.description = joinDistinct(existing.description || "", description);
        return;
      }

      itemsByCode.set(key, {
        id: idFactory(index),
        module,
        code: resolvedCode,
        name: name || code || `Scope item ${index + 1}`,
        processArea: resolvedProcessArea,
        lob,
        priority: normalizePriority(cellText(row, indexes.priority)),
        fitToStandard: cellText(row, indexes.fitToStandard),
        userStory: cellText(row, indexes.userStory),
        status,
        description,
        documentRef: fileName,
        sourceFile: fileName,
        importedAt,
        consultantName: "",
        active: true,
      });
    });

    if (itemsByCode.size) return Array.from(itemsByCode.values());
  }

  return [];
}
