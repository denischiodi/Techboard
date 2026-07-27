import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { getPgPool } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";

export async function listReleases() {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    'SELECT * FROM "sap_content_releases" ORDER BY "createdAt" DESC'
  );
  return result.rows;
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
      : '"releaseId"=(SELECT "id" FROM "sap_content_releases" WHERE "status"=\'active\' ORDER BY "activatedAt" DESC LIMIT 1)',
  ];
  if (input.search?.trim()) {
    values.push(`%${input.search.trim()}%`);
    clauses.push(`("code" ILIKE $${values.length} OR "name" ILIKE $${values.length} OR "searchText" ILIKE $${values.length})`);
  }
  values.push(Math.min(input.limit || 200, 500));
  const result = await pool.query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM "sap_scope_assets" a WHERE a."scopeId"=c."id") AS "assetCount"
     FROM "sap_scope_catalog" c WHERE ${clauses.join(" AND ")}
     ORDER BY "code" LIMIT $${values.length}`,
    values
  );
  return result.rows;
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
  if (existing.rows[0]) return existing.rows[0];
  const id = `sapr_${nanoid(20)}`;
  const result = await pool.query(
    `INSERT INTO "sap_content_releases"
      ("id","releaseCode","country","status","fileName","storageKey","checksum","sizeBytes","uploadedBy")
     VALUES ($1,$2,$3,'uploaded',$4,$5,$6,$7,$8) RETURNING *`,
    [id, input.releaseCode, input.country, input.fileName, input.storageKey, input.checksum, input.sizeBytes, input.uploadedBy]
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
  const lines = text.split(/\n+/).map(line => line.trim()).filter(line => line.length > 8);
  const title = lines.find(line =>
    !line.toUpperCase().includes("SAP") &&
    !line.toUpperCase().includes("TEST SCRIPT") &&
    !line.includes(code)
  ) || lines[0] || `Scope Item ${code}`;
  return {
    title: title.slice(0, 512),
    summary: lines.slice(0, 8).join(" ").slice(0, 3000),
  };
}

export async function processRelease(releaseId: string) {
  const pool = getPgPool();
  if (!pool) return;
  try {
    await pool.query('UPDATE "sap_content_releases" SET "status"=\'processing\',"updatedAt"=now() WHERE "id"=$1', [releaseId]);
    const release = (await pool.query('SELECT * FROM "sap_content_releases" WHERE "id"=$1', [releaseId])).rows[0];
    const signedUrl = await storageGetSignedUrl(release.storageKey);
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`Não foi possível ler o ZIP (${response.status})`);
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
    if (!response.body) throw new Error("A fonte do ZIP retornou conteúdo vazio");
    await pipeline(
      Readable.fromWeb(response.body as any),
      createWriteStream(zipPath, { flags: "wx" })
    );
    try {
      const { stdout } = await exec("unzip", ["-Z1", zipPath], { maxBuffer: 64 * 1024 * 1024 });
      const names = stdout.split(/\r?\n/).filter(Boolean);
      const supported = names.filter(name => /\.(docx|xlsx|pdf|pptx|doc|xls|ppt)$/i.test(name));
      const codes = new Map<string, string[]>();
      let processedAssets = 0;
      for (const name of supported) {
        if (name.includes("..") || name.startsWith("/") || name.includes("\\")) continue;
        const code = scopeCodeFromName(name);
        if (!code) continue;
        codes.set(code, [...(codes.get(code) || []), name]);
      }
      for (const [code, files] of codes) {
        const scopeId = `saps_${nanoid(20)}`;
        await pool.query(
          `INSERT INTO "sap_scope_catalog" ("id","releaseId","code","name","summary","primaryLanguage","reviewStatus","searchText")
           VALUES ($1,$2,$3,$4,'','PT_BR','review_required',$4)
           ON CONFLICT ("releaseId","code") DO NOTHING`,
          [scopeId, releaseId, code, `Scope Item ${code}`]
        );
        const actualScope = (await pool.query(
          'SELECT "id" FROM "sap_scope_catalog" WHERE "releaseId"=$1 AND "code"=$2',
          [releaseId, code]
        )).rows[0];
        for (const name of files) {
          processedAssets++;
          if (processedAssets % 25 === 0)
            await pool.query(
              `UPDATE "sap_content_releases" SET "summary"=$2::jsonb,"updatedAt"=now() WHERE "id"=$1`,
              [releaseId, JSON.stringify({ discovered: supported.length, processed: processedAssets, scopeItems: codes.size })]
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
              const documentXml = await exec("unzip", ["-p", documentPath, "word/document.xml"], {
                maxBuffer: 32 * 1024 * 1024,
              });
              extractedText = cleanOpenXml(String(documentXml.stdout || "")).slice(0, 250_000);
            } catch {
              extractedText = "";
            }
          }
          const stored = await storagePut(
            `sap-library/${release.releaseCode}/${code}/${name.split("/").pop()}`,
            buffer,
            "application/octet-stream"
          );
          await pool.query(
            `INSERT INTO "sap_scope_assets"
             ("id","releaseId","scopeId","scopeCode","fileName","assetType","language","sizeBytes","checksum","storageKey","url","extractedText")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT ("releaseId","checksum") DO NOTHING`,
            [assetId, releaseId, actualScope.id, code, name.split("/").pop(), assetType(name), languageFromName(name), buffer.length, checksum, stored.key, stored.url, extractedText]
          );
          if (extractedText) {
            const chunks = extractedText.match(/[\s\S]{1,3500}(?:\s|$)/g) || [];
            for (let index = 0; index < Math.min(chunks.length, 30); index++) {
              await pool.query(
                `INSERT INTO "sap_knowledge_chunks" ("id","releaseId","scopeCode","assetId","chunkIndex","content","language")
                 VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT ("assetId","chunkIndex") DO NOTHING`,
                [`sapk_${nanoid(20)}`, releaseId, code, assetId, index, chunks[index], languageFromName(name)]
              );
            }
            if (languageFromName(name) === "PT_BR") {
              const summary = summarizeText(code, extractedText);
              await pool.query(
                `UPDATE "sap_scope_catalog" SET "name"=$3,"summary"=$4,"searchText"=$5,
                 "reviewStatus"='review_required',"updatedAt"=now() WHERE "releaseId"=$1 AND "code"=$2`,
                [releaseId, code, summary.title, summary.summary, `${code} ${summary.title} ${summary.summary}`]
              );
            }
          }
        }
      }
      await pool.query(
        `UPDATE "sap_content_releases" SET "status"='ready',"summary"=$2::jsonb,"updatedAt"=now() WHERE "id"=$1`,
        [releaseId, JSON.stringify({ files: supported.length, scopeItems: codes.size, ignored: names.length - supported.length })]
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
      await pool.query('UPDATE "sap_content_releases" SET "status"=\'archived\' WHERE "status"=\'active\'');
      const result = await pool.query(
        `UPDATE "sap_content_releases" SET "status"='active',"activatedBy"=$2,"activatedAt"=now(),"updatedAt"=now()
         WHERE "id"=$1 AND "status"='ready' RETURNING *`,
        [id, userId]
      );
      if (!result.rows[0]) throw new Error("A release precisa estar pronta antes da ativação");
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
  const release = (await pool.query(
    'SELECT * FROM "sap_content_releases" WHERE "status"=\'active\' ORDER BY "activatedAt" DESC LIMIT 1'
  )).rows[0];
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
