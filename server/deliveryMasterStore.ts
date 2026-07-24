import { nanoid } from "nanoid";
import { getPgPool } from "./db";

export const DELIVERY_TYPES = [
  "activity",
  "bdcq",
  "workshop",
  "dcd",
  "gap",
  "configuration",
  "unit_test",
  "cycle_1",
  "cycle_2",
  "risk",
  "issue",
  "cutover",
  "go_live",
  "closure",
] as const;

export type DeliveryType = (typeof DELIVERY_TYPES)[number];
export type DeliveryTemplateInput = {
  type: DeliveryType;
  title: string;
  description?: string;
  instructions?: string;
  phase?: string;
  stage: string;
  modules?: string[];
  scopeItemKeys?: string[];
  projectIds?: string[];
  required?: boolean;
  sortOrder?: number;
  dependencyTemplateIds?: string[];
  ownerRole?: string;
  dueOffsetDays?: number;
  evidenceRequirements?: string[];
  approvalPolicy?: {
    mode: "none" | "any" | "all" | "minimum";
    minimumApprovals?: number;
  };
  completionCriteria?: string;
  payload?: Record<string, unknown>;
  effectiveFrom?: string;
  active?: boolean;
};

const jsonColumns = new Set([
  "modules",
  "scopeItemKeys",
  "projectIds",
  "dependencyTemplateIds",
  "evidenceRequirements",
  "approvalPolicy",
  "payload",
  "scopeItemIds",
  "dependencyItemIds",
  "evidences",
]);
const serialize = (key: string, value: unknown) =>
  jsonColumns.has(key)
    ? JSON.stringify(
        value ?? (key === "approvalPolicy" || key === "payload" ? {} : [])
      )
    : value;

async function insert(table: string, data: Record<string, unknown>) {
  const pool = getPgPool();
  if (!pool) return data;
  const entries = Object.entries(data).filter(
    ([, value]) => value !== undefined
  );
  const columns = entries.map(([key]) => `"${key}"`).join(",");
  const values = entries
    .map(
      ([, value], index) =>
        `$${index + 1}${typeof value === "object" ? "::jsonb" : ""}`
    )
    .join(",");
  const result = await pool.query(
    `INSERT INTO "${table}" (${columns}) VALUES (${values}) RETURNING *`,
    entries.map(([key, value]) => serialize(key, value))
  );
  return result.rows[0];
}

export async function listTemplates(
  options: { type?: string; includeArchived?: boolean } = {}
) {
  const pool = getPgPool();
  if (!pool) return [];
  const clauses = [options.includeArchived ? "TRUE" : '"archivedAt" IS NULL'];
  const values: unknown[] = [];
  if (options.type) {
    values.push(options.type);
    clauses.push(`"type"=$${values.length}`);
  }
  const result = await pool.query(
    `SELECT * FROM "delivery_templates" WHERE ${clauses.join(" AND ")} ORDER BY "type","sortOrder","title"`,
    values
  );
  return result.rows;
}

export async function getTemplate(id: string) {
  const pool = getPgPool();
  if (!pool) return null;
  const result = await pool.query(
    'SELECT * FROM "delivery_templates" WHERE "id"=$1',
    [id]
  );
  return result.rows[0] || null;
}

export async function createTemplate(
  input: DeliveryTemplateInput,
  userId: string
) {
  const id = `dt_${nanoid(20)}`;
  const created = (await insert("delivery_templates", {
    id,
    ...input,
    description: input.description || "",
    instructions: input.instructions || "",
    phase: input.phase || "Prepare",
    modules: input.modules || [],
    scopeItemKeys: input.scopeItemKeys || [],
    projectIds: input.projectIds || [],
    required: input.required ?? true,
    sortOrder: input.sortOrder || 0,
    dependencyTemplateIds: input.dependencyTemplateIds || [],
    ownerRole: input.ownerRole || "consultant",
    dueOffsetDays: input.dueOffsetDays || 0,
    evidenceRequirements: input.evidenceRequirements || [],
    approvalPolicy: input.approvalPolicy || {
      mode: "none",
      minimumApprovals: 1,
    },
    completionCriteria: input.completionCriteria || "",
    payload: input.payload || {},
    version: 1,
    effectiveFrom: input.effectiveFrom || "",
    active: input.active ?? true,
    createdBy: userId,
  })) as Record<string, unknown>;
  await insert("delivery_template_versions", {
    id: `dtv_${nanoid(20)}`,
    templateId: id,
    version: 1,
    snapshot: created,
    changedBy: userId,
  });
  return created;
}

