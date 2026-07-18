import { randomUUID } from "node:crypto";
import type {
  GpChecklistItem,
  GpChecklistStatus,
  GpFitToStandardCycle,
  GpFitToStandardStep,
  Project,
} from "../shared/types";
import { getPgPool } from "./db";
import {
  FIT_TO_STANDARD_STEPS,
  GP_CHECKLIST_CATALOG,
  GP_CHECKLIST_TEMPLATE_VERSION,
} from "./gpChecklistCatalog";
import {
  buildGpDocumentationTemplate,
  type GpDocumentationTemplateType,
} from "./gpChecklistDocumentation";

const memoryItems = new Map<string, GpChecklistItem[]>();
const memoryCycles = new Map<string, GpFitToStandardCycle[]>();

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toIso(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function documentationTemplateTypeFromItemKey(itemKey: unknown): GpDocumentationTemplateType | undefined {
  const match = String(itemKey || "").match(/^custom-(execution|plan|workshop|quality-gate)-/);
  return match?.[1] as GpDocumentationTemplateType | undefined;
}

function toChecklistItem(row: any): GpChecklistItem {
  return {
    ...row,
    sortOrder: Number(row.sortOrder || 0),
    dueDate: row.dueDate || "",
    evidenceUrl: row.evidenceUrl || "",
    notes: row.notes || "",
    blockingReason: row.blockingReason || "",
    completedAt: toIso(row.completedAt),
    documentationTemplate: buildGpDocumentationTemplate({
      ...row,
      templateType: documentationTemplateTypeFromItemKey(row.itemKey),
    }),
  } as GpChecklistItem;
}

function toCycleStep(row: any): GpFitToStandardStep {
  return {
    ...row,
    stepNumber: Number(row.stepNumber || 0),
    dueDate: row.dueDate || "",
    evidenceUrl: row.evidenceUrl || "",
    notes: row.notes || "",
    blockingReason: row.blockingReason || "",
    completedAt: toIso(row.completedAt),
    documentationTemplate: buildGpDocumentationTemplate({
      title: row.title,
      phase: "Explore",
      workstream: "Fit-to-Standard",
      templateType: "workshop",
    }),
  } as GpFitToStandardStep;
}

function defaultResponsible(project: Pick<Project, "manager">, workstream: string, itemType: string) {
  return workstream === "Project Management" || itemType === "Quality Gate" ? project.manager || "" : "";
}

function completedAtForStatus(currentCompletedAt: string, status: GpChecklistStatus | undefined) {
  if (status === undefined) return currentCompletedAt;
  if (status !== "Concluído") return "";
  return currentCompletedAt || nowIso();
}

export async function ensureProjectChecklist(project: Pick<Project, "id" | "manager">) {
  const pool = getPgPool();
  if (!pool) {
    const existing = memoryItems.get(project.id) || [];
    const existingKeys = new Set(existing.map(current => `${current.templateVersion}:${current.itemKey}`));
    const additions = GP_CHECKLIST_CATALOG.flatMap((catalogItem, sortOrder) => {
      const compoundKey = `${GP_CHECKLIST_TEMPLATE_VERSION}:${catalogItem.key}`;
      if (existingKeys.has(compoundKey)) return [];
      return [{
        id: createId("gpc"),
        projectId: project.id,
        templateVersion: GP_CHECKLIST_TEMPLATE_VERSION,
        itemKey: catalogItem.key,
        phase: catalogItem.phase,
        workstream: catalogItem.workstream,
        title: catalogItem.title,
        description: catalogItem.description,
        ownerRole: catalogItem.ownerRole,
        itemType: catalogItem.itemType || "Atividade",
        sortOrder,
        status: "Pendente" as const,
        responsible: defaultResponsible(project, catalogItem.workstream, catalogItem.itemType || "Atividade"),
        dueDate: "",
        evidenceUrl: "",
        notes: "",
        blockingReason: "",
        completedAt: "",
        documentationTemplate: buildGpDocumentationTemplate(catalogItem),
      }];
    });
    memoryItems.set(project.id, [...existing, ...additions]);
    return;
  }

  if (GP_CHECKLIST_CATALOG.length === 0) return;
  const columnsPerItem = 12;
  const values: unknown[] = [];
  const rows = GP_CHECKLIST_CATALOG.map((catalogItem, sortOrder) => {
    const itemType = catalogItem.itemType || "Atividade";
    values.push(
      createId("gpc"),
      project.id,
      GP_CHECKLIST_TEMPLATE_VERSION,
      catalogItem.key,
      catalogItem.phase,
      catalogItem.workstream,
      catalogItem.title,
      catalogItem.description,
      catalogItem.ownerRole,
      itemType,
      sortOrder,
      defaultResponsible(project, catalogItem.workstream, itemType),
    );
    const offset = sortOrder * columnsPerItem;
    return `(${Array.from({ length: columnsPerItem }, (_, index) => `$${offset + index + 1}`).join(",")},'Pendente')`;
  });
  await pool.query(
    `INSERT INTO "gp_checklist_items"
      ("id", "projectId", "templateVersion", "itemKey", "phase", "workstream", "title", "description", "ownerRole", "itemType", "sortOrder", "responsible", "status")
     VALUES ${rows.join(",")}
     ON CONFLICT ("projectId", "templateVersion", "itemKey") DO NOTHING`,
    values,
  );
}

export async function listProjectChecklist(project: Pick<Project, "id" | "manager">) {
  await ensureProjectChecklist(project);
  const pool = getPgPool();
  if (!pool) return [...(memoryItems.get(project.id) || [])]
    .map(toChecklistItem)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const result = await pool.query(
    `SELECT * FROM "gp_checklist_items" WHERE "projectId" = $1 ORDER BY "sortOrder", "title"`,
    [project.id],
  );
  return result.rows.map(toChecklistItem);
}

export type CreateChecklistItemInput = {
  phase: string;
  workstream: string;
  title: string;
  description: string;
  ownerRole: string;
  responsible: string;
  dueDate: string;
  documentationTemplateType: GpDocumentationTemplateType;
  includeDocumentationTemplate: boolean;
};

export async function createChecklistItem(projectId: string, input: CreateChecklistItemInput) {
  const id = createId("gpc");
  const documentationTemplate = buildGpDocumentationTemplate({
    title: input.title,
    phase: input.phase,
    workstream: input.workstream,
    templateType: input.documentationTemplateType,
  });
  const baseItem: GpChecklistItem = {
    id,
    projectId,
    templateVersion: GP_CHECKLIST_TEMPLATE_VERSION,
    itemKey: `custom-${input.documentationTemplateType}-${id}`,
    phase: input.phase,
    workstream: input.workstream,
    title: input.title,
    description: input.description,
    ownerRole: input.ownerRole,
    itemType: "Atividade",
    sortOrder: 0,
    status: "Pendente",
    responsible: input.responsible,
    dueDate: input.dueDate,
    evidenceUrl: "",
    notes: input.includeDocumentationTemplate ? documentationTemplate : "",
    blockingReason: "",
    completedAt: "",
    documentationTemplate,
  };

  const pool = getPgPool();
  if (!pool) {
    const items = memoryItems.get(projectId) || [];
    baseItem.sortOrder = Math.max(-1, ...items.map(item => item.sortOrder)) + 1;
    memoryItems.set(projectId, [...items, baseItem]);
    return baseItem;
  }

  const result = await pool.query(
    `INSERT INTO "gp_checklist_items"
      ("id", "projectId", "templateVersion", "itemKey", "phase", "workstream", "title", "description", "ownerRole", "itemType", "sortOrder", "status", "responsible", "dueDate", "notes")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Atividade',
       COALESCE((SELECT MAX("sortOrder") + 1 FROM "gp_checklist_items" WHERE "projectId" = $2), 0),
       'Pendente',$10,$11,$12)
     RETURNING *`,
    [id, projectId, GP_CHECKLIST_TEMPLATE_VERSION, baseItem.itemKey, input.phase, input.workstream,
      input.title, input.description, input.ownerRole, input.responsible, input.dueDate, baseItem.notes],
  );
  return toChecklistItem(result.rows[0]);
}

type ChecklistItemUpdate = Partial<Pick<GpChecklistItem,
  "status" | "responsible" | "dueDate" | "evidenceUrl" | "notes" | "blockingReason"
>>;

export async function updateChecklistItem(projectId: string, id: string, data: ChecklistItemUpdate) {
  const pool = getPgPool();
  const normalized: ChecklistItemUpdate = { ...data };
  if (data.status && data.status !== "Bloqueado") normalized.blockingReason = "";

  if (!pool) {
    const items = memoryItems.get(projectId) || [];
    const index = items.findIndex(current => current.id === id);
    if (index < 0) throw new Error("Atividade não encontrada");
    items[index] = {
      ...items[index],
      ...normalized,
      completedAt: completedAtForStatus(items[index].completedAt, data.status),
    };
    return items[index];
  }

  const allowed = ["status", "responsible", "dueDate", "evidenceUrl", "notes", "blockingReason"];
  const entries = Object.entries(normalized).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (entries.length === 0) throw new Error("Nenhuma alteração informada");
  const assignments = entries.map(([key], index) => `"${key}" = $${index + 3}`);
  if (data.status !== undefined) {
    const statusParameter = entries.findIndex(([key]) => key === "status") + 3;
    assignments.push(`"completedAt" = CASE WHEN $${statusParameter} = 'Concluído' THEN COALESCE("completedAt", now()) ELSE NULL END`);
  }
  assignments.push('"updatedAt" = now()');
  const result = await pool.query(
    `UPDATE "gp_checklist_items" SET ${assignments.join(", ")} WHERE "projectId" = $1 AND "id" = $2 RETURNING *`,
    [projectId, id, ...entries.map(([, value]) => value)],
  );
  if (!result.rows[0]) throw new Error("Atividade não encontrada");
  return toChecklistItem(result.rows[0]);
}

export async function listFitToStandardCycles(projectId: string): Promise<GpFitToStandardCycle[]> {
  const pool = getPgPool();
  if (!pool) return memoryCycles.get(projectId) || [];
  const [cyclesResult, stepsResult] = await Promise.all([
    pool.query(`SELECT * FROM "gp_fit_to_standard_cycles" WHERE "projectId" = $1 ORDER BY "createdAt"`, [projectId]),
    pool.query(
      `SELECT s.* FROM "gp_fit_to_standard_steps" s
       JOIN "gp_fit_to_standard_cycles" c ON c."id" = s."cycleId"
       WHERE c."projectId" = $1 ORDER BY c."createdAt", s."stepNumber"`,
      [projectId],
    ),
  ]);
  const stepsByCycle = new Map<string, GpFitToStandardStep[]>();
  for (const row of stepsResult.rows) {
    const step = toCycleStep(row);
    stepsByCycle.set(step.cycleId, [...(stepsByCycle.get(step.cycleId) || []), step]);
  }
  return cyclesResult.rows.map(row => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    module: row.module || "",
    status: row.status as GpChecklistStatus,
    steps: stepsByCycle.get(row.id) || [],
  }));
}

