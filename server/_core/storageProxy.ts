import type { Express } from "express";
import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { ENV } from "./env";
import {
  localStoragePath,
  usesLocalStorage,
  verifyLocalUploadToken,
} from "../storage";

const bundledLegacyAssets: Record<string, string> = {
  "sap-library/2608_BR/1NJ/1NJ_S4CLD2608_BPD_PT_XX_a2197402.docx":
    "server/data/sap-library-recovery/1NJ_S4CLD2608_BPD_PT_XX.docx",
};

export function bundledLegacyStoragePath(key: string) {
  const relativePath = bundledLegacyAssets[key];
  return relativePath ? resolve(process.cwd(), relativePath) : null;
}

export function registerStorageProxy(app: Express) {
  app.put("/api/local-storage-upload", async (req, res) => {
    if (!usesLocalStorage()) {
      res.status(404).send("Upload local desativado");
      return;
    }
    const key = typeof req.query.key === "string" ? req.query.key : "";
    const expires = Number(req.query.expires);
    const signature =
      typeof req.query.signature === "string" ? req.query.signature : "";
    if (!key || !verifyLocalUploadToken(key, expires, signature)) {
      res.status(403).send("Autorização de upload inválida ou expirada");
      return;
    }
    const declaredSize = Number(req.headers["content-length"] || 0);
    const part = req.query.part === undefined ? null : Number(req.query.part);
    const totalParts =
      req.query.totalParts === undefined ? null : Number(req.query.totalParts);
    const chunked = part !== null || totalParts !== null;
    if (
      chunked &&
      (!Number.isInteger(part) ||
        !Number.isInteger(totalParts) ||
        (part as number) < 0 ||
        (totalParts as number) < 1 ||
        (part as number) >= (totalParts as number))
    ) {
      res.status(400).send("Parte de upload inválida");
      return;
    }
    const requestLimit = chunked ? 16 * 1024 * 1024 : 2 * 1024 * 1024 * 1024;
    if (declaredSize > requestLimit) {
      res
        .status(413)
        .send(
          chunked ? "A parte excede 16 MB" : "O ZIP excede o limite de 2 GB"
        );
      return;
    }
    try {
      const path = localStoragePath(key);
      await mkdir(dirname(path), { recursive: true });
      const writePath = chunked ? `${path}.uploading` : path;
      if (chunked && part === 0) await unlink(writePath).catch(() => undefined);
      let received = 0;
      req.on("data", chunk => {
        received += chunk.length;
        if (received > requestLimit)
          req.destroy(new Error("Parte acima do limite"));
      });
      await pipeline(
        req,
        createWriteStream(writePath, { flags: chunked ? "a" : "wx" })
      );
      if (chunked && part === (totalParts as number) - 1)
        await rename(writePath, path);
      res
        .status(chunked && part !== (totalParts as number) - 1 ? 202 : 201)
        .json({
          key,
          part,
          totalParts,
          complete: !chunked || part === (totalParts as number) - 1,
          sizeBytes: received,
        });
    } catch (error: any) {
      console.error("[StorageProxy] local upload failed:", error);
      res
        .status(error?.code === "EEXIST" ? 409 : 500)
        .send("Falha ao armazenar o ZIP");
    }
  });

  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (usesLocalStorage()) {
      try {
        const path = localStoragePath(key);
        await stat(path);
        res.set("Cache-Control", "private, max-age=300");
        res.sendFile(path);
        return;
      } catch {
        const bundledPath = bundledLegacyStoragePath(key);
        if (bundledPath) {
          try {
            await stat(bundledPath);
            res.set("Cache-Control", "private, max-age=300");
            res.sendFile(bundledPath);
            return;
          } catch (error) {
            console.error(
              `[StorageProxy] arquivo de recuperação não encontrado: ${bundledPath}`,
              error
            );
          }
        }
        if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
          res.status(404).send("Arquivo não encontrado");
          return;
        }
        console.info(
          `[StorageProxy] arquivo ausente no volume local; tentando armazenamento legado: ${key}`
        );
      }
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(
          `[StorageProxy] forge error: ${forgeResp.status} ${body}`
        );
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
