import { getPgPool } from "../db";
import {
  scopeItems,
  bdcqQuestions,
  bdcqAnswers,
  bdcqAnswerHistory,
  workshops,
  workshopTranscripts,
  meetingMinutes,
  clientRequirements,
  dcdDocuments,
  gaps,
  configurations,
  workflowAuditLog,
  workflowPrompts,
  workflowBdcqTemplates as bdcqTemplateLibrary,
  workflowTestCases,
  workflowTestSteps,
} from "../../drizzle/schema";

const identifierPattern = /^[A-Za-z][A-Za-z0-9_]*$/;

function quoteIdentifier(value: string) {
  if (!identifierPattern.test(value))
    throw new Error(`Invalid database identifier: ${value}`);
  return `"${value}"`;
}

export type WorkflowPagination = { offset?: number; limit?: number };

async function listRows(
  table: string,
  column: string,
  value: string,
  pagination?: WorkflowPagination
) {
  const pool = getPgPool();
  if (!pool) return [];
  const hasLimit = typeof pagination?.limit === "number";
  const result = await pool.query(
    `SELECT * FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} = $1 ORDER BY "createdAt" DESC${hasLimit ? " LIMIT $2 OFFSET $3" : ""}`,
    hasLimit ? [value, pagination!.limit, pagination?.offset || 0] : [value]
  );
  return result.rows;
}

async function insertRow<T extends object>(
  table: string,
  data: T,
  jsonColumns: string[] = []
) {
  const pool = getPgPool();
  if (!pool) return data;
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([, value]) => value !== undefined && value !== null
  );
  const columns = entries.map(([key]) => quoteIdentifier(key)).join(", ");
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(", ");
  const values = entries.map(([key, value]) =>
    jsonColumns.includes(key) ? JSON.stringify(value) : value
  );
  const result = await pool.query(
    `INSERT INTO ${quoteIdentifier(table)} (${columns}) VALUES (${placeholders}) RETURNING *`,
    values
  );
  return result.rows[0] as T;
}

async function updateRow(
  table: string,
  id: string,
  data: object,
  allowedColumns: string[],
  jsonColumns: string[] = []
) {
  const pool = getPgPool();
  if (!pool) return;
  const allowed = new Set(allowedColumns);
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([key, value]) => allowed.has(key) && value !== undefined
  );
  if (!entries.length) return;
  const assignments = entries.map(
    ([key], index) => `${quoteIdentifier(key)} = $${index + 2}`
  );
  const values = entries.map(([key, value]) =>
    jsonColumns.includes(key) ? JSON.stringify(value) : value
  );
  await pool.query(
    `UPDATE ${quoteIdentifier(table)} SET ${assignments.join(", ")}, "updatedAt" = now() WHERE "id" = $1`,
    [id, ...values]
  );
}

async function deleteRow(table: string, id: string) {
  const pool = getPgPool();
  if (!pool) return;
  await pool.query(`DELETE FROM ${quoteIdentifier(table)} WHERE "id" = $1`, [
    id,
  ]);
}

async function bulkUpdateRows(
  table: string,
  ids: string[],
  data: object,
  allowedColumns: string[]
) {
  const pool = getPgPool();
  if (!pool || ids.length === 0) return 0;
  const allowed = new Set(allowedColumns);
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([key, value]) => allowed.has(key) && value !== undefined
  );
  if (!entries.length) return 0;
  const assignments = entries.map(
    ([key], index) => `${quoteIdentifier(key)} = $${index + 1}`
  );
  const result = await pool.query(
    `UPDATE ${quoteIdentifier(table)} SET ${assignments.join(", ")}, "updatedAt" = now() WHERE "id" = ANY($${entries.length + 1}::varchar[])`,
    [...entries.map(([, value]) => value), ids]
  );
  return result.rowCount || 0;
}

const directProjectTables = new Set([
  "scope_items",
  "bdcq_questions",
  "bdcq_answers",
  "workshops",
  "client_requirements",
  "dcd_documents",
  "gaps",
  "configurations",
  "workflow_test_cases",
]);

