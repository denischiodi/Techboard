import { nanoid } from "nanoid";
import { getPgPool } from "./db";
import * as deliveryStore from "./deliveryMasterStore";
import * as workflowDb from "./routers/workflowDb";
import * as plannerStore from "./plannerStore";
import * as activityStore from "./activityStore";

type Summary = {
  evaluated: number;
  applicable: number;
  created: number;
  updated: number;
  preserved: number;
  blocked: number;
  outOfScope: number;
  failed: number;
  errors: Array<{ projectId: string; message: string }>;
};

const emptySummary = (): Summary => ({
  evaluated: 0, applicable: 0, created: 0, updated: 0, preserved: 0,
  blocked: 0, outOfScope: 0, failed: 0, errors: [],
});

let publicationQueue = Promise.resolve();

function normalize(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLocaleLowerCase("pt-BR");
}

function inactiveProject(project: any) {
  const status = normalize(project.status);
  return status.includes("conclu") || status.includes("cancel");
}

function typeToTarget(type: string) {
  if (type === "bdcq") return "bdcq_question";
  if (type === "workshop") return "workshop";
  if (type === "configuration") return "configuration";
  if (type === "gap") return "gap";
  if (["unit_test", "cycle_1", "cycle_2"].includes(type)) return "test_case";
  if (type === "activity") return "gp_activity";
  return "delivery_item";
}

function testType(type: string) {
  if (type === "cycle_1") return "Ciclo 1";
  if (type === "cycle_2") return "Ciclo 2";
  return "Unitário";
}

async function stageIsComplete(projectId: string, type: string, stage: string) {
  const pool = getPgPool();
  if (!pool) return false;
  let sql = "";
  const params: unknown[] = [projectId];
  if (type === "bdcq") {
    sql = `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE length(trim(COALESCE(a."answer",'')))>0)::int done
      FROM "bdcq_questions" q LEFT JOIN "bdcq_answers" a ON a."questionId"=q."id" AND a."archivedAt" IS NULL
      WHERE q."projectId"=$1 AND q."archivedAt" IS NULL`;
  } else if (type === "workshop") {
    sql = `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE "status" IN ('Realizado','Concluído'))::int done
      FROM "workshops" WHERE "projectId"=$1 AND "archivedAt" IS NULL`;
  } else if (type === "configuration") {
    sql = `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE "status" IN ('Concluído','Concluída'))::int done
      FROM "configurations" WHERE "projectId"=$1 AND "archivedAt" IS NULL`;
  } else if (type === "gap") {
    sql = `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE "status" IN ('Resolvido','Aceito'))::int done
      FROM "gaps" WHERE "projectId"=$1 AND "archivedAt" IS NULL`;
  } else if (["unit_test", "cycle_1", "cycle_2"].includes(type)) {
    params.push(testType(type));
    sql = `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE "status"='Aprovado')::int done
      FROM "workflow_test_cases" WHERE "projectId"=$1 AND "type"=$2 AND "archivedAt" IS NULL`;
  } else if (type === "activity") {
    sql = `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE "status"='Concluída')::int done
      FROM "activities" WHERE "projectId"=$1 AND "sourceType"='delivery_template' AND "archivedAt" IS NULL`;
  } else {
    params.push(stage);
    sql = `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE "status" IN ('completed','approved'))::int done
      FROM "delivery_items" WHERE "projectId"=$1 AND ("stage"=$2 OR "type"=$2) AND "archivedAt" IS NULL`;
  }
  const result = await pool.query(sql, params);
  const row = result.rows[0] || {};
  return Number(row.total || 0) > 0 && Number(row.done || 0) >= Number(row.total || 0);
}

