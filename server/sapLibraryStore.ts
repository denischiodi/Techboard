import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { getPgPool } from "./db";
import {
  localStoragePath,
  storageDeleteLocal,
  storageGetSignedUrl,
  storagePut,
} from "./storage";

const MANUAL_RELEASE_CODE = "__MANUAL_BR__";

export async function listReleases() {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    'SELECT * FROM "sap_content_releases" WHERE "releaseCode"<>$1 ORDER BY "createdAt" DESC',
    [MANUAL_RELEASE_CODE]
  );
  return result.rows;
}

export async function deleteFailedRelease(id: string) {
  const pool = getPgPool();
  if (!pool) return { deleted: false };
  const result = await pool.query(
    `DELETE FROM "sap_content_releases"
     WHERE "id"=$1 AND "status"='failed'
     RETURNING "storageKey"`,
    [id]
  );
  if (!result.rows[0])
    throw new Error("Somente releases com falha podem ser excluídas");
  await storageDeleteLocal(result.rows[0].storageKey);
  return { deleted: true };
}

export async function listScopes(input: {
  releaseId?: string;
  search?: string;
  limit?: number;
}) {
  const pool = getPgPool();
  if (!pool) return [];
  const values: unknown[] = [];
  const clauses = [
    input.releaseId
      ? `"releaseId"=$${values.push(input.releaseId)}`
      : `("releaseId"=(SELECT "id" FROM "sap_content_releases" WHERE "status"='active' ORDER BY "activatedAt" DESC LIMIT 1)
       OR "releaseId"=(SELECT "id" FROM "sap_content_releases" WHERE "releaseCode"='${MANUAL_RELEASE_CODE}' LIMIT 1))`,
  ];
  if (input.search?.trim()) {
    values.push(`%${input.search.trim()}%`);
    clauses.push(
      `("code" ILIKE $${values.length} OR "name" ILIKE $${values.length} OR "searchText" ILIKE $${values.length})`
    );
  }
  values.push(Math.min(input.limit || 200, 500));
  const result = await pool.query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM "sap_scope_assets" a WHERE a."scopeId"=c."id") AS "assetCount",
       (SELECT COUNT(*)::int FROM "sap_scope_assets" a WHERE a."scopeId"=c."id" AND a."assetType" IN ('doc','docx')) AS "wordAssetCount"
     FROM "sap_scope_catalog" c WHERE ${clauses.join(" AND ")}
     ORDER BY "code" LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

async function ensureManualRelease(userId: string) {
  const pool = getPgPool();
  if (!pool) throw new Error("Banco de dados indisponível");
  const existing = await pool.query(
    'SELECT * FROM "sap_content_releases" WHERE "releaseCode"=$1',
    [MANUAL_RELEASE_CODE]
  );
  if (existing.rows[0]) return existing.rows[0];
  const id = `sapr_${nanoid(20)}`;
  const result = await pool.query(
    `INSERT INTO "sap_content_releases"
      ("id","releaseCode","country","status","fileName","storageKey","checksum","sizeBytes","uploadedBy","summary")
     VALUES ($1,$2,'BR','manual','Cadastro individual','','manual-registry-v1',0,$3,'{}'::jsonb)
     ON CONFLICT ("releaseCode") DO UPDATE SET "updatedAt"=now()
     RETURNING *`,
    [id, MANUAL_RELEASE_CODE, userId]
  );
  return result.rows[0];
}

