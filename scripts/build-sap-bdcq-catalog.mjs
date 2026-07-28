import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import xlsx from "xlsx";

const positionalArgs = process.argv.slice(2).filter(value => !value.startsWith("--"));
const sourceDir =
  positionalArgs[0] ||
  "/Users/DENIS/Library/CloudStorage/OneDrive-Pessoal/Denis Chiodi/Empresas/Consultoria SAP/Seidor/SCOPE ITEMS/BDCQ";
const outputFile =
  positionalArgs[1] || "server/data/sap-bdcq-standard.pt-BR.json";
const translateEnabled = !process.argv.includes("--no-translate");

const moduleByFile = new Map([
  ["HR", "HCM"],
  ["Retail", "RET"],
  ["Sales", "SD"],
  ["Asset Management", "EAM"],
  ["Public Sector", "PSM"],
  ["Service", "CS"],
  ["Professional Services", "PS"],
  ["Sourcing and Procurement", "MM"],
  ["Quality Management", "QM"],
  ["Manufacturing", "PP"],
  ["Two Tier", "2TIER"],
  ["Treasury", "TR"],
  ["Finance", "FI"],
  ["EPPM", "EPPM"],
  ["Supply Chain", "SCM"],
  ["R and D Engineering", "PLM"],
]);

const normalizeHeader = value =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const text = value =>
  value === null || value === undefined ? "" : String(value).trim();

const isQuestionHeader = value => {
  const normalized = normalizeHeader(value);
  return normalized === "question" || /(?:^| )question(?: |$)/.test(normalized);
};

function moduleForFile(fileName) {
  for (const [label, module] of moduleByFile)
    if (fileName.includes(label)) return module;
  return "SAP";
}

function findQuestionSheet(workbook) {
  const preferred = workbook.SheetNames.find(name => {
    const normalized = normalizeHeader(name);
    return normalized.includes("accelerator") || normalized.includes("content details");
  });
  if (preferred) return preferred;
  return workbook.SheetNames.find(name => {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      defval: "",
      raw: false,
    });
    return rows.slice(0, 20).some(row => row.some(isQuestionHeader));
  });
}

function findHeader(rows) {
  for (let index = 0; index < Math.min(rows.length, 20); index++) {
    const normalized = rows[index].map(normalizeHeader);
    if (rows[index].some(isQuestionHeader)) return index;
  }
  return -1;
}

function columnIndex(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex(header =>
    candidates.some(candidate => header.includes(candidate))
  );
}

function splitScopeItems(value) {
  const ignored = new Set(["n/a", "na", "-", "not applicable"]);
  return [
    ...new Set(
      text(value)
        .split(/[,;\n/]+/)
        .map(item => item.trim())
        .filter(item => item && !ignored.has(item.toLowerCase()))
    ),
  ];
}

function sourceRelease(fileName) {
  const match = fileName.match(/^S4H_(\d+)/);
  return match ? `S4H_${match[1]}` : "SAP BDCQ";
}

async function translate(value) {
  if (!value) return "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.searchParams.set("client", "gtx");
    url.searchParams.set("sl", "en");
    url.searchParams.set("tl", "pt");
    url.searchParams.set("dt", "t");
    url.searchParams.set("q", value);
    const response = await fetch(url);
    if (response.ok) {
      const payload = await response.json();
      return payload[0].map(part => part[0]).join("").trim();
    }
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 5)
      throw new Error(`Falha ao traduzir (${response.status}): ${value.slice(0, 80)}`);
    await new Promise(resolve => setTimeout(resolve, attempt * 750));
  }
  return value;
}

async function mapConcurrent(values, concurrency, mapper) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result;
}

const fileNames = (await fs.readdir(sourceDir))
  .filter(name => name.endsWith(".xlsx") && !name.startsWith("~$"))
  .sort((a, b) => a.localeCompare(b, "pt-BR"));