async function existingMaterialization(templateId: string, projectId: string, occurrenceKey: string) {
  const pool = getPgPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT * FROM "delivery_materializations" WHERE "templateId"=$1 AND "projectId"=$2 AND "occurrenceKey"=$3`,
    [templateId, projectId, occurrenceKey],
  );
  return result.rows[0] || null;
}

async function saveMaterialization(input: {
  templateId: string; templateVersion: number; projectId: string; occurrenceKey: string;
  targetType: string; targetId?: string; state: string; reason?: string; confirmed?: boolean;
}) {
  const pool = getPgPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO "delivery_materializations"
      ("id","templateId","templateVersion","projectId","occurrenceKey","targetType","targetId","state","reason","publishedAt","confirmedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $8='current' THEN now() ELSE NULL END,CASE WHEN $10 THEN now() ELSE NULL END)
     ON CONFLICT ("templateId","projectId","occurrenceKey") DO UPDATE SET
      "templateVersion"=EXCLUDED."templateVersion","targetType"=EXCLUDED."targetType",
      "targetId"=CASE WHEN EXCLUDED."targetId"<>'' THEN EXCLUDED."targetId" ELSE "delivery_materializations"."targetId" END,
      "state"=EXCLUDED."state","reason"=EXCLUDED."reason",
      "publishedAt"=CASE WHEN EXCLUDED."state"='current' THEN now() ELSE "delivery_materializations"."publishedAt" END,
      "confirmedAt"=CASE WHEN $10 THEN now() ELSE "delivery_materializations"."confirmedAt" END,"updatedAt"=now()`,
    [`dm_${nanoid(20)}`, input.templateId, input.templateVersion, input.projectId,
      input.occurrenceKey, input.targetType, input.targetId || "", input.state,
      input.reason || "", input.confirmed || false],
  );
}