export async function createManualScope(input: {
  code: string;
  name: string;
  summary?: string;
  module?: string;
  processArea?: string;
  userId: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
}) {
  const pool = getPgPool();
  if (!pool) throw new Error("Banco de dados indisponível");
  const release = await ensureManualRelease(input.userId);
  const code = input.code.trim().toUpperCase();
  const duplicate = await pool.query(
    `SELECT 1 FROM "sap_scope_catalog" WHERE upper("code")=$1 LIMIT 1`,
    [code]
  );
  if (duplicate.rows[0])
    throw new Error(`O scope item ${code} já está cadastrado`);
  const scopeId = `saps_${nanoid(20)}`;
  await pool.query(
    `INSERT INTO "sap_scope_catalog"
      ("id","releaseId","code","name","summary","module","processArea","primaryLanguage","reviewStatus","searchText")
     VALUES ($1,$2,$3,$4,$5,$6,$7,'PT_BR','approved',$8)`,
    [
      scopeId,
      release.id,
      code,
      input.name,
      input.summary || "",
      input.module || "",
      input.processArea || "",
      `${code} ${input.name} ${input.summary || ""} ${input.module || ""} ${input.processArea || ""}`,
    ]
  );
  try {
    await addWordAsset({
      scopeId,
      userId: input.userId,
      fileName: input.fileName,
      contentType: input.contentType,
      buffer: input.buffer,
    });
  } catch (error) {
    await pool.query('DELETE FROM "sap_scope_catalog" WHERE "id"=$1', [
      scopeId,
    ]);
    throw error;
  }
  return (
    await pool.query('SELECT * FROM "sap_scope_catalog" WHERE "id"=$1', [
      scopeId,
    ])
  ).rows[0];
}

export async function updateScope(
  id: string,
  input: {
    name?: string;
    summary?: string;
    module?: string;
    processArea?: string;
  }
) {
  const pool = getPgPool();
  if (!pool) throw new Error("Banco de dados indisponível");
  const current = (
    await pool.query('SELECT * FROM "sap_scope_catalog" WHERE "id"=$1', [id])
  ).rows[0];
  if (!current) throw new Error("Scope item não encontrado");
  const next = { ...current, ...input };
  const result = await pool.query(
    `UPDATE "sap_scope_catalog" SET "name"=$2,"summary"=$3,"module"=$4,"processArea"=$5,
       "searchText"=$6,"reviewStatus"='approved',"updatedAt"=now() WHERE "id"=$1 RETURNING *`,
    [
      id,
      next.name,
      next.summary,
      next.module,
      next.processArea,
      `${current.code} ${next.name} ${next.summary} ${next.module} ${next.processArea}`,
    ]
  );
  return result.rows[0];
}

export async function addWordAsset(input: {
  scopeId: string;
  userId: string;
  fileName: string;
  contentType: string;
  buffer: Buffer;
}) {
  const pool = getPgPool();
  if (!pool) throw new Error("Banco de dados indisponível");
  const scope = (
    await pool.query('SELECT * FROM "sap_scope_catalog" WHERE "id"=$1', [
      input.scopeId,
    ])
  ).rows[0];
  if (!scope) throw new Error("Scope item não encontrado");
  const extension = input.fileName.toLowerCase().match(/\.(doc|docx)$/)?.[1];
  if (!extension) throw new Error("Anexe um documento Word (.doc ou .docx)");
  const isZip = input.buffer[0] === 0x50 && input.buffer[1] === 0x4b;
  const isOle = input.buffer
    .subarray(0, 8)
    .equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if ((extension === "docx" && !isZip) || (extension === "doc" && !isOle))
    throw new Error(
      "O conteúdo do arquivo não corresponde ao documento Word informado"
    );
  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stored = await storagePut(
    `sap-library/${scope.code}/manual/${nanoid()}-${safeName}`,
    input.buffer,
    input.contentType || "application/octet-stream"
  );
  const id = `sapa_${nanoid(20)}`;
  const result = await pool.query(
    `INSERT INTO "sap_scope_assets"
      ("id","releaseId","scopeId","scopeCode","fileName","assetType","language","contentType","sizeBytes","checksum","storageKey","url","extractedText")
     VALUES ($1,$2,$3,$4,$5,$6,'PT_BR',$7,$8,$9,$10,$11,'')
     ON CONFLICT ("releaseId","checksum") DO UPDATE SET "scopeId"=EXCLUDED."scopeId" RETURNING *`,
    [
      id,
      scope.releaseId,
      scope.id,
      scope.code,
      input.fileName,
      extension,
      input.contentType || "application/octet-stream",
      input.buffer.length,
      checksum,
      stored.key,
      stored.url,
    ]
  );
  return result.rows[0];
}

