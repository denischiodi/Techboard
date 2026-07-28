import { readFileSync } from "node:fs";
import path from "node:path";

export type BdcqTemplate = {
  id: string;
  question: string;
  questionOriginal: string;
  category: string;
  modules: string[];
  scopeItemKeys: string[];
  required: boolean;
  active: number;
  sapId: string;
  level: string;
  process: string;
  sscuiReference: string;
  area: string;
  topic: string;
  topicDefinition: string;
  solution: string;
  source: "Standard SAP";
  sourceFile: string;
  sourceRelease: string;
};

/**
 * Catálogo oficial de Business Driven Configuration Questionnaires da SAP.
 * O arquivo é gerado por scripts/build-sap-bdcq-catalog.mjs a partir dos
 * aceleradores originais e preserva a rastreabilidade até a fonte.
 */
const catalogPath = path.resolve(
  process.cwd(),
  "server/data/sap-bdcq-standard.pt-BR.json"
);

export const BDCQ_TEMPLATES = JSON.parse(
  readFileSync(catalogPath, "utf8")
) as BdcqTemplate[];
