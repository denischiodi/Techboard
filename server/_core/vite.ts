import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

const APP_BASE_PATH = "/techboard";

export async function setupVite(app: Express, server: Server) {
  const dynamicImport = new Function("specifier", "return import(specifier)") as <T>(
    specifier: string,
  ) => Promise<T>;
  const { createServer: createViteServer } = await dynamicImport<typeof import("vite")>("vite");
  const { default: viteConfig } = await dynamicImport<typeof import("../../vite.config")>(
    "../../vite.config",
  );
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

    app.get("/", (_req, res) => {
    res.redirect(APP_BASE_PATH);
  });
  app.use(vite.middlewares);
  // SPA fallback: serve index.html for all /techboard/* routes that aren't assets
  app.use((req, res, next) => {
    const url = req.originalUrl;
    // Only handle requests that start with the base path and are not asset requests
    if (!url.startsWith(APP_BASE_PATH)) return next();
    // Skip requests that look like assets (have file extensions)
    if (/\.[a-zA-Z0-9]+$/.test(url) && !url.endsWith(".html")) return next();
    const clientTemplate = path.resolve(
      import.meta.dirname,
      "../..",
      "client",
      "index.html"
    );
    fs.promises.readFile(clientTemplate, "utf-8").then(async (template) => {
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    }).catch((e) => {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    });
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.get("/", (_req, res) => {
    res.redirect(APP_BASE_PATH);
  });
  app.use(APP_BASE_PATH, express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use(`${APP_BASE_PATH}*`, (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