export async function createFitToStandardCycle(projectId: string, name: string, module: string) {
  const cycle: GpFitToStandardCycle = {
    id: createId("ftsc"), projectId, name, module, status: "Pendente", steps: [],
  };
  cycle.steps = FIT_TO_STANDARD_STEPS.map((step, index) => ({
    id: createId("ftss"), cycleId: cycle.id, stepKey: step.key, stepNumber: index + 1,
    title: step.title, status: "Pendente", responsible: "", dueDate: "", evidenceUrl: "",
    notes: "", blockingReason: "", completedAt: "",
    documentationTemplate: buildGpDocumentationTemplate({ title: step.title, phase: "Explore", workstream: "Fit-to-Standard", templateType: "workshop" }),
  }));

  const pool = getPgPool();
  if (!pool) {
    memoryCycles.set(projectId, [...(memoryCycles.get(projectId) || []), cycle]);
    return cycle;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "gp_fit_to_standard_cycles" ("id", "projectId", "name", "module", "status") VALUES ($1,$2,$3,$4,$5)`,
      [cycle.id, projectId, name, module, cycle.status],
    );
    for (const step of cycle.steps) {
      await client.query(
        `INSERT INTO "gp_fit_to_standard_steps" ("id", "cycleId", "stepKey", "stepNumber", "title", "status") VALUES ($1,$2,$3,$4,$5,$6)`,
        [step.id, cycle.id, step.stepKey, step.stepNumber, step.title, step.status],
      );
    }
    await client.query("COMMIT");
    return cycle;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type CycleStepUpdate = Partial<Pick<GpFitToStandardStep,
  "status" | "responsible" | "dueDate" | "evidenceUrl" | "notes" | "blockingReason"
>>;

function aggregateCycleStatus(steps: GpFitToStandardStep[]): GpChecklistStatus {
  const applicable = steps.filter(step => step.status !== "Não aplicável");
  if (steps.some(step => step.status === "Bloqueado")) return "Bloqueado";
  if (steps.length > 0 && applicable.length === 0) return "Não aplicável";
  if (applicable.length > 0 && applicable.every(step => step.status === "Concluído")) return "Concluído";
  if (steps.some(step => step.status === "Em validação")) return "Em validação";
  if (steps.some(step => step.status === "Em andamento" || step.status === "Concluído")) return "Em andamento";
  return "Pendente";
}

export async function updateFitToStandardStep(projectId: string, stepId: string, data: CycleStepUpdate) {
  const pool = getPgPool();
  const normalized: CycleStepUpdate = { ...data };
  if (data.status && data.status !== "Bloqueado") normalized.blockingReason = "";

  if (!pool) {
    const cycles = memoryCycles.get(projectId) || [];
    const cycle = cycles.find(current => current.steps.some(step => step.id === stepId));
    if (!cycle) throw new Error("Etapa Fit-to-Standard não encontrada");
    const index = cycle.steps.findIndex(step => step.id === stepId);
    cycle.steps[index] = {
      ...cycle.steps[index], ...normalized,
      completedAt: completedAtForStatus(cycle.steps[index].completedAt, data.status),
    };
    cycle.status = aggregateCycleStatus(cycle.steps);
    return cycle;
  }

  const entries = Object.entries(normalized).filter(([, value]) => value !== undefined);
  if (entries.length === 0) throw new Error("Nenhuma alteração informada");
  const assignments = entries.map(([key], index) => `"${key}" = $${index + 3}`);
  if (data.status !== undefined) {
    const statusParameter = entries.findIndex(([key]) => key === "status") + 3;
    assignments.push(`"completedAt" = CASE WHEN $${statusParameter} = 'Concluído' THEN COALESCE(s."completedAt", now()) ELSE NULL END`);
  }
  assignments.push('"updatedAt" = now()');

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cycleResult = await client.query(
      `SELECT c."id", c."name", c."module"
       FROM "gp_fit_to_standard_cycles" c
       JOIN "gp_fit_to_standard_steps" s ON s."cycleId" = c."id"
       WHERE c."projectId" = $1 AND s."id" = $2
       FOR UPDATE OF c`,
      [projectId, stepId],
    );
    const cycleId = cycleResult.rows[0]?.id;
    if (!cycleId) throw new Error("Etapa Fit-to-Standard não encontrada");
    await client.query(
      `UPDATE "gp_fit_to_standard_steps" s SET ${assignments.join(", ")}
       WHERE s."cycleId" = $1 AND s."id" = $2`,
      [cycleId, stepId, ...entries.map(([, value]) => value)],
    );
    const stepsResult = await client.query(
      `SELECT * FROM "gp_fit_to_standard_steps" WHERE "cycleId" = $1 ORDER BY "stepNumber"`,
      [cycleId],
    );
    const steps = stepsResult.rows.map(toCycleStep);
    const status = aggregateCycleStatus(steps);
    await client.query(
      `UPDATE "gp_fit_to_standard_cycles" SET "status" = $2, "updatedAt" = now() WHERE "id" = $1`,
      [cycleId, status],
    );
    await client.query("COMMIT");
    const cycleRow = cycleResult.rows[0];
    return {
      id: cycleId,
      projectId,
      name: cycleRow.name,
      module: cycleRow.module || "",
      status,
      steps,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function calculateChecklistProgress(items: GpChecklistItem[]) {
  const summarize = (source: GpChecklistItem[]) => {
    const applicable = source.filter(item => item.status !== "Não aplicável");
    const completed = applicable.filter(item => item.status === "Concluído").length;
    return { total: applicable.length, completed, percent: applicable.length ? Math.round((completed / applicable.length) * 100) : 0 };
  };
  const groupBy = (key: "phase" | "workstream") => items.reduce<Record<string, GpChecklistItem[]>>((groups, current) => {
    (groups[current[key]] ||= []).push(current);
    return groups;
  }, {});
  const byPhase = Object.entries(groupBy("phase")).map(([phase, source]) => ({ phase, ...summarize(source) }));
  const byWorkstream = Object.entries(groupBy("workstream")).map(([workstream, source]) => ({ workstream, ...summarize(source) }));
  return { overall: summarize(items), byPhase, byWorkstream };
}