export async function updateTemplate(
  id: string,
  patch: Partial<DeliveryTemplateInput>,
  userId: string
) {
  const pool = getPgPool();
  if (!pool) return { id, ...patch };
  const current = await pool.query(
    'SELECT * FROM "delivery_templates" WHERE "id"=$1 AND "archivedAt" IS NULL',
    [id]
  );
  if (!current.rows[0]) return null;
  const allowed = Object.entries(patch).filter(
    ([key, value]) => value !== undefined && !["id", "createdBy"].includes(key)
  );
  const nextVersion = Number(current.rows[0].version || 1) + 1;
  const sets = allowed.map(
    ([key], index) =>
      `"${key}"=$${index + 2}${jsonColumns.has(key) ? "::jsonb" : ""}`
  );
  sets.push(`"version"=$${allowed.length + 2}`, '"updatedAt"=now()');
  const values = allowed.map(([key, value]) => serialize(key, value));
  const result = await pool.query(
    `UPDATE "delivery_templates" SET ${sets.join(",")} WHERE "id"=$1 RETURNING *`,
    [id, ...values, nextVersion]
  );
  await insert("delivery_template_versions", {
    id: `dtv_${nanoid(20)}`,
    templateId: id,
    version: nextVersion,
    snapshot: result.rows[0],
    changedBy: userId,
  });
  return result.rows[0];
}

export async function archiveTemplate(id: string, userId: string) {
  const pool = getPgPool();
  if (!pool) return { id };
  const result = await pool.query(
    'UPDATE "delivery_templates" SET "active"=false,"archivedAt"=now(),"archivedBy"=$2,"updatedAt"=now() WHERE "id"=$1 AND "archivedAt" IS NULL RETURNING *',
    [id, userId]
  );
  return result.rows[0] || null;
}

export async function listItems(projectId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    'SELECT * FROM "delivery_items" WHERE "projectId"=$1 AND "archivedAt" IS NULL ORDER BY "sortOrder","sequenceNumber"',
    [projectId]
  );
  return result.rows;
}

export async function updateItem(id: string, patch: Record<string, unknown>) {
  const pool = getPgPool();
  if (!pool) return { id, ...patch };
  const allowed = new Set([
    "status",
    "responsibleId",
    "dueDate",
    "evidences",
    "payload",
    "title",
    "description",
  ]);
  const entries = Object.entries(patch).filter(
    ([key, value]) => allowed.has(key) && value !== undefined
  );
  if (!entries.length) return null;
  const sets = entries.map(
    ([key], index) =>
      `"${key}"=$${index + 2}${jsonColumns.has(key) ? "::jsonb" : ""}`
  );
  sets.push('"customized"=true');
  sets.push('"updatedAt"=now()');
  const result = await pool.query(
    `UPDATE "delivery_items" SET ${sets.join(",")} WHERE "id"=$1 AND "archivedAt" IS NULL RETURNING *`,
    [id, ...entries.map(([key, value]) => serialize(key, value))]
  );
  return result.rows[0] || null;
}

const PREFIX: Record<string, string> = {
  activity: "ATV",
  bdcq: "BDCQ",
  workshop: "WS",
  dcd: "DCD",
  gap: "GAP",
  configuration: "CFG",
  unit_test: "TST",
  cycle_1: "TST",
  cycle_2: "TST",
  risk: "RSK",
  issue: "ISS",
  cutover: "CUT",
  go_live: "GLV",
  closure: "ENC",
};