export async function assertRegisteredScopeItems(scopeCodes: string[]) {
  const pool = getPgPool();
  if (!pool || !scopeCodes.length) return;
  const codes = [
    ...new Set(
      scopeCodes.map(value => value.trim().toUpperCase()).filter(Boolean)
    ),
  ];
  const result = await pool.query(
    `SELECT c."code", COUNT(a."id") FILTER (WHERE a."assetType" IN ('doc','docx'))::int AS "wordCount"
     FROM "sap_scope_catalog" c LEFT JOIN "sap_scope_assets" a ON a."scopeId"=c."id"
     WHERE upper(c."code")=ANY($1::text[]) GROUP BY c."code"`,
    [codes]
  );
  const found = new Map(
    result.rows.map(row => [
      String(row.code).toUpperCase(),
      Number(row.wordCount),
    ])
  );
  const missing = codes.filter(code => !found.has(code));
  const withoutWord = codes.filter(code => found.has(code) && !found.get(code));
  const issues = [
    missing.length ? `não cadastrado(s): ${missing.join(", ")}` : "",
    withoutWord.length ? `sem documento Word: ${withoutWord.join(", ")}` : "",
  ].filter(Boolean);
  if (issues.length)
    throw new Error(
      `Cadastre primeiro o(s) scope item(ns) na Biblioteca SAP (${issues.join("; ")})`
    );
}

export async function listAssets(scopeId: string) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    'SELECT id,"scopeCode","fileName","assetType","language","contentType","sizeBytes","url" FROM "sap_scope_assets" WHERE "scopeId"=$1 ORDER BY CASE "language" WHEN \'PT_BR\' THEN 0 WHEN \'EN_BR\' THEN 1 ELSE 2 END,"fileName"',
    [scopeId]
  );
  return result.rows;
}

export async function registerRelease(input: {
  releaseCode: string;
  country: string;
  fileName: string;
  storageKey: string;
  sizeBytes: number;
  checksum: string;
  uploadedBy: string;
}) {
  const pool = getPgPool();
  if (!pool) return input;
  const existing = await pool.query(
    'SELECT * FROM "sap_content_releases" WHERE "checksum"=$1 OR "releaseCode"=$2',
    [input.checksum, input.releaseCode]
  );
  if (existing.rows[0]) {
    const release = existing.rows[0];
    if (release.status === "failed") {
      const refreshed = await pool.query(
        `UPDATE "sap_content_releases"
         SET "status"='uploaded',"fileName"=$2,"storageKey"=$3,"checksum"=$4,
             "sizeBytes"=$5,"uploadedBy"=$6,"lastError"='',"summary"='{}'::jsonb,"updatedAt"=now()
         WHERE "id"=$1 RETURNING *`,
        [
          release.id,
          input.fileName,
          input.storageKey,
          input.checksum,
          input.sizeBytes,
          input.uploadedBy,
        ]
      );
      void processRelease(release.id);
      return refreshed.rows[0];
    }
    return release;
  }
  const id = `sapr_${nanoid(20)}`;
  const result = await pool.query(
    `INSERT INTO "sap_content_releases"
      ("id","releaseCode","country","status","fileName","storageKey","checksum","sizeBytes","uploadedBy")
     VALUES ($1,$2,$3,'uploaded',$4,$5,$6,$7,$8) RETURNING *`,
    [
      id,
      input.releaseCode,
      input.country,
      input.fileName,
      input.storageKey,
      input.checksum,
      input.sizeBytes,
      input.uploadedBy,
    ]
  );
  void processRelease(id);
  return result.rows[0];
}

