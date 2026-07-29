import { nanoid } from "nanoid";
import { getPgPool } from "./db";

export type DdaImportInputItem = {
  module: string;
  code?: string;
  name: string;
  processArea?: string;
  description?: string;
  active?: number;
};

export function normalizeScopeCode(code: unknown) {
  return String(code ?? "")
    .trim()
    .toUpperCase();
}

function scopeValues(
  projectId: string,
  item: DdaImportInputItem,
  code: string
) {
  return [
    projectId,
    item.module || "Geral",
    code,
    item.name,
    item.processArea || "",
    item.description || "",
    item.active ?? 1,
  ];
}

async function insertScopeItem(
  client: { query: (sql: string, values?: unknown[]) => Promise<any> },
  projectId: string,
  item: DdaImportInputItem,
  code: string
) {
  const id = nanoid();
  await client.query(
    `INSERT INTO "scope_items"
      ("id","projectId","module","code","name","processArea","description","active")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, ...scopeValues(projectId, item, code)]
  );
  return id;
}

async function updateScopeItem(
  client: { query: (sql: string, values?: unknown[]) => Promise<any> },
  id: string,
  projectId: string,
  item: DdaImportInputItem,
  code: string
) {
  await client.query(
    `UPDATE "scope_items"
     SET "module"=$3,"code"=$4,"name"=$5,"processArea"=$6,
         "description"=$7,"active"=$8,"updatedAt"=now()
     WHERE "id"=$1 AND "projectId"=$2`,
    [id, ...scopeValues(projectId, item, code)]
  );
}

async function refreshBatch(
  client: { query: (sql: string, values?: unknown[]) => Promise<any> },
  batchId: string
) {
  await client.query(
    `UPDATE "dda_import_batches" b SET
       "created"=(SELECT COUNT(*)::int FROM "dda_import_items" i WHERE i."batchId"=b."id" AND i."result"='created'),
       "updated"=(SELECT COUNT(*)::int FROM "dda_import_items" i WHERE i."batchId"=b."id" AND i."result"='updated'),
       "pending"=(SELECT COUNT(*)::int FROM "dda_import_items" i WHERE i."batchId"=b."id" AND i."status"='pending'),
       "status"=CASE WHEN EXISTS (
         SELECT 1 FROM "dda_import_items" i WHERE i."batchId"=b."id" AND i."status"='pending'
       ) THEN 'completed_with_warnings' ELSE 'completed' END,
       "completedAt"=now(),"updatedAt"=now()
     WHERE b."id"=$1`,
    [batchId]
  );
}

export async function importDdaBatch(input: {
  projectId: string;
  fileName: string;
  importedBy: string;
  items: DdaImportInputItem[];
}) {
  const pool = getPgPool();
  if (!pool) {
    return {
      batchId: "",
      created: 0,
      updated: 0,
      pending: input.items.length,
      total: input.items.length,
      modules: [] as string[],
    };
  }
  const client = await pool.connect();
  const batchId = `ddab_${nanoid(20)}`;
  let created = 0;
  let updated = 0;
  let pending = 0;
  const modules = new Set<string>();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO "dda_import_batches"
        ("id","projectId","fileName","status","total","importedBy")
       VALUES ($1,$2,$3,'processing',$4,$5)`,
      [
        batchId,
        input.projectId,
        input.fileName,
        input.items.length,
        input.importedBy,
      ]
    );

    const codes = Array.from(
      new Set(
        input.items.map(item => normalizeScopeCode(item.code)).filter(Boolean)
      )
    );
    const catalog = codes.length
      ? await client.query(
          `SELECT DISTINCT UPPER(BTRIM(c."code")) AS "code"
           FROM "sap_scope_catalog" c
           INNER JOIN "sap_content_releases" r ON r."id"=c."releaseId"
           WHERE r."status" IN ('ready','active','archived')
             AND UPPER(BTRIM(c."code"))=ANY($1::text[])`,
          [codes]
        )
      : { rows: [] };
    const registered = new Set<string>(
      catalog.rows.map((row: any) => normalizeScopeCode(row.code))
    );
    const existing = codes.length
      ? await client.query(
          `SELECT "id",UPPER(BTRIM("code")) AS "normalizedCode"
           FROM "scope_items"
           WHERE "projectId"=$1 AND UPPER(BTRIM("code"))=ANY($2::text[])`,
          [input.projectId, codes]
        )
      : { rows: [] };
    const scopeByCode = new Map<string, string>(
      existing.rows.map((row: any) => [row.normalizedCode, row.id])
    );

    for (const item of input.items) {
      const code = normalizeScopeCode(item.code);
      const itemId = `ddai_${nanoid(20)}`;
      let status = "pending";
      let result = "";
      let errorCode = "";
      let errorMessage = "";
      let scopeItemId = "";

      if (!code) {
        pending++;
        errorCode = "invalid_code";
        errorMessage =
          "A linha do DDA não possui um código de Scope Item válido.";
      } else if (!registered.has(code)) {
        pending++;
        errorCode = "not_registered";
        errorMessage = `O Scope Item ${code} não está cadastrado em nenhuma release SAP processada.`;
      } else {
        const existingId = scopeByCode.get(code);
        if (existingId) {
          await updateScopeItem(
            client,
            existingId,
            input.projectId,
            item,
            code
          );
          scopeItemId = existingId;
          status = "resolved";
          result = "updated";
          updated++;
        } else {
          scopeItemId = await insertScopeItem(
            client,
            input.projectId,
            item,
            code
          );
          scopeByCode.set(code, scopeItemId);
          status = "resolved";
          result = "created";
          created++;
        }
        modules.add(item.module || "Geral");
      }

      await client.query(
        `INSERT INTO "dda_import_items"
          ("id","batchId","projectId","code","normalizedCode","status","result",
           "errorCode","errorMessage","payload","attempts","scopeItemId","resolvedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,1,$11,
           CASE WHEN $6='resolved' THEN now() ELSE NULL END)`,
        [
          itemId,
          batchId,
          input.projectId,
          String(item.code || "").trim(),
          code,
          status,
          result,
          errorCode,
          errorMessage,
          JSON.stringify(item),
          scopeItemId,
        ]
      );
    }

    await client.query(
      `UPDATE "dda_import_batches" SET
        "status"=$2,"created"=$3,"updated"=$4,"pending"=$5,
        "completedAt"=now(),"updatedAt"=now()
       WHERE "id"=$1`,
      [
        batchId,
        pending ? "completed_with_warnings" : "completed",
        created,
        updated,
        pending,
      ]
    );
    await client.query("COMMIT");
    return {
      batchId,
      created,
      updated,
      pending,
      total: input.items.length,
      modules: Array.from(modules),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listDdaImportBatches(projectId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT b.*,
      COALESCE(json_agg(json_build_object(
        'id',i."id",'code',i."code",'status',i."status",'result',i."result",
        'errorCode',i."errorCode",'errorMessage',i."errorMessage",
        'attempts',i."attempts",'scopeItemId',i."scopeItemId",
        'resolvedAt',i."resolvedAt",'payload',i."payload"
      ) ORDER BY i."createdAt") FILTER (WHERE i."id" IS NOT NULL),'[]'::json) AS "items"
     FROM "dda_import_batches" b
     LEFT JOIN "dda_import_items" i ON i."batchId"=b."id"
     WHERE b."projectId"=$1
     GROUP BY b."id"
     ORDER BY b."createdAt" DESC
     LIMIT 20`,
    [projectId]
  );
  return result.rows;
}

export async function reprocessDdaImportsForRelease(releaseId: string) {
  const pool = getPgPool();
  if (!pool) return { resolved: 0, batches: 0, modules: [] as string[] };
  const client = await pool.connect();
  const touchedBatches = new Set<string>();
  const modules = new Set<string>();
  let resolved = 0;
  try {
    await client.query("BEGIN");
    const pending = await client.query(
      `SELECT i.*
       FROM "dda_import_items" i
       WHERE i."status"='pending'
         AND i."errorCode"='not_registered'
         AND EXISTS (
           SELECT 1 FROM "sap_scope_catalog" c
           WHERE c."releaseId"=$1
             AND UPPER(BTRIM(c."code"))=i."normalizedCode"
         )
       ORDER BY i."createdAt"
       FOR UPDATE SKIP LOCKED`,
      [releaseId]
    );

    for (const row of pending.rows) {
      const item = (row.payload || {}) as DdaImportInputItem;
      const code = normalizeScopeCode(row.normalizedCode);
      const existing = await client.query(
        `SELECT "id" FROM "scope_items"
         WHERE "projectId"=$1 AND UPPER(BTRIM("code"))=$2
         ORDER BY "createdAt" LIMIT 1`,
        [row.projectId, code]
      );
      let scopeItemId = existing.rows[0]?.id as string | undefined;
      let result = "updated";
      if (scopeItemId) {
        await updateScopeItem(client, scopeItemId, row.projectId, item, code);
      } else {
        scopeItemId = await insertScopeItem(client, row.projectId, item, code);
        result = "created";
      }
      await client.query(
        `UPDATE "dda_import_items" SET
          "status"='resolved',"result"=$2,"errorCode"='',"errorMessage"='',"attempts"="attempts"+1,
          "scopeItemId"=$3,"resolvedAt"=now(),"updatedAt"=now()
         WHERE "id"=$1 AND "status"='pending'`,
        [row.id, result, scopeItemId]
      );
      touchedBatches.add(row.batchId);
      modules.add(item.module || "Geral");
      resolved++;
    }

    for (const batchId of touchedBatches) await refreshBatch(client, batchId);
    await client.query("COMMIT");
    return {
      resolved,
      batches: touchedBatches.size,
      modules: Array.from(modules),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