function dueDate(startDate: string, offset: number) {
  if (!startDate) return "";
  const date = new Date(`${startDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(offset || 0));
  return date.toISOString().slice(0, 10);
}

function activityOccurrence(template: any, occurrence: any) {
  const payload = template.payload || {};
  if (payload.recurrence === "weekly") {
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const period = monday.toISOString().slice(0, 10);
    const target = new Date(`${period}T12:00:00Z`);
    target.setUTCDate(target.getUTCDate() + ((Number(payload.weekday ?? 1) + 6) % 7));
    return { ...occurrence, key: `${occurrence.key}|week-${period}`, dueDate: target.toISOString().slice(0, 10) };
  }
  if (payload.recurrence === "monthly") {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(Math.max(Number(payload.monthDay || 1), 1), lastDay);
    const period = `${year}-${String(month + 1).padStart(2, "0")}`;
    return { ...occurrence, key: `${occurrence.key}|month-${period}`, dueDate: `${period}-${String(day).padStart(2, "0")}` };
  }
  return occurrence;
}

async function materializeOperational(template: any, project: any, occurrence: any, existing: any) {
  const payload = template.payload || {};
  const scopeId = occurrence.scopeItemIds?.[0] || "";
  const module = occurrence.module || "";
  const initialOnly = async (table: string, id: string, initialStatuses: string[]) => {
    const pool = getPgPool();
    if (!pool || !id) return true;
    const result = await pool.query(`SELECT "status" FROM "${table}" WHERE "id"=$1 AND "archivedAt" IS NULL`, [id]);
    return !result.rows[0] || initialStatuses.includes(String(result.rows[0].status));
  };
  const legacyEquivalent = async (table: string, textColumn: string, textValue: string, moduleValue = module) => {
    const pool = getPgPool();
    if (!pool) return null;
    const supportsModule = ["bdcq_questions", "workshops", "configurations", "gaps", "workflow_test_cases"].includes(table);
    const result = await pool.query(
      `SELECT "id" FROM "${table}" WHERE "projectId"=$1 AND "archivedAt" IS NULL
       AND lower(trim("${textColumn}"))=lower(trim($2))
       ${supportsModule ? `AND COALESCE("module",'')=COALESCE($3,'')` : ""}
       ORDER BY "createdAt" LIMIT 1`,
      supportsModule ? [project.id, textValue, moduleValue || (table === "bdcq_questions" ? "Geral" : "")] : [project.id, textValue],
    );
    return result.rows[0]?.id || null;
  };

  if (template.type === "bdcq") {
    if (!existing) {
      const legacyId = await legacyEquivalent("bdcq_questions", "question", String(payload.question || template.title));
      if (legacyId) return { id: legacyId, state: "preserved" };
    }
    if (existing?.targetId) {
      const pool = getPgPool();
      const answers = await pool?.query(`SELECT 1 FROM "bdcq_answers" WHERE "questionId"=$1 AND "archivedAt" IS NULL LIMIT 1`, [existing.targetId]);
      if (answers?.rowCount) return { id: existing.targetId, state: "preserved" };
      await workflowDb.updateBdcqQuestion(existing.targetId, {
        question: String(payload.question || template.title), category: String(payload.category || ""),
        module: module || "Geral", scopeItemIds: occurrence.scopeItemIds || [],
        sortOrder: template.sortOrder, required: template.required,
      } as any);
      return { id: existing.targetId, state: "updated" };
    }
    const row: any = await workflowDb.createBdcqQuestion({
      id: `q_${nanoid(20)}`, projectId: project.id, module: module || "Geral",
      category: String(payload.category || ""), question: String(payload.question || template.title),
      templateId: template.id, scopeItemIds: occurrence.scopeItemIds || [],
      required: template.required, isDefault: 1, sortOrder: template.sortOrder,
    } as any);
    return { id: row.id, state: "created" };
  }

  if (template.type === "workshop") {
    if (!existing) {
      const legacyId = await legacyEquivalent("workshops", "title", template.title);
      if (legacyId) return { id: legacyId, state: "preserved" };
    }
    if (existing?.targetId) {
      if (!(await initialOnly("workshops", existing.targetId, ["Planejado"])))
        return { id: existing.targetId, state: "preserved" };
      await workflowDb.updateWorkshop(existing.targetId, {
        title: template.title, modules: module ? [module] : [], module,
        scopeItemIds: occurrence.scopeItemIds || [], objective: payload.objective || template.description,
        content: payload.content || template.instructions, duration: payload.duration || "",
        agenda: payload.agenda || [], expectedOutcomes: payload.expectedOutcomes || [],
        prerequisites: payload.prerequisites || [], requiredRoles: payload.requiredRoles || [],
      } as any);
      return { id: existing.targetId, state: "updated" };
    }
    const row: any = await workflowDb.createWorkshop({
      id: `ws_${nanoid(20)}`, projectId: project.id, title: template.title, module,
      modules: module ? [module] : [], scopeItemIds: occurrence.scopeItemIds || [],
      objective: payload.objective || template.description, content: payload.content || template.instructions,
      duration: payload.duration || "", agenda: payload.agenda || [],
      expectedOutcomes: payload.expectedOutcomes || [], prerequisites: payload.prerequisites || [],
      requiredRoles: payload.requiredRoles || [], presentationFiles: payload.presentationFiles || [],
      templateId: template.id, source: "delivery_template", status: "Planejado",
    } as any);
    return { id: row.id, state: "created" };
  }

  if (template.type === "configuration") {
    if (!existing) {
      const legacyId = await legacyEquivalent("configurations", "description", template.description || template.title);
      if (legacyId) return { id: legacyId, state: "preserved" };
    }
    if (existing?.targetId) {
      if (!(await initialOnly("configurations", existing.targetId, ["Pendente"])))
        return { id: existing.targetId, state: "preserved" };
      await workflowDb.updateConfiguration(existing.targetId, {
        module, category: payload.category || "Configuração",
        description: template.description || template.title, scopeItemIds: occurrence.scopeItemIds || [],
      } as any);
      return { id: existing.targetId, state: "updated" };
    }
    const row: any = await workflowDb.createConfiguration({
      id: `cfg_${nanoid(20)}`, projectId: project.id, module,
      category: payload.category || "Configuração", description: template.description || template.title,
      status: "Pendente", templateId: template.id, scopeItemIds: occurrence.scopeItemIds || [],
      source: "delivery_template",
    } as any);
    return { id: row.id, state: "created" };
  }

  if (template.type === "gap") {
    if (!existing) {
      const legacyId = await legacyEquivalent("gaps", "description", template.description || template.title);
      if (legacyId) return { id: legacyId, state: "preserved" };
    }
    if (existing?.targetId) {
      if (!(await initialOnly("gaps", existing.targetId, ["Aberto"])))
        return { id: existing.targetId, state: "preserved" };
      await workflowDb.updateGap(existing.targetId, {
        module, modules: module ? [module] : [], description: template.description || template.title,
        impact: payload.impact || "Médio", responsible: payload.responsible || "",
      } as any);
      return { id: existing.targetId, state: "updated" };
    }
    const row: any = await workflowDb.createGap({
      id: `gap_${nanoid(20)}`, projectId: project.id, module, modules: module ? [module] : [],
      description: template.description || template.title, impact: payload.impact || "Médio",
      responsible: payload.responsible || "", resolution: payload.strategy || "", status: "Aberto",
    } as any);
    return { id: row.id, state: "created" };
  }

  if (["unit_test", "cycle_1", "cycle_2"].includes(template.type)) {
    if (!existing) {
      const legacyId = await legacyEquivalent("workflow_test_cases", "title", template.title);
      if (legacyId) return { id: legacyId, state: "preserved" };
    }
    if (existing?.targetId) {
      if (!(await initialOnly("workflow_test_cases", existing.targetId, ["Não iniciado"])))
        return { id: existing.targetId, state: "preserved" };
      await workflowDb.updateWorkflowTestCase(existing.targetId, {
        type: testType(template.type), title: template.title, description: template.description,
        module, scopeItemId: scopeId, preconditions: payload.preconditions || "",
        steps: Array.isArray(payload.steps) ? payload.steps.join("\n") : payload.steps || template.instructions,
        expectedResult: payload.expectedResult || template.completionCriteria,
      } as any);
      return { id: existing.targetId, state: "updated" };
    }
    const row: any = await workflowDb.createWorkflowTestCase({
      id: `test_${nanoid(20)}`, projectId: project.id, type: testType(template.type),
      code: "", title: template.title, description: template.description, module, scopeItemId: scopeId,
      preconditions: payload.preconditions || "",
      steps: Array.isArray(payload.steps) ? payload.steps.join("\n") : payload.steps || template.instructions,
      expectedResult: payload.expectedResult || template.completionCriteria,
      evidence: (template.evidenceRequirements || []).join("\n"), status: "Não iniciado",
    } as any);
    return { id: row.id, state: "created" };
  }

  if (template.type === "activity") {
    const users = await plannerStore.listAppUsers();
    const managerName = normalize(project.manager);
    const creator = users.find(user => user.active && [user.name, user.email].some(value => normalize(value) === managerName))
      || users.find(user => user.active && user.role === "admin");
    if (!creator) throw new Error("Projeto sem GP ou administrador ativo para criar a atividade");
    const sourceKey = `${template.id}:${project.id}:${occurrence.key}`;
    const pool = getPgPool();
    const checklistId = `gpc_${nanoid(20)}`;
    const checklistKey = `delivery-template-${template.id}-${occurrence.key}`.slice(0, 900);
    await pool?.query(
      `INSERT INTO "gp_checklist_items"
        ("id","projectId","templateVersion","itemKey","phase","workstream","title","description",
         "ownerRole","itemType","sortOrder","status","responsible","dueDate","notes")
       VALUES ($1,$2,'CENTRAL',$3,$4,$5,$6,$7,$8,'Atividade',
        COALESCE((SELECT MAX("sortOrder")+1 FROM "gp_checklist_items" WHERE "projectId"=$2),0),
        'Pendente','',$9,$10)
       ON CONFLICT ("projectId","templateVersion","itemKey") DO UPDATE SET
        "title"=CASE WHEN "gp_checklist_items"."status"='Pendente' THEN EXCLUDED."title" ELSE "gp_checklist_items"."title" END,
        "description"=CASE WHEN "gp_checklist_items"."status"='Pendente' THEN EXCLUDED."description" ELSE "gp_checklist_items"."description" END,
        "phase"=CASE WHEN "gp_checklist_items"."status"='Pendente' THEN EXCLUDED."phase" ELSE "gp_checklist_items"."phase" END,
        "workstream"=CASE WHEN "gp_checklist_items"."status"='Pendente' THEN EXCLUDED."workstream" ELSE "gp_checklist_items"."workstream" END,
        "ownerRole"=CASE WHEN "gp_checklist_items"."status"='Pendente' THEN EXCLUDED."ownerRole" ELSE "gp_checklist_items"."ownerRole" END,
        "dueDate"=CASE WHEN "gp_checklist_items"."status"='Pendente' THEN EXCLUDED."dueDate" ELSE "gp_checklist_items"."dueDate" END,
        "updatedAt"=now()`,
      [checklistId, project.id, checklistKey, template.phase, module || "Geral",
        template.title, template.description || "", template.ownerRole,
        occurrence.dueDate || dueDate(project.startDate, template.dueOffsetDays),
        template.instructions || ""],
    );
    const current: any = await activityStore.findBySource("delivery_template", sourceKey);
    if (current?.status === "Concluída" || current?.archivedAt)
      return { id: current.id, state: "preserved" };
    const row: any = await activityStore.upsertSourceActivity({
      scope: "project", projectId: project.id, title: template.title,
      description: [template.description, template.instructions].filter(Boolean).join("\n"),
      status: current?.status || "A fazer", priority: payload.priority || "Média",
      assigneeUserId: current?.assigneeUserId || creator.id, creatorUserId: creator.id,
      participantUserIds: current?.participantUserIds || [creator.id],
      dueDate: occurrence.dueDate || dueDate(project.startDate, template.dueOffsetDays),
      sourceType: "delivery_template", sourceKey,
      sourceUrl: `/techlead/gp-track?projectId=${encodeURIComponent(project.id)}&phase=${encodeURIComponent(template.phase)}`,
      sourceResolved: false,
    } as any);
    return { id: row?.id || current?.id, state: current ? "updated" : "created" };
  }

  const scopeItems: any[] = await workflowDb.listScopeItems(project.id);
  const modules = [...new Set(scopeItems.map(item => item.module).filter(Boolean))] as string[];
  await deliveryStore.applyTrail(
    project.id,
    modules,
    scopeItems.map(item => ({ id: item.id, key: item.code || item.id, module: item.module })),
    project.startDate || "",
    [occurrence.key],
  );
  const items: any[] = await deliveryStore.listItems(project.id);
  const row = items.find(item => item.occurrenceKey === occurrence.key);
  return { id: row?.id || "", state: existing ? "updated" : "created" };
}

async function publishTemplate(template: any, options: { confirmedProjectId?: string } = {}) {
  const summary = emptySummary();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (!template.active || template.archivedAt || (template.effectiveFrom && template.effectiveFrom > today))
    return summary;
  const projects = await plannerStore.listProjects();
  for (const project of projects as any[]) {
    summary.evaluated++;
    if (inactiveProject(project) || (options.confirmedProjectId && project.id !== options.confirmedProjectId)) {
      summary.outOfScope++;
      continue;
    }
    try {
      const scopeItems: any[] = await workflowDb.listScopeItems(project.id);
      const modules = [...new Set(scopeItems.map(item => item.module).filter(Boolean))] as string[];
      let occurrences = deliveryStore.applicableOccurrences(
        template, project.id, modules,
        scopeItems.map(item => ({ id: item.id, key: item.code || item.id, module: item.module })),
      );
      if (template.type === "activity")
        occurrences = occurrences.map(occurrence => activityOccurrence(template, occurrence));
      if (!occurrences.length) {
        summary.outOfScope++;
        continue;
      }
      summary.applicable++;
      for (const occurrence of occurrences as any[]) {
        const existing = await existingMaterialization(template.id, project.id, occurrence.key);
        if (existing?.state === "customized" || existing?.state === "archived") {
          summary.preserved++;
          continue;
        }
        const completed = await stageIsComplete(project.id, template.type, template.stage);
        if (completed && options.confirmedProjectId !== project.id) {
          await saveMaterialization({
            templateId: template.id, templateVersion: template.version, projectId: project.id,
            occurrenceKey: occurrence.key, targetType: typeToTarget(template.type),
            state: "blocked", reason: "Etapa 100% concluída",
          });
          summary.blocked++;
          continue;
        }
        const result = await materializeOperational(template, project, occurrence, existing);
        await saveMaterialization({
          templateId: template.id, templateVersion: template.version, projectId: project.id,
          occurrenceKey: occurrence.key, targetType: typeToTarget(template.type),
          targetId: result.id, state: result.state === "preserved" ? "customized" : "current",
          reason: result.state === "preserved" ? "Execução local preservada" : "",
          confirmed: options.confirmedProjectId === project.id,
        });
        if (result.state === "created") summary.created++;
        else if (result.state === "updated") summary.updated++;
        else summary.preserved++;
      }
    } catch (error) {
      summary.failed++;
      summary.errors.push({ projectId: project.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return summary;
}

export async function enqueueTemplatePublication(template: any, createdBy: string, trigger = "template_changed") {
  const pool = getPgPool();
  if (!pool || !template?.active || template?.archivedAt) return "";
  const id = `dpj_${nanoid(20)}`;
  await pool.query(
    `INSERT INTO "delivery_publication_jobs" ("id","templateId","templateVersion","trigger","createdBy")
     VALUES ($1,$2,$3,$4,$5)`,
    [id, template.id, Number(template.version || 1), trigger, createdBy],
  );
  publicationQueue = publicationQueue.then(async () => {
    await processPublicationJob(id);
  }).catch(error =>
    console.warn("Falha na fila de publicação de padrões", error));
  return id;
}

export async function cancelTemplatePublications(templateId: string) {
  const pool = getPgPool();
  if (!pool) return 0;
  const result = await pool.query(
    `UPDATE "delivery_publication_jobs" SET "status"='cancelled',"finishedAt"=now(),"updatedAt"=now()
     WHERE "templateId"=$1 AND "status"='pending'`, [templateId],
  );
  return result.rowCount || 0;
}

export async function processPublicationJob(id: string) {
  const pool = getPgPool();
  if (!pool) return null;
  const claimed = await pool.query(
    `UPDATE "delivery_publication_jobs" SET "status"='processing',"attempts"="attempts"+1,
      "startedAt"=now(),"updatedAt"=now() WHERE "id"=$1 AND "status" IN ('pending','failed') RETURNING *`, [id],
  );
  if (!claimed.rows[0]) return null;
  try {
    const template = await deliveryStore.getTemplate(claimed.rows[0].templateId);
    if (!template?.active || template?.archivedAt) throw new Error("Padrão inativo ou arquivado");
    const summary = await publishTemplate(template);
    const status = summary.failed || summary.blocked ? "completed_with_warnings" : "completed";
    await pool.query(
      `UPDATE "delivery_publication_jobs" SET "status"=$2,"summary"=$3::jsonb,
       "lastError"='', "finishedAt"=now(),"updatedAt"=now() WHERE "id"=$1`,
      [id, status, JSON.stringify(summary)],
    );
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE "delivery_publication_jobs" SET "status"='failed',"lastError"=$2,
       "finishedAt"=now(),"updatedAt"=now() WHERE "id"=$1`, [id, message],
    );
    throw error;
  }
}