export async function getWorkflowEntityProjectId(table: string, id: string) {
  const pool = getPgPool();
  if (!pool) return null;
  if (directProjectTables.has(table)) {
    const result = await pool.query(
      `SELECT "projectId" FROM ${quoteIdentifier(table)} WHERE "id" = $1 LIMIT 1`,
      [id]
    );
    return (result.rows[0]?.projectId as string | undefined) || null;
  }
  if (table === "workshop_transcripts" || table === "meeting_minutes") {
    const result = await pool.query(
      `SELECT w."projectId" FROM ${quoteIdentifier(table)} e JOIN "workshops" w ON w."id" = e."workshopId" WHERE e."id" = $1 LIMIT 1`,
      [id]
    );
    return (result.rows[0]?.projectId as string | undefined) || null;
  }
  if (table === "workflow_test_steps") {
    const result = await pool.query(
      `SELECT t."projectId" FROM "workflow_test_steps" s JOIN "workflow_test_cases" t ON t."id" = s."testCaseId" WHERE s."id" = $1 LIMIT 1`,
      [id]
    );
    return (result.rows[0]?.projectId as string | undefined) || null;
  }
  throw new Error(`Unsupported workflow entity: ${table}`);
}

// ===== Client Requirements =====
export async function listClientRequirements(
  projectId: string,
  workshopId?: string,
  pagination?: WorkflowPagination
) {
  const pool = getPgPool();
  if (!pool) return [];
  const hasLimit = typeof pagination?.limit === "number";
  const result = workshopId
    ? await pool.query(
        `SELECT * FROM "client_requirements" WHERE "projectId" = $1 AND "workshopId" = $2 ORDER BY "createdAt" DESC${hasLimit ? " LIMIT $3 OFFSET $4" : ""}`,
        hasLimit
          ? [projectId, workshopId, pagination!.limit, pagination?.offset || 0]
          : [projectId, workshopId]
      )
    : await pool.query(
        `SELECT * FROM "client_requirements" WHERE "projectId" = $1 ORDER BY "createdAt" DESC${hasLimit ? " LIMIT $2 OFFSET $3" : ""}`,
        hasLimit
          ? [projectId, pagination!.limit, pagination?.offset || 0]
          : [projectId]
      );
  return result.rows as Array<typeof clientRequirements.$inferSelect>;
}

export async function createClientRequirement(
  data: typeof clientRequirements.$inferInsert
) {
  return insertRow("client_requirements", data);
}

const requirementUpdateColumns = new Set([
  "code",
  "title",
  "description",
  "module",
  "category",
  "priority",
  "status",
  "source",
  "acceptanceCriteria",
  "responsible",
]);

export async function updateClientRequirement(
  id: string,
  data: Partial<typeof clientRequirements.$inferInsert>
) {
  return updateRow(
    "client_requirements",
    id,
    data,
    Array.from(requirementUpdateColumns)
  );
}

export async function deleteClientRequirement(id: string) {
  return deleteRow("client_requirements", id);
}

// ===== Scope Items =====
export async function listScopeItems(
  projectId: string,
  pagination?: WorkflowPagination
) {
  return listRows("scope_items", "projectId", projectId, pagination) as Promise<
    Array<typeof scopeItems.$inferSelect>
  >;
}
export async function createScopeItem(data: typeof scopeItems.$inferInsert) {
  return insertRow("scope_items", data);
}
export async function updateScopeItem(
  id: string,
  data: Partial<typeof scopeItems.$inferInsert>
) {
  return updateRow("scope_items", id, data, [
    "module",
    "code",
    "name",
    "processArea",
    "description",
    "active",
  ]);
}
export async function deleteScopeItem(id: string) {
  return deleteRow("scope_items", id);
}

// ===== BDCQ Questions =====
export async function listBdcqQuestions(
  projectId: string,
  pagination?: WorkflowPagination
) {
  return listRows(
    "bdcq_questions",
    "projectId",
    projectId,
    pagination
  ) as Promise<Array<typeof bdcqQuestions.$inferSelect>>;
}
export async function createBdcqQuestion(
  data: typeof bdcqQuestions.$inferInsert
) {
  return insertRow("bdcq_questions", data, ["scopeItemIds"]);
}
export async function updateBdcqQuestion(
  id: string,
  data: Partial<typeof bdcqQuestions.$inferInsert>
) {
  return updateRow(
    "bdcq_questions",
    id,
    data,
    [
      "module",
      "category",
      "question",
      "templateId",
      "scopeItemIds",
      "isDefault",
      "sortOrder",
    ],
    ["scopeItemIds"]
  );
}

