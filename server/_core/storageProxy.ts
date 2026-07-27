import type { Express } from "express";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { ENV } from "./env";
import { localStoragePath, verifyLocalUploadToken } from "../storage";

export function registerStorageProxy(app: Express) {
  app.put("/api/local-storage-upload", async (req, res) => {
    if (ENV.forgeApiUrl && ENV.forgeApiKey) {
      res.status(404).send("Upload local desativado");
      return;
    }
    const key = typeof req.query.key === "string" ? req.query.key : "";
    const expires = Number(req.query.expires);
    const signature = typeof req.query.signature === "string" ? req.query.signature : "";
    if (!key || !verifyLocalUploadToken(key, expires, signature)) {
      res.status(403).send("Autorização de upload inválida ou expirada");
      return;
    }
    const declaredSize = Number(req.headers["content-length"] || 0);
    if (declaredSize > 2 * 1024 * 1024 * 1024) {
      res.status(413).send("O ZIP excede o limite de 2 GB");
      return;
    }
    try {
      const path = localStoragePath(key);
      await mkdir(dirname(path), { recursive: true });
      let received = 0;
      req.on("data", chunk => {
        received += chunk.length;
        if (received > 2 * 1024 * 1024 * 1024) req.destroy(new Error("ZIP acima de 2 GB"));
      });
      await pipeline(req, createWriteStream(path, { flags: "wx" }));
      res.status(201).json({ key, sizeBytes: received });
    } catch (error: any) {
      console.error("[StorageProxy] local upload failed:", error);
      res.status(error?.code === "EEXIST" ? 409 : 500).send("Falha ao armazenar o ZIP");
    }
  });

  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      try {
        const path = localStoragePath(key);
        await stat(path);
        res.set("Cache-Control", "private, max-age=300");
        res.sendFile(path);
      } catch {
        res.status(404).send("Arquivo não encontrado");
      }
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
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