const raw = [];
for (const fileName of fileNames) {
  const workbook = xlsx.readFile(path.join(sourceDir, fileName), {
    cellDates: true,
  });
  const sheetName = findQuestionSheet(workbook);
  if (!sheetName) continue;
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  const headerRow = findHeader(rows);
  if (headerRow < 0) continue;
  const headers = rows[headerRow];
  const indexes = {
    process: columnIndex(headers, [
      "solution processes",
      "line of business",
      "application subarea",
      "process",
      "industry",
    ]),
    scope: columnIndex(headers, [
      "leading scope item",
      "scope ref",
      "scope ref.",
      "ref",
    ]),
    sapId: columnIndex(headers, [
      "sap id",
      "expert configuration id",
      "business process configuration id",
    ]),
    sscui: columnIndex(headers, [
      "sscui reference",
      "configuration activity",
      "topic / configuration activity",
    ]),
    area: columnIndex(headers, [
      "business process configuration group",
      "configuration item",
      "process area",
      "area",
    ]),
    topic: columnIndex(headers, [
      "business process configuration sub group",
      "topic / configuration activity",
      "topic",
      "scenario",
    ]),
    definition: columnIndex(headers, ["topic definition", "definition"]),
    question: columnIndex(headers, ["question"]),
    level: headers.map(normalizeHeader).findIndex(header => header === "level"),
    solution: columnIndex(headers, ["solution", "systems"]),
  };
  for (const row of rows.slice(headerRow + 1)) {
    const question = text(row[indexes.question]);
    if (!question) continue;
    raw.push({
      module: moduleForFile(fileName),
      process: text(row[indexes.process]),
      scopeItemKeys: splitScopeItems(row[indexes.scope]),
      sapId: text(row[indexes.sapId]),
      sscuiReference: text(row[indexes.sscui]),
      area: text(row[indexes.area]),
      topic: text(row[indexes.topic]),
      topicDefinition: text(row[indexes.definition]),
      questionOriginal: question,
      level: text(row[indexes.level]).toUpperCase(),
      solution: text(row[indexes.solution]),
      source: "Standard SAP",
      sourceFile: fileName,
      sourceRelease: sourceRelease(fileName),
    });
  }
}

const uniqueTexts = [
  ...new Set(
    raw
      .flatMap(item => [
        item.process,
        item.sscuiReference,
        item.area,
        item.topic,
        item.topicDefinition,
        item.questionOriginal,
      ])
      .filter(Boolean)
  ),
];
console.log(
  `Extraídas ${raw.length} perguntas de ${fileNames.length} arquivos; ${uniqueTexts.length} textos únicos para tradução.`
);

const cacheFile = `${outputFile}.translations.json`;
let cache = {};
try {
  cache = JSON.parse(await fs.readFile(cacheFile, "utf8"));
} catch {}
const pending = uniqueTexts.filter(value => !cache[value]);
if (translateEnabled && pending.length) {
  let completed = 0;
  const translated = await mapConcurrent(pending, 12, async value => {
    const translatedValue = await translate(value);
    completed++;
    if (completed % 100 === 0)
      console.log(`Traduzidos ${completed}/${pending.length} textos pendentes.`);
    return translatedValue;
  });
  pending.forEach((value, index) => {
    cache[value] = translated[index];
  });
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  const cacheTemp = `${cacheFile}.tmp`;
  await fs.writeFile(cacheTemp, `${JSON.stringify(cache, null, 2)}\n`);
  await fs.rename(cacheTemp, cacheFile);
}

const catalog = raw.map((item, index) => ({
  id: `sap-bdcq-${String(index + 1).padStart(4, "0")}`,
  question: cache[item.questionOriginal] || item.questionOriginal,
  questionOriginal: item.questionOriginal,
  category: cache[item.topic] || cache[item.area] || item.topic || item.area,
  modules: [item.module],
  scopeItemKeys: item.scopeItemKeys,
  required: item.level === "L2",
  active: 1,
  sapId: item.sapId,
  level: item.level || "L3",
  process: cache[item.process] || item.process,
  sscuiReference: cache[item.sscuiReference] || item.sscuiReference,
  area: cache[item.area] || item.area,
  topic: cache[item.topic] || item.topic,
  topicDefinition: cache[item.topicDefinition] || item.topicDefinition,
  solution: item.solution,
  source: item.source,
  sourceFile: item.sourceFile,
  sourceRelease: item.sourceRelease,
}));

await fs.mkdir(path.dirname(outputFile), { recursive: true });
const outputTemp = `${outputFile}.tmp`;
await fs.writeFile(outputTemp, `${JSON.stringify(catalog, null, 2)}\n`);
await fs.rename(outputTemp, outputFile);
console.log(`Catálogo salvo em ${outputFile}.`);