export async function listBdcqTemplateLibrary() {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT * FROM "workflow_bdcq_templates" ORDER BY "category" ASC, "question" ASC`
  );
  return result.rows as Array<typeof bdcqTemplateLibrary.$inferSelect>;
}
export async function createBdcqTemplate(
  data: typeof bdcqTemplateLibrary.$inferInsert
) {
  return insertRow("workflow_bdcq_templates", data, [
    "modules",
    "scopeItemKeys",
  ]);
}
export async function updateBdcqTemplate(
  id: string,
  data: Partial<typeof bdcqTemplateLibrary.$inferInsert>
) {
  return updateRow(
    "workflow_bdcq_templates",
    id,
    data,
    ["question", "category", "modules", "scopeItemKeys", "active"],
    ["modules", "scopeItemKeys"]
  );
}
export async function deleteBdcqTemplate(id: string) {
  return deleteRow("workflow_bdcq_templates", id);
}
export async function deleteBdcqQuestion(id: string) {
  return deleteRow("bdcq_questions", id);
}

// ===== BDCQ Answers =====
export async function listBdcqAnswers(
  projectId: string,
  pagination?: WorkflowPagination
) {
  return listRows(
    "bdcq_answers",
    "projectId",
    projectId,
    pagination
  ) as Promise<Array<typeof bdcqAnswers.$inferSelect>>;
}
export async function listBdcqAnswersForQuestions(
  projectId: string,
  questionIds: string[]
) {
  const pool = getPgPool();
  if (!pool || questionIds.length === 0) return [];
  const result = await pool.query(
    `SELECT * FROM "bdcq_answers" WHERE "projectId" = $1 AND "questionId" = ANY($2::varchar[]) ORDER BY "createdAt" DESC`,
    [projectId, questionIds]
  );
  return result.rows as Array<typeof bdcqAnswers.$inferSelect>;
}
export async function createBdcqAnswer(data: typeof bdcqAnswers.$inferInsert) {
  return insertRow("bdcq_answers", data, ["attachments"]);
}
export async function getBdcqAnswerByQuestion(
  projectId: string,
  questionId: string
) {
  const pool = getPgPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT * FROM "bdcq_answers" WHERE "projectId" = $1 AND "questionId" = $2 ORDER BY "updatedAt" DESC LIMIT 1`,
    [projectId, questionId]
  );
  return (
    (result.rows[0] as typeof bdcqAnswers.$inferSelect | undefined) || null
  );
}
export async function updateBdcqAnswer(
  id: string,
  data: Partial<typeof bdcqAnswers.$inferInsert>
) {
  return updateRow(
    "bdcq_answers",
    id,
    data,
    ["answer", "answeredBy", "attachments"],
    ["attachments"]
  );
}
export async function updateBdcqAnswerWithHistory(
  id: string,
  data: Partial<typeof bdcqAnswers.$inferInsert>,
  historyId: string,
  changedBy: string
) {
  const pool = getPgPool();
  if (!pool) return { id, ...data };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT * FROM "bdcq_answers" WHERE "id" = $1 FOR UPDATE`,
      [id]
    );
    const current = currentResult.rows[0] as
      | typeof bdcqAnswers.$inferSelect
      | undefined;
    if (!current) throw new Error("Resposta BDCQ não encontrada");
    const changed =
      (data.answer !== undefined && data.answer !== current.answer) ||
      (data.answeredBy !== undefined &&
        data.answeredBy !== current.answeredBy) ||
      data.attachments !== undefined;
    if (!changed) {
      await client.query("COMMIT");
      return current;
    }
    await client.query(
      `INSERT INTO "bdcq_answer_history" ("id", "answerId", "questionId", "projectId", "answer", "answeredBy", "changedBy") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        historyId,
        id,
        current.questionId,
        current.projectId,
        current.answer,
        current.answeredBy,
        changedBy,
      ]
    );
    const answer = data.answer ?? current.answer;
    const answeredBy = data.answeredBy ?? current.answeredBy;
    const attachments =
      data.attachments === undefined ? current.attachments : data.attachments;
    const result = await client.query(
      `UPDATE "bdcq_answers" SET "answer" = $2, "answeredBy" = $3, "attachments" = $4::jsonb, "updatedAt" = now() WHERE "id" = $1 RETURNING *`,
      [id, answer, answeredBy, JSON.stringify(attachments || [])]
    );
    await client.query("COMMIT");
    return result.rows[0] as typeof bdcqAnswers.$inferSelect;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function listBdcqAnswerHistory(answerId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT * FROM "bdcq_answer_history" WHERE "answerId" = $1 ORDER BY "createdAt" DESC`,
    [answerId]
  );
  return result.rows as Array<typeof bdcqAnswerHistory.$inferSelect>;
}
export async function deleteBdcqAnswer(id: string) {
  return deleteRow("bdcq_answers", id);
}

// ===== Workshops =====
export async function listWorkshops(
  projectId: string,
  pagination?: WorkflowPagination
) {
  return listRows("workshops", "projectId", projectId, pagination) as Promise<
    Array<typeof workshops.$inferSelect>
  >;
}
export async function createWorkshop(data: typeof workshops.$inferInsert) {
  return insertRow("workshops", data, ["participants", "agenda"]);
}
export async function updateWorkshop(
  id: string,
  data: Partial<typeof workshops.$inferInsert>
) {
  return updateRow(
    "workshops",
    id,
    data,
    [
      "title",
      "module",
      "scheduledDate",
      "duration",
      "participants",
      "agenda",
      "status",
      "notes",
    ],
    ["participants", "agenda"]
  );
}
export async function deleteWorkshop(id: string) {
  return deleteRow("workshops", id);
}

// ===== Workshop Transcripts =====
export async function listTranscripts(
  workshopId: string,
  pagination?: WorkflowPagination
) {
  return listRows(
    "workshop_transcripts",
    "workshopId",
    workshopId,
    pagination
  ) as Promise<Array<typeof workshopTranscripts.$inferSelect>>;
}
export async function createTranscript(
  data: typeof workshopTranscripts.$inferInsert
) {
  return insertRow("workshop_transcripts", data);
}
export async function deleteTranscript(id: string) {
  return deleteRow("workshop_transcripts", id);
}

// ===== Meeting Minutes =====
export async function getMinutesByWorkshop(workshopId: string) {
  const rows = await listRows("meeting_minutes", "workshopId", workshopId);
  return (rows[0] as typeof meetingMinutes.$inferSelect) || null;
}
export async function listMinutesByProject(projectId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT m.* FROM "meeting_minutes" m JOIN "workshops" w ON w."id" = m."workshopId" WHERE w."projectId" = $1`,
    [projectId]
  );
  return result.rows as Array<typeof meetingMinutes.$inferSelect>;
}
export async function createMinutes(data: typeof meetingMinutes.$inferInsert) {
  return insertRow("meeting_minutes", data);
}
export async function updateMinutes(
  id: string,
  data: Partial<typeof meetingMinutes.$inferInsert>
) {
  return updateRow("meeting_minutes", id, data, [
    "content",
    "generatedBy",
    "version",
  ]);
}