type TrailScopeItem = { id: string; key: string; module?: string };

function occurrenceKey(
  templateId: string,
  module: string,
  scopeItemIds: string[]
) {
  return `${templateId}|${module}|${[...scopeItemIds].sort().join(",")}`;
}

export function applicableOccurrences(
  template: any,
  projectId: string,
  modules: string[],
  scopeItems: TrailScopeItem[]
) {
  if (!template.active) return [];
  if (template.projectIds?.length && !template.projectIds.includes(projectId))
    return [];
  const allowedModules = new Set(
    (template.modules || []).map((value: string) => value.toUpperCase())
  );
  const allowedScopes = new Set(template.scopeItemKeys || []);

  if (allowedScopes.size) {
    return scopeItems
      .filter(item => allowedScopes.has(item.key))
      .filter(
        item =>
          !allowedModules.size ||
          allowedModules.has(String(item.module || "").toUpperCase())
      )
      .map(item => ({
        key: occurrenceKey(template.id, item.module || "", [item.id]),
        template,
        module: item.module || "",
        scopeItemIds: [item.id],
      }));
  }
  if (allowedModules.size) {
    return [
      ...new Set(
        modules.filter(module => allowedModules.has(module.toUpperCase()))
      ),
    ].map(module => ({
      key: occurrenceKey(template.id, module, []),
      template,
      module,
      scopeItemIds: [] as string[],
    }));
  }
  return [
    {
      key: occurrenceKey(template.id, "", []),
      template,
      module: "",
      scopeItemIds: [] as string[],
    },
  ];
}

export async function previewTrail(
  projectId: string,
  modules: string[],
  scopeItems: TrailScopeItem[]
) {
  const templates = await listTemplates();
  const occurrences = templates.flatMap((template: any) =>
    applicableOccurrences(template, projectId, modules, scopeItems)
  );
  const existing = await listItems(projectId);
  const existingByOccurrence = new Map(
    existing.map((item: any) => [
      item.occurrenceKey ||
        occurrenceKey(item.templateId, item.module || "", item.scopeItemIds || []),
      item,
    ])
  );
  const items = occurrences.map((occurrence: any) => {
    const current: any = existingByOccurrence.get(occurrence.key) || null;
    const state = !current
      ? "new"
      : current.customized
        ? "customized"
        : current.templateVersion < occurrence.template.version
          ? "update"
          : "current";
    return { ...occurrence, existing: current, state };
  });
  return {
    items,
    added: items.filter((item: any) => item.state === "new").length,
    updated: items.filter((item: any) => item.state === "update").length,
    preserved: existing.filter((item: any) => item.customized).length,
    outOfScope: existing.filter(
      (item: any) =>
        item.templateId &&
        !occurrences.some(
          (occurrence: any) =>
            occurrence.key ===
            (item.occurrenceKey ||
              occurrenceKey(
                item.templateId,
                item.module || "",
                item.scopeItemIds || []
              ))
        )
    ).length,
  };
}