export async function resumePendingPublications() {
  const pool = getPgPool();
  if (!pool) return;
  const result = await pool.query(
    `SELECT "id","status" FROM "delivery_publication_jobs"
     WHERE "status"='pending' OR ("status"='processing' AND "startedAt"<now()-interval '30 minutes')
     ORDER BY "createdAt" LIMIT 100`,
  );
  for (const row of result.rows) {
    if (row.status === "processing")
      await pool.query(`UPDATE "delivery_publication_jobs" SET "status"='pending' WHERE "id"=$1`, [row.id]);
    await processPublicationJob(row.id);
  }
}

export async function enqueueReconciliation(createdBy = "system") {
  const pool = getPgPool();
  if (!pool) return 0;
  const recent = await pool.query(
    `SELECT 1 FROM "delivery_publication_jobs"
     WHERE "trigger"='reconciliation' AND "createdAt">now()-interval '5 minutes' LIMIT 1`,
  );
  if (recent.rowCount) return 0;
  const templates: any[] = await deliveryStore.listTemplates();
  let queued = 0;
  for (const template of templates.filter(item => item.active && !item.archivedAt)) {
    if (await enqueueTemplatePublication(template, createdBy, "reconciliation")) queued++;
  }
  return queued;
}

export async function listPublicationHistory(limit = 100) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT j.*,t."title",t."type" FROM "delivery_publication_jobs" j
     LEFT JOIN "delivery_templates" t ON t."id"=j."templateId"
     ORDER BY j."createdAt" DESC LIMIT $1`, [limit],
  );
  return result.rows;
}

export async function listBlocked(projectId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT m.*,t."title",t."type",t."stage",t."version"
     FROM "delivery_materializations" m JOIN "delivery_templates" t ON t."id"=m."templateId"
     WHERE m."projectId"=$1 AND m."state"='blocked' ORDER BY t."stage",t."sortOrder",t."title"`, [projectId],
  );
  return result.rows;
}

export async function confirmBlocked(projectId: string, templateIds: string[]) {
  const templates = await Promise.all(templateIds.map(id => deliveryStore.getTemplate(id)));
  const summaries = [];
  for (const template of templates.filter(Boolean))
    summaries.push(await publishTemplate(template, { confirmedProjectId: projectId }));
  return summaries.reduce((total, item) => ({
    created: total.created + item.created,
    updated: total.updated + item.updated,
    preserved: total.preserved + item.preserved,
  }), { created: 0, updated: 0, preserved: 0 });
}