// ===== DCD Documents =====
export async function listDcdDocuments(
  projectId: string,
  includeContent = false,
  pagination?: WorkflowPagination
) {
  const pool = getPgPool();
  if (!pool) return [];
  const columns = includeContent
    ? "*"
    : `"id", "projectId", "seriesId", "sourceHash", "module", "title", "version", "status", "createdAt", "updatedAt"`;
  const hasLimit = typeof pagination?.limit === "number";
  const result = await pool.query(
    `SELECT ${columns} FROM "dcd_documents" WHERE "projectId" = $1 ORDER BY "createdAt" DESC${hasLimit ? " LIMIT $2 OFFSET $3" : ""}`,
    hasLimit
      ? [projectId, pagination!.limit, pagination?.offset || 0]
      : [projectId]
  );
  return result.rows as Array<typeof dcdDocuments.$inferSelect>;
}
export async function getDcdDocument(id: string) {
  const rows = await listRows("dcd_documents", "id", id);
  return (rows[0] as typeof dcdDocuments.$inferSelect) || null;
}
export async function findDcdBySourceHash(
  projectId: string,
  sourceHash: string
) {
  const pool = getPgPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT * FROM "dcd_documents" WHERE "projectId" = $1 AND "sourceHash" = $2 ORDER BY "createdAt" DESC LIMIT 1`,
    [projectId, sourceHash]
  );
  return (
    (result.rows[0] as typeof dcdDocuments.$inferSelect | undefined) || null
  );
}
export async function getLatestDcdByModule(projectId: string, module: string) {
  const pool = getPgPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT * FROM "dcd_documents" WHERE "projectId" = $1 AND "module" = $2 ORDER BY "version" DESC, "createdAt" DESC LIMIT 1`,
    [projectId, module]
  );
  return (
    (result.rows[0] as typeof dcdDocuments.$inferSelect | undefined) || null
  );
}
export async function createDcdDocument(
  data: typeof dcdDocuments.$inferInsert
) {
  return insertRow("dcd_documents", data);
}
export async function updateDcdDocument(
  id: string,
  data: Partial<typeof dcdDocuments.$inferInsert>
) {
  return updateRow("dcd_documents", id, data, [
    "seriesId",
    "sourceHash",
    "module",
    "title",
    "content",
    "version",
    "status",
  ]);
}
export async function deleteDcdDocument(id: string) {
  return deleteRow("dcd_documents", id);
}