export async function applyTrail(
  projectId: string,
  modules: string[],
  scopeItems: Array<{ id: string; key: string; module?: string }>,
  projectStartDate = "",
  selectedKeys?: string[]
) {
  const pool = getPgPool();
  const preview = await previewTrail(projectId, modules, scopeItems);
  const selected = selectedKeys ? new Set(selectedKeys) : null;
  const selectedItems = (preview.items as any[]).filter(
    entry =>
      (!selected || selected.has(entry.key)) &&
      ["new", "update"].includes(entry.state)
  );
  if (!pool)
    return {
      added: preview.added,
      updated: preview.updated,
      preserved: preview.preserved,
      outOfScope: preview.outOfScope,
    };
  const client = await pool.connect();
  let added = 0;
  let updated = 0;
  try {
    await client.query("BEGIN");
    for (const entry of selectedItems) {
      const template = entry.template;
      const matchingScopeIds = entry.scopeItemIds;
      if (!entry.existing) {
        const sequenceResult = await client.query(
          `SELECT nextval('"delivery_card_global_seq"')::bigint AS value`
        );
        const sequenceNumber = Number(sequenceResult.rows[0].value);
        const code = `${PREFIX[template.type] || "ITM"}-${String(sequenceNumber).padStart(6, "0")}`;
        const dueDate = projectStartDate
          ? (() => {
              const date = new Date(`${projectStartDate}T12:00:00Z`);
              date.setUTCDate(
                date.getUTCDate() + Number(template.dueOffsetDays || 0)
              );
              return date.toISOString().slice(0, 10);
            })()
          : "";
        await client.query(
          `INSERT INTO "delivery_items" ("id","code","sequenceNumber","projectId","templateId","occurrenceKey","templateVersion","type","title","description","phase","stage","module","scopeItemIds","required","sortOrder","ownerRole","dueDate","status","evidenceRequirements","approvalPolicy","payload")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,'not_started',$19::jsonb,$20::jsonb,$21::jsonb)`,
          [
            `di_${nanoid(20)}`,
            code,
            sequenceNumber,
            projectId,
            template.id,
            entry.key,
            template.version,
            template.type,
            template.title,
            template.description || "",
            template.phase,
            template.stage,
            entry.module || "",
            JSON.stringify(matchingScopeIds),
            template.required,
            template.sortOrder,
            template.ownerRole,
            dueDate,
            JSON.stringify(template.evidenceRequirements || []),
            JSON.stringify(template.approvalPolicy || {}),
            JSON.stringify({
              ...(template.payload || {}),
              instructions: template.instructions || "",
              completionCriteria: template.completionCriteria || "",
            }),
          ]
        );
        added++;
      } else if (
        !entry.existing.customized &&
        entry.existing.templateVersion < template.version
      ) {
        await client.query(
          `UPDATE "delivery_items" SET "templateVersion"=$2,"title"=$3,"description"=$4,"phase"=$5,"stage"=$6,"scopeItemIds"=$7::jsonb,"required"=$8,"sortOrder"=$9,"ownerRole"=$10,"evidenceRequirements"=$11::jsonb,"approvalPolicy"=$12::jsonb,"payload"=$13::jsonb,"updatedAt"=now() WHERE "id"=$1`,
          [
            entry.existing.id,
            template.version,
            template.title,
            template.description || "",
            template.phase,
            template.stage,
            JSON.stringify(matchingScopeIds),
            template.required,
            template.sortOrder,
            template.ownerRole,
            JSON.stringify(template.evidenceRequirements || []),
            JSON.stringify(template.approvalPolicy || {}),
            JSON.stringify({
              ...(template.payload || {}),
              instructions: template.instructions || "",
              completionCriteria: template.completionCriteria || "",
            }),
          ]
        );
        updated++;
      }
    }
    const projectItems = await client.query(
      'SELECT "id","templateId" FROM "delivery_items" WHERE "projectId"=$1 AND "archivedAt" IS NULL',
      [projectId]
    );
    const itemByTemplate = new Map(
      projectItems.rows.map((item: any) => [item.templateId, item.id])
    );
    for (const entry of selectedItems) {
      const itemId = itemByTemplate.get(entry.template.id);
      if (!itemId) continue;
      const dependencyItemIds = (entry.template.dependencyTemplateIds || [])
        .map((templateId: string) => itemByTemplate.get(templateId))
        .filter(Boolean);
      await client.query(
        'UPDATE "delivery_items" SET "dependencyItemIds"=$2::jsonb WHERE "id"=$1',
        [itemId, JSON.stringify(dependencyItemIds)]
      );
    }
    await client.query("COMMIT");
    return {
      added,
      updated,
      preserved: preview.preserved,
      outOfScope: preview.outOfScope,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listRaid(projectId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT i.*,r."kind",r."category",r."cause",r."consequence",r."probability",r."impact",r."severity",r."strategy",r."responsePlan",r."workaround",r."rootCause",r."sponsorId",r."nextAction",r."reviewDate",r."escalated",r."acceptedReason",r."materializedIssueId" FROM "delivery_items" i JOIN "delivery_raid_items" r ON r."deliveryItemId"=i."id" WHERE i."projectId"=$1 AND i."archivedAt" IS NULL ORDER BY r."severity" DESC,i."dueDate"`,
    [projectId]
  );
  return result.rows;
}

export async function createRaid(projectId: string, input: any) {
  const pool = getPgPool();
  if (!pool) return input;
  const sequenceResult = await pool.query(
    `SELECT nextval('"delivery_card_global_seq"')::bigint AS value`
  );
  const sequenceNumber = Number(sequenceResult.rows[0].value);
  const kind = input.kind === "issue" ? "issue" : "risk";
  const item = (await insert("delivery_items", {
    id: `di_${nanoid(20)}`,
    code: `${PREFIX[kind]}-${String(sequenceNumber).padStart(6, "0")}`,
    sequenceNumber,
    projectId,
    type: kind,
    title: input.title,
    description: input.description || "",
    phase: input.phase || "Prepare",
    stage: "raid",
    module: input.module || "",
    scopeItemIds: input.scopeItemIds || [],
    required: input.required ?? false,
    ownerRole: "manager",
    responsibleId: input.responsibleId || "",
    dueDate: input.dueDate || "",
    status: input.status || "open",
    evidenceRequirements: [],
    evidences: input.attachments || [],
    approvalPolicy: input.approvalPolicy || {
      mode: "none",
      minimumApprovals: 1,
    },
    payload: {},
  })) as any;
  await insert("delivery_raid_items", {
    id: `raid_${nanoid(20)}`,
    deliveryItemId: item.id,
    kind,
    category: input.category || "",
    cause: input.cause || "",
    consequence: input.consequence || "",
    probability: input.probability || 1,
    impact: input.impact || 1,
    severity: (input.probability || 1) * (input.impact || 1),
    strategy: input.strategy || "",
    responsePlan: input.responsePlan || "",
    workaround: input.workaround || "",
    rootCause: input.rootCause || "",
    sponsorId: input.sponsorId || "",
    nextAction: input.nextAction || "",
    reviewDate: input.reviewDate || "",
    escalated: false,
    acceptedReason: "",
    materializedIssueId: "",
  });
  return {
    ...item,
    ...input,
    severity: (input.probability || 1) * (input.impact || 1),
  };
}

const RAID_ITEM_FIELDS = new Set([
  "title",
  "description",
  "phase",
  "module",
  "scopeItemIds",
  "required",
  "responsibleId",
  "dueDate",
  "status",
  "attachments",
  "approvalPolicy",
]);
const RAID_DETAIL_FIELDS = new Set([
  "category",
  "cause",
  "consequence",
  "probability",
  "impact",
  "strategy",
  "responsePlan",
  "workaround",
  "rootCause",
  "sponsorId",
  "nextAction",
  "reviewDate",
]);

async function selectRaidForUpdate(client: any, projectId: string, id: string) {
  const result = await client.query(
    `SELECT i.*,r."kind",r."category",r."cause",r."consequence",r."probability",r."impact",r."severity",r."strategy",r."responsePlan",r."workaround",r."rootCause",r."sponsorId",r."nextAction",r."reviewDate",r."escalated",r."acceptedReason",r."materializedIssueId"
     FROM "delivery_items" i
     JOIN "delivery_raid_items" r ON r."deliveryItemId"=i."id"
     WHERE i."projectId"=$1 AND i."id"=$2 AND i."archivedAt" IS NULL
     FOR UPDATE`,
    [projectId, id]
  );
  return result.rows[0] || null;
}

export async function updateRaid(projectId: string, id: string, patch: any) {
  const pool = getPgPool();
  if (!pool)
    return { before: { id, projectId }, item: { id, projectId, ...patch } };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await selectRaidForUpdate(client, projectId, id);
    if (!before) throw new Error("Risco ou issue não encontrado");

    const itemEntries = Object.entries(patch)
      .filter(
        ([key, value]) => RAID_ITEM_FIELDS.has(key) && value !== undefined
      )
      .map(
        ([key, value]) =>
          [key === "attachments" ? "evidences" : key, value] as [
            string,
            unknown,
          ]
      );
    if (itemEntries.length) {
      const sets = itemEntries.map(
        ([key], index) =>
          `"${key}"=$${index + 2}${jsonColumns.has(key) ? "::jsonb" : ""}`
      );
      sets.push('"customized"=true', '"updatedAt"=now()');
      await client.query(
        `UPDATE "delivery_items" SET ${sets.join(",")} WHERE "id"=$1`,
        [id, ...itemEntries.map(([key, value]) => serialize(key, value))]
      );
    }

    const detailEntries = Object.entries(patch).filter(
      ([key, value]) => RAID_DETAIL_FIELDS.has(key) && value !== undefined
    );
    const probability = Number(patch.probability ?? before.probability ?? 1);
    const impact = Number(patch.impact ?? before.impact ?? 1);
    if (
      detailEntries.length ||
      patch.probability !== undefined ||
      patch.impact !== undefined
    ) {
      const withoutSeverity = detailEntries.filter(
        ([key]) => key !== "probability" && key !== "impact"
      );
      const entries: Array<[string, unknown]> = [
        ...withoutSeverity.map(
          ([key, value]) => [key, value] as [string, unknown]
        ),
        ["probability", probability],
        ["impact", impact],
        ["severity", probability * impact],
      ];
      const sets = entries.map(([key], index) => `"${key}"=$${index + 2}`);
      sets.push('"updatedAt"=now()');
      await client.query(
        `UPDATE "delivery_raid_items" SET ${sets.join(",")} WHERE "deliveryItemId"=$1`,
        [id, ...entries.map(([, value]) => value)]
      );
    }

    const item = await selectRaidForUpdate(client, projectId, id);
    await client.query("COMMIT");
    return { before, item };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveRaid(
  projectId: string,
  id: string,
  userId: string,
  confirmation: string
) {
  const pool = getPgPool();
  if (!pool)
    return { before: { id, projectId, code: confirmation }, item: { id } };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await selectRaidForUpdate(client, projectId, id);
    if (!before) throw new Error("Risco ou issue não encontrado");
    if (confirmation.trim().toUpperCase() !== String(before.code).toUpperCase())
      throw new Error(`Digite ${before.code} para confirmar`);
    const result = await client.query(
      `UPDATE "delivery_items"
       SET "archivedAt"=now(),"archivedBy"=$3,"updatedAt"=now()
       WHERE "id"=$1 AND "projectId"=$2 AND "archivedAt" IS NULL
       RETURNING *`,
      [id, projectId, userId]
    );
    if (!result.rows[0]) throw new Error("Risco ou issue não encontrado");
    await client.query("COMMIT");
    return { before, item: result.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const ARCHIVABLE_TABLES = [
  "bdcq_answers",
  "bdcq_questions",
  "workshops",
  "dcd_documents",
  "gaps",
  "configurations",
  "workflow_test_cases",
  "activities",
  "workflow_bdcq_templates",
  "workflow_configuration_templates",
  "workflow_workshop_templates",
  "activity_templates",
] as const;

/** Planner is the source of truth and must never participate in a TechMove reset. */
const PROTECTED_PLANNER_TABLES = new Set([
  "projects",
  "resources",
  "allocations",
  "phases",
  "absences",
  "lookups",
  "app_users",
  "project_memberships",
  "project_approval_policies",
]);

function assertPlannerIsProtected() {
  const forbidden = ARCHIVABLE_TABLES.filter(table =>
    PROTECTED_PLANNER_TABLES.has(table)
  );
  if (forbidden.length)
    throw new Error(
      `Arquivamento bloqueado: tabelas do Planner detectadas (${forbidden.join(", ")})`
    );
}

export async function previewInitialArchive() {
  assertPlannerIsProtected();
  const pool = getPgPool();
  if (!pool) return { total: 0, tables: {} };
  const tables: Record<string, number> = {};
  for (const table of ARCHIVABLE_TABLES) {
    const projectFilter = [
      "workflow_bdcq_templates",
      "workflow_configuration_templates",
      "workflow_workshop_templates",
      "activity_templates",
    ].includes(table)
      ? ""
      : "";
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "archivedAt" IS NULL${projectFilter}`
    );
    tables[table] = Number(result.rows[0]?.count || 0);
  }
  return {
    total: Object.values(tables).reduce((sum, count) => sum + count, 0),
    tables,
  };
}

export async function archiveInitialData(userId: string, reason: string) {
  assertPlannerIsProtected();
  const pool = getPgPool();
  if (!pool) return { id: `dab_${nanoid(20)}`, total: 0, tables: {} };
  const client = await pool.connect();
  const batchId = `dab_${nanoid(20)}`;
  const summary: Record<string, number> = {};
  try {
    await client.query("BEGIN");
    await client.query(
      'INSERT INTO "delivery_archive_batches" ("id","reason","summary","createdBy") VALUES ($1,$2,$3::jsonb,$4)',
      [batchId, reason, "{}", userId]
    );
    for (const table of ARCHIVABLE_TABLES) {
      const rows = await client.query(
        `SELECT * FROM "${table}" WHERE "archivedAt" IS NULL FOR UPDATE`
      );
      summary[table] = rows.rowCount || 0;
      for (const row of rows.rows) {
        await client.query(
          'INSERT INTO "delivery_archive_records" ("id","batchId","tableName","recordId","snapshot") VALUES ($1,$2,$3,$4,$5::jsonb)',
          [
            `dar_${nanoid(20)}`,
            batchId,
            table,
            String(row.id),
            JSON.stringify(row),
          ]
        );
      }
      await client.query(
        `UPDATE "${table}" SET "archivedAt"=now() WHERE "archivedAt" IS NULL`
      );
      if (
        [
          "workflow_bdcq_templates",
          "workflow_configuration_templates",
          "workflow_workshop_templates",
          "activity_templates",
        ].includes(table)
      )
        await client.query(
          `UPDATE "${table}" SET "active"=false WHERE "archivedAt" IS NOT NULL`
        );
    }
    await client.query(
      'UPDATE "delivery_archive_batches" SET "summary"=$2::jsonb WHERE "id"=$1',
      [batchId, JSON.stringify(summary)]
    );
    await client.query("COMMIT");
    return {
      id: batchId,
      total: Object.values(summary).reduce((sum, count) => sum + count, 0),
      tables: summary,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listArchiveBatches() {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    'SELECT * FROM "delivery_archive_batches" ORDER BY "createdAt" DESC'
  );
  return result.rows;
}

export async function restoreArchiveBatch(batchId: string, userId: string) {
  assertPlannerIsProtected();
  const pool = getPgPool();
  if (!pool) return { restored: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batch = await client.query(
      'SELECT * FROM "delivery_archive_batches" WHERE "id"=$1 AND "restoredAt" IS NULL FOR UPDATE',
      [batchId]
    );
    if (!batch.rows[0])
      throw new Error("Lote de arquivamento não encontrado ou já restaurado");
    const records = await client.query(
      'SELECT "tableName","recordId","snapshot" FROM "delivery_archive_records" WHERE "batchId"=$1',
      [batchId]
    );
    for (const record of records.rows) {
      if (!(ARCHIVABLE_TABLES as readonly string[]).includes(record.tableName))
        continue;
      const activeValue = record.snapshot?.active;
      await client.query(
        `UPDATE "${record.tableName}" SET "archivedAt"=NULL${activeValue !== undefined ? ',"active"=$2' : ""} WHERE "id"=$1`,
        activeValue !== undefined
          ? [record.recordId, activeValue]
          : [record.recordId]
      );
    }
    await client.query(
      'UPDATE "delivery_archive_batches" SET "restoredAt"=now(),"restoredBy"=$2 WHERE "id"=$1',
      [batchId, userId]
    );
    await client.query("COMMIT");
    return { restored: records.rowCount || 0 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
