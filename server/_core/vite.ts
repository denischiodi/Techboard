import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

const APP_BASE_PATH = "/techboard";
const SPA_ROUTE_PREFIXES = [
  "/techboard",
  "/techmove",
  "/techlead",
  "/techtask",
  "/admin",
  "/workflow",
  "/activities",
  "/dashboard",
  "/resources",
  "/projects",
  "/absences",
  "/planner",
  "/org-chart",
  "/gp-checklist",
  "/access",
  "/cadastros",
];

function isSpaRoute(pathname: string) {
  return SPA_ROUTE_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isViteModuleRequest(pathname: string) {
  return ["/@vite/", "/@react-refresh", "/@fs/", "/src/"].some(segment =>
    pathname.includes(segment)
  );
}

export function getLegacyAppRedirect(
  pathname: string,
  originalUrl: string
): string | null {
  const query = originalUrl.includes("?")
    ? originalUrl.slice(originalUrl.indexOf("?"))
    : "";
  const legacyRoutes: Record<string, string> = {
    "/techlead": "/techmove",
    "/techlead/gp-track": "/techmove/trail",
    "/techlead/teams": "/techmove/teams",
    "/techlead/indicators": "/techmove",
    "/workflow": "/techmove",
    "/workflow/scope-items": "/techmove/scope-items",
    "/workflow/bdcq": "/techmove/bdcq",
    "/workflow/workshops": "/techmove/workshops",
    "/workflow/dcd": "/techmove/dcd",
    "/workflow/gaps": "/techmove/gaps",
    "/workflow/configurations": "/techmove/configurations",
    "/workflow/tests": "/techmove/tests",
    "/activities": `${APP_BASE_PATH}/kanban`,
    "/gp-checklist": "/techmove/trail",
    "/access": "/admin/users",
    "/cadastros": "/admin/registrations",
    "/dashboard": APP_BASE_PATH,
    "/resources": `${APP_BASE_PATH}/resources`,
    "/projects": `${APP_BASE_PATH}/projects`,
    "/absences": `${APP_BASE_PATH}/absences`,
    "/planner": `${APP_BASE_PATH}/planner`,
    "/org-chart": `${APP_BASE_PATH}/org-chart`,
  };
  if (legacyRoutes[pathname]) return `${legacyRoutes[pathname]}${query}`;
  if (pathname === "/techtask/board") return `${APP_BASE_PATH}/kanban${query}`;
  if (pathname === "/techtask/my-work")
    return `${APP_BASE_PATH}/my-work${query}`;
  if (pathname === "/techtask") return `/techmove${query}`;
  return null;
}

function registerLegacyAppRedirects(app: Express) {
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    const redirectTarget = getLegacyAppRedirect(req.path, req.originalUrl);
    if (!redirectTarget) {
      next();
      return;
    }

    res.redirect(308, redirectTarget);
  });
}

export async function setupVite(app: Express, server: Server) {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier)"
  ) as <T>(specifier: string) => Promise<T>;
  const { createServer: createViteServer } =
    await dynamicImport<typeof import("vite")>("vite");
  const { default: viteConfig } =
    await dynamicImport<typeof import("../../vite.config")>(
      "../../vite.config"
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
  registerLegacyAppRedirects(app);
  // SPA fallback: serve index.html for application routes that aren't assets.
  app.use((req, res, next) => {
    const url = req.originalUrl;
    if (!isSpaRoute(req.path)) return next();
    // Vite's module URLs often have no extension or include a cache-busting
    // query. Let Vite answer them instead of returning the SPA shell as HTML.
    if (isViteModuleRequest(req.path)) return next();
    if (/\.[a-zA-Z0-9]+$/.test(req.path) && !req.path.endsWith(".html"))
      return next();
    const clientTemplate = path.resolve(
      import.meta.dirname,
      "../..",
      "client",
      "index.html"
    );
    fs.promises
      .readFile(clientTemplate, "utf-8")
      .then(async template => {
        template = template.replace(
          `src="/src/main.tsx"`,
          `src="/src/main.tsx?v=${nanoid()}"`
        );
        const page = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(page);
      })
      .catch(e => {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      });
  });
  app.use(vite.middlewares);
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
  registerLegacyAppRedirects(app);
  app.use(APP_BASE_PATH, express.static(distPath));

  // Serve the SPA shell for every application route. Static assets continue
  // to live under /techboard because that is the Vite public base.
  app.use((req, res, next) => {
    if (!isSpaRoute(req.path)) return next();
    if (/\.[a-zA-Z0-9]+$/.test(req.path) && !req.path.endsWith(".html"))
      return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