// ===== Gaps =====
export async function listGaps(
  projectId: string,
  pagination?: WorkflowPagination
) {
  return listRows("gaps", "projectId", projectId, pagination) as Promise<
    Array<typeof gaps.$inferSelect>
  >;
}
export async function createGap(data: typeof gaps.$inferInsert) {
  return insertRow("gaps", data);
}
export async function updateGap(
  id: string,
  data: Partial<typeof gaps.$inferInsert>
) {
  return updateRow("gaps", id, data, [
    "dcdId",
    "module",
    "description",
    "impact",
    "responsible",
    "resolution",
    "status",
  ]);
}
export async function deleteGap(id: string) {
  return deleteRow("gaps", id);
}
export async function bulkUpdateGaps(
  ids: string[],
  data: Partial<typeof gaps.$inferInsert>
) {
  return bulkUpdateRows("gaps", ids, data, ["responsible", "status", "impact"]);
}

// ===== Configurations =====
export async function listConfigurations(
  projectId: string,
  pagination?: WorkflowPagination
) {
  return listRows(
    "configurations",
    "projectId",
    projectId,
    pagination
  ) as Promise<Array<typeof configurations.$inferSelect>>;
}
export async function createConfiguration(
  data: typeof configurations.$inferInsert
) {
  return insertRow("configurations", data);
}
export async function updateConfiguration(
  id: string,
  data: Partial<typeof configurations.$inferInsert>
) {
  return updateRow("configurations", id, data, [
    "module",
    "category",
    "description",
    "responsible",
    "status",
    "notes",
  ]);
}
export async function deleteConfiguration(id: string) {
  return deleteRow("configurations", id);
}
export async function bulkUpdateConfigurations(
  ids: string[],
  data: Partial<typeof configurations.$inferInsert>
) {
  return bulkUpdateRows("configurations", ids, data, ["responsible", "status"]);
}

