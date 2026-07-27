// Preconfigured storage helpers for Manus WebDev templates
// Uploads via Forge Server presigned URL to S3 (PUT direct).
// Downloads return /manus-storage/{key} paths served via 307 redirect.

import { ENV } from "./_core/env";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function localStorageRoot() {
  const configuredRoot =
    process.env.LOCAL_STORAGE_DIR ||
    (process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "techboard-storage")
      : "");
  return resolve(configuredRoot || join(tmpdir(), "techboard-storage"));
}

export function localStoragePath(relKey: string): string {
  const root = localStorageRoot();
  const path = resolve(root, normalizeKey(relKey));
  if (path !== root && !path.startsWith(root + sep))
    throw new Error("Chave de armazenamento inválida");
  return path;
}

function localUploadSignature(key: string, expires: number) {
  return createHmac("sha256", ENV.cookieSecret)
    .update(`${key}:${expires}`)
    .digest("hex");
}

export function verifyLocalUploadToken(key: string, expires: number, signature: string) {
  if (!Number.isFinite(expires) || expires < Date.now() || expires > Date.now() + 5 * 60 * 60_000)
    return false;
  const expected = localUploadSignature(key, expires);
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePresignPut(
  relKey: string,
): Promise<{ key: string; uploadUrl: string; url: string; localUpload?: { expires: number; signature: string } }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    const expires = Date.now() + 4 * 60 * 60_000;
    const signature = localUploadSignature(key, expires);
    return {
      key,
      uploadUrl: `/api/local-storage-upload?key=${encodeURIComponent(key)}&expires=${expires}&signature=${signature}`,
      url: `/manus-storage/${key}`,
      localUpload: { expires, signature },
    };
  }
  const { forgeUrl, forgeKey } = getForgeConfig();
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const response = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage presign failed (${response.status}): ${message}`);
  }
  const { url: uploadUrl } = (await response.json()) as { url: string };
  if (!uploadUrl) throw new Error("Forge returned empty presign URL");
  return { key, uploadUrl, url: `/manus-storage/${key}` };
}

export async function storagePutLocalChunk(input: {
  key: string;
  expires: number;
  signature: string;
  part: number;
  totalParts: number;
  offset: number;
  totalSize: number;
  data: Buffer;
}) {
  if (!verifyLocalUploadToken(input.key, input.expires, input.signature))
    throw new Error("Autorização do upload expirada; selecione o ZIP novamente");
  if (input.data.length > 4 * 1024 * 1024)
    throw new Error("Parte do upload acima de 4 MB");
  const path = localStoragePath(input.key);
  const uploadingPath = `${path}.uploading`;
  await mkdir(dirname(path), { recursive: true });
  if (input.part === 0) await unlink(uploadingPath).catch(() => undefined);
  const currentSize = await stat(uploadingPath).then(file => file.size).catch(() => 0);
  if (currentSize !== input.offset)
    throw new Error(`Parte fora de ordem: esperado offset ${currentSize}, recebido ${input.offset}`);
  await appendFile(uploadingPath, input.data);
  if (input.part === input.totalParts - 1) {
    const completedSize = (await stat(uploadingPath)).size;
    if (completedSize !== input.totalSize)
      throw new Error(`Upload incompleto: esperado ${input.totalSize} bytes, recebido ${completedSize}`);
    await rename(uploadingPath, path);
  }
  return { complete: input.part === input.totalParts - 1 };
}

export async function storageValidateUpload(relKey: string, expectedSize: number) {
  if (ENV.forgeApiUrl && ENV.forgeApiKey) return;
  const file = await stat(localStoragePath(relKey)).catch(() => null);
  if (!file) throw new Error("ZIP não encontrado após o envio");
  if (file.size !== expectedSize)
    throw new Error(`ZIP incompleto: esperado ${expectedSize} bytes, recebido ${file.size}`);
}

export async function storageDeleteLocal(relKey: string) {
  if (ENV.forgeApiUrl && ENV.forgeApiKey) return;
  await unlink(localStoragePath(relKey)).catch(() => undefined);
  await unlink(`${localStoragePath(relKey)}.uploading`).catch(() => undefined);
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    const path = localStoragePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { key, url: `/manus-storage/${key}` };
  }
  const { forgeUrl, forgeKey } = getForgeConfig();

  // 1. Get presigned PUT URL from Forge
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  // 2. PUT file directly to S3
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey)
    return `local-file://${localStoragePath(relKey)}`;
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = normalizeKey(relKey);

  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", key);

  const resp = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }

  const { url } = (await resp.json()) as { url: string };
  return url;
}