function languageFromName(fileName: string) {
  const upper = fileName.toUpperCase();
  if (upper.includes("_PT_BR")) return "PT_BR";
  if (upper.includes("_EN_BR")) return "EN_BR";
  if (upper.match(/_EN(?:_|\.|$)/)) return "EN";
  return "";
}

function scopeCodeFromName(fileName: string) {
  const base = fileName.split("/").pop() || "";
  const match = base.match(/^([A-Z0-9]{2,8})_S4CLD\d+/i);
  return match?.[1]?.toUpperCase() || "";
}

function assetType(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "unknown";
}

function cleanOpenXml(xml: string) {
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function summarizeText(code: string, text: string) {
  const lines = text
    .split(/\n+/)
    .map(line => line.trim())
    .filter(line => line.length > 8);
  const title =
    lines.find(
      line =>
        !line.toUpperCase().includes("SAP") &&
        !line.toUpperCase().includes("TEST SCRIPT") &&
        !line.includes(code)
    ) ||
    lines[0] ||
    `Scope Item ${code}`;
  return {
    title: title.slice(0, 512),
    summary: lines.slice(0, 8).join(" ").slice(0, 3000),
  };
}

export async function processRelease(releaseId: string) {
  const pool = getPgPool();
  if (!pool) return;
  try {
    await pool.query(
      'UPDATE "sap_content_releases" SET "status"=\'processing\',"updatedAt"=now() WHERE "id"=$1',
      [releaseId]
    );
    const release = (
      await pool.query('SELECT * FROM "sap_content_releases" WHERE "id"=$1', [
        releaseId,
      ])
    ).rows[0];
    // A reimportação precisa ser repetível. Uma tentativa interrompida pode deixar
    // catálogo, assets e chunks parciais; remova-os na ordem das dependências antes
    // de reconstruir a release a partir do ZIP persistido.
    await pool.query(
      'DELETE FROM "sap_knowledge_chunks" WHERE "releaseId"=$1',
      [releaseId]
    );
    await pool.query('DELETE FROM "sap_scope_assets" WHERE "releaseId"=$1', [
      releaseId,
    ]);
    await pool.query('DELETE FROM "sap_scope_catalog" WHERE "releaseId"=$1', [
      releaseId,
    ]);
    // O parser central reconhece o diretório do ZIP sem extrair arquivos no servidor.
    // A leitura usa o utilitário nativo disponível na imagem de produção.
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { createWriteStream } = await import("node:fs");
    const { Readable } = await import("node:stream");
    const { pipeline } = await import("node:stream/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const exec = promisify(execFile);
    const dir = await mkdtemp(join(tmpdir(), "sap-library-"));
    const zipPath = join(dir, "release.zip");
    const signedUrl = await storageGetSignedUrl(release.storageKey);
    if (signedUrl.startsWith("local-file://")) {
      const { copyFile } = await import("node:fs/promises");
      await copyFile(localStoragePath(release.storageKey), zipPath);
    } else {
      const response = await fetch(signedUrl);
      if (!response.ok)
        throw new Error(`Não foi possível ler o ZIP (${response.status})`);
      if (!response.body)
        throw new Error("A fonte do ZIP retornou conteúdo vazio");
      await pipeline(
        Readable.fromWeb(response.body as any),
        createWriteStream(zipPath, { flags: "wx" })
      );
    }
    try {
      const { stdout } = await exec("unzip", ["-Z1", zipPath], {
        maxBuffer: 64 * 1024 * 1024,
      });
      const names = stdout.split(/\r?\n/).filter(Boolean);
      const supported = names.filter(name =>
        /\.(docx|xlsx|pdf|pptx|doc|xls|ppt)$/i.test(name)
      );
      const codes = new Map<string, string[]>();
      let processedAssets = 0;
      for (const name of supported) {
        if (name.includes("..") || name.startsWith("/") || name.includes("\\"))
          continue;
        const code = scopeCodeFromName(name);
        if (!code) continue;
        codes.set(code, [...(codes.get(code) || []), name]);
      }
      for (const [code, files] of codes) {
        const scopeId = `saps_${nanoid(20)}`;
        await pool.query(
          `INSERT INTO "sap_scope_catalog" ("id","releaseId","code","name","summary","primaryLanguage","reviewStatus","searchText")
           VALUES ($1,$2,$3,$4::varchar,'','PT_BR','review_required',$4::text)
           ON CONFLICT ("releaseId","code") DO NOTHING`,
          [scopeId, releaseId, code, `Scope Item ${code}`]
        );
        const actualScope = (
          await pool.query(
            'SELECT "id" FROM "sap_scope_catalog" WHERE "releaseId"=$1 AND "code"=$2',
            [releaseId, code]
          )
        ).rows[0];
        for (const name of files) {
          processedAssets++;
          if (processedAssets % 25 === 0)
            await pool.query(
              `UPDATE "sap_content_releases" SET "summary"=$2::jsonb,"updatedAt"=now() WHERE "id"=$1`,
              [
                releaseId,
                JSON.stringify({
                  discovered: supported.length,
                  processed: processedAssets,
                  scopeItems: codes.size,
                }),
              ]
            );
          const extracted = await exec("unzip", ["-p", zipPath, name], {
            encoding: "buffer",
            maxBuffer: 80 * 1024 * 1024,
          } as any);
          const buffer = Buffer.from(extracted.stdout as Buffer);
          const checksum = createHash("sha256").update(buffer).digest("hex");
          const assetId = `sapa_${nanoid(20)}`;
          let extractedText = "";
          if (/\.docx$/i.test(name)) {
            const documentPath = join(dir, `${assetId}.docx`);
            await writeFile(documentPath, buffer);
            try {
              const documentXml = await exec(
                "unzip",
                ["-p", documentPath, "word/document.xml"],
                {
                  maxBuffer: 32 * 1024 * 1024,
                }
              );
              extractedText = cleanOpenXml(
                String(documentXml.stdout || "")
              ).slice(0, 250_000);
            } catch {
              extractedText = "";
            }
          }
          const stored = await storagePut(
            `sap-library/${release.releaseCode}/${code}/${name.split("/").pop()}`,
            buffer,
            "application/octet-stream"
          );
          const insertedAsset = await pool.query(
            `INSERT INTO "sap_scope_assets"
             ("id","releaseId","scopeId","scopeCode","fileName","assetType","language","sizeBytes","checksum","storageKey","url","extractedText")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT ("releaseId","checksum") DO UPDATE
             SET "scopeId"=EXCLUDED."scopeId","scopeCode"=EXCLUDED."scopeCode",
                 "fileName"=EXCLUDED."fileName","assetType"=EXCLUDED."assetType",
                 "language"=EXCLUDED."language","sizeBytes"=EXCLUDED."sizeBytes",
                 "storageKey"=EXCLUDED."storageKey","url"=EXCLUDED."url",
                 "extractedText"=EXCLUDED."extractedText"
             RETURNING "id"`,
            [
              assetId,
              releaseId,
              actualScope.id,
              code,
              name.split("/").pop(),
              assetType(name),
              languageFromName(name),
              buffer.length,
              checksum,
              stored.key,
              stored.url,
              extractedText,
            ]
          );
          const persistedAssetId = insertedAsset.rows[0]?.id || assetId;
          if (extractedText) {
            const chunks = extractedText.match(/[\s\S]{1,3500}(?:\s|$)/g) || [];
            for (let index = 0; index < Math.min(chunks.length, 30); index++) {
              await pool.query(
                `INSERT INTO "sap_knowledge_chunks" ("id","releaseId","scopeCode","assetId","chunkIndex","content","language")
                 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("assetId","chunkIndex") DO NOTHING`,
                [
                  `sapk_${nanoid(20)}`,
                  releaseId,
                  code,
                  persistedAssetId,
                  index,
                  chunks[index],
                  languageFromName(name),
                ]
              );
            }
            if (languageFromName(name) === "PT_BR") {
              const summary = summarizeText(code, extractedText);
              await pool.query(
                `UPDATE "sap_scope_catalog" SET "name"=$3,"summary"=$4,"searchText"=$5,
                 "reviewStatus"='review_required',"updatedAt"=now() WHERE "releaseId"=$1 AND "code"=$2`,
                [
                  releaseId,
                  code,
                  summary.title,
                  summary.summary,
                  `${code} ${summary.title} ${summary.summary}`,
                ]
              );
            }
          }
        }
      }
      await pool.query(
        `UPDATE "sap_content_releases" SET "status"='ready',"summary"=$2::jsonb,"updatedAt"=now() WHERE "id"=$1`,
        [
          releaseId,
          JSON.stringify({
            files: supported.length,
            scopeItems: codes.size,
            ignored: names.length - supported.length,
          }),
        ]
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (error: any) {
    await pool.query(
      'UPDATE "sap_content_releases" SET "status"=\'failed\',"lastError"=$2,"updatedAt"=now() WHERE "id"=$1',
      [releaseId, String(error?.message || error)]
    );
  }
}

export async function resumePendingSapImports() {
  const pool = getPgPool();
  if (!pool) return;
  const result = await pool.query(
    `SELECT "id" FROM "sap_content_releases"
     WHERE "status"='uploaded' OR ("status"='processing' AND "updatedAt"<now()-interval '30 minutes')
     ORDER BY "createdAt" LIMIT 3`
  );
  for (const row of result.rows) void processRelease(row.id);
}

export async function activateRelease(id: string, userId: string) {
  const pool = getPgPool();
  if (!pool) return { id };
  return pool.query("BEGIN").then(async () => {
    try {
      await pool.query(
        'UPDATE "sap_content_releases" SET "status"=\'archived\' WHERE "status"=\'active\''
      );
      const result = await pool.query(
        `UPDATE "sap_content_releases" SET "status"='active',"activatedBy"=$2,"activatedAt"=now(),"updatedAt"=now()
         WHERE "id"=$1 AND "status"='ready' RETURNING *`,
        [id, userId]
      );
      if (!result.rows[0])
        throw new Error("A release precisa estar pronta antes da ativação");
      await pool.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  });
}

export async function getKnowledgeContext(scopeCodes: string[]) {
  const pool = getPgPool();
  if (!pool || !scopeCodes.length) return { releaseCode: "", entries: [] };
  const release = (
    await pool.query(
      'SELECT * FROM "sap_content_releases" WHERE "status"=\'active\' ORDER BY "activatedAt" DESC LIMIT 1'
    )
  ).rows[0];
  if (!release) return { releaseCode: "", entries: [] };
  const result = await pool.query(
    `SELECT c."code",c."name",c."summary",
       COALESCE((SELECT string_agg(k."content", E'\n---\n' ORDER BY
         CASE k."language" WHEN 'PT_BR' THEN 0 WHEN 'EN_BR' THEN 1 ELSE 2 END,k."chunkIndex")
         FROM (SELECT * FROM "sap_knowledge_chunks" x
               WHERE x."releaseId"=c."releaseId" AND x."scopeCode"=c."code"
               ORDER BY CASE x."language" WHEN 'PT_BR' THEN 0 WHEN 'EN_BR' THEN 1 ELSE 2 END,x."chunkIndex"
               LIMIT 2) k),'') AS "context"
     FROM "sap_scope_catalog" c
     WHERE c."releaseId"=$1 AND c."code"=ANY($2::text[]) ORDER BY c."code" LIMIT 20`,
    [release.id, scopeCodes]
  );
  return { releaseCode: release.releaseCode, entries: result.rows };
}