// ===== Unit and Integrated Tests =====
export async function listWorkflowTestCases(
  projectId: string,
  pagination?: WorkflowPagination
) {
  return listRows(
    "workflow_test_cases",
    "projectId",
    projectId,
    pagination
  ) as Promise<Array<typeof workflowTestCases.$inferSelect>>;
}
export async function createWorkflowTestCase(
  data: typeof workflowTestCases.$inferInsert
) {
  return insertRow("workflow_test_cases", data);
}
export async function updateWorkflowTestCase(
  id: string,
  data: Partial<typeof workflowTestCases.$inferInsert>
) {
  return updateRow("workflow_test_cases", id, data, [
    "type",
    "code",
    "title",
    "description",
    "module",
    "requirementId",
    "scopeItemId",
    "dcdId",
    "preconditions",
    "steps",
    "expectedResult",
    "actualResult",
    "responsible",
    "evidence",
    "status",
    "executedAt",
  ]);
}
export async function deleteWorkflowTestCase(id: string) {
  return deleteRow("workflow_test_cases", id);
}
export async function bulkUpdateWorkflowTestCases(
  ids: string[],
  data: Partial<typeof workflowTestCases.$inferInsert>
) {
  return bulkUpdateRows("workflow_test_cases", ids, data, [
    "responsible",
    "status",
    "executedAt",
  ]);
}
export async function listWorkflowTestSteps(testCaseId: string) {
  const rows = (await listRows(
    "workflow_test_steps",
    "testCaseId",
    testCaseId
  )) as Array<typeof workflowTestSteps.$inferSelect>;
  return rows.sort((a, b) => a.position - b.position);
}
export async function listWorkflowTestStepsByProject(projectId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT s.* FROM "workflow_test_steps" s JOIN "workflow_test_cases" t ON t."id" = s."testCaseId" WHERE t."projectId" = $1 ORDER BY t."createdAt", s."position"`,
    [projectId]
  );
  return result.rows as Array<typeof workflowTestSteps.$inferSelect>;
}
export async function createWorkflowTestStep(
  data: typeof workflowTestSteps.$inferInsert
) {
  return insertRow("workflow_test_steps", data, ["evidences"]);
}
export async function updateWorkflowTestStep(
  id: string,
  data: Partial<typeof workflowTestSteps.$inferInsert>
) {
  return updateRow(
    "workflow_test_steps",
    id,
    data,
    [
      "position",
      "title",
      "instruction",
      "expectedResult",
      "actualResult",
      "responsible",
      "status",
      "evidences",
      "executedAt",
    ],
    ["evidences"]
  );
}
export async function deleteWorkflowTestStep(id: string) {
  return deleteRow("workflow_test_steps", id);
}

export async function bulkUpdateDcdDocuments(
  ids: string[],
  data: Partial<typeof dcdDocuments.$inferInsert>
) {
  return bulkUpdateRows("dcd_documents", ids, data, ["status"]);
}

// ===== Workflow Audit Log =====
export async function createWorkflowAudit(
  data: typeof workflowAuditLog.$inferInsert
) {
  return insertRow("workflow_audit_log", data, ["details"]);
}
export async function listWorkflowAudit(projectId: string, limit = 100) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT * FROM "workflow_audit_log" WHERE "projectId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [projectId, limit]
  );
  return result.rows as Array<typeof workflowAuditLog.$inferSelect>;
}

// ===== Customizable AI Prompts =====
export async function listWorkflowPrompts() {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT * FROM "workflow_prompts" ORDER BY "name" ASC`
  );
  return result.rows as Array<typeof workflowPrompts.$inferSelect>;
}

export async function getWorkflowPrompt(key: string) {
  const pool = getPgPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT * FROM "workflow_prompts" WHERE "key" = $1 LIMIT 1`,
    [key]
  );
  return (
    (result.rows[0] as typeof workflowPrompts.$inferSelect | undefined) || null
  );
}

export async function upsertWorkflowPrompt(
  data: typeof workflowPrompts.$inferInsert
) {
  const pool = getPgPool();
  if (!pool) return data;
  const result = await pool.query(
    `INSERT INTO "workflow_prompts" ("key", "name", "description", "systemPrompt", "model", "updatedBy") VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "systemPrompt" = EXCLUDED."systemPrompt", "model" = EXCLUDED."model", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now()
     RETURNING *`,
    [
      data.key,
      data.name,
      data.description || null,
      data.systemPrompt,
      data.model || "",
      data.updatedBy || "",
    ]
  );
  return result.rows[0] as typeof workflowPrompts.$inferSelect;
}

export async function deleteWorkflowPrompt(key: string) {
  const pool = getPgPool();
  if (!pool) return;
  await pool.query(`DELETE FROM "workflow_prompts" WHERE "key" = $1`, [key]);
}
