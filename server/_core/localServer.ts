import "dotenv/config";
import { nodeHTTPRequestHandler } from "@trpc/server/adapters/node-http";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { appRouter } from "../routers";
import { checkDatabaseReadiness } from "../db";
import { isSafeLocalDemoRequest } from "./context";
import { sdk } from "./sdk";
import type { User } from "../../drizzle/schema";

const distPublic = path.resolve(import.meta.dirname, "../..", "dist", "public");
const port = Number(process.env.PORT || 3030);

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function localDemoUser(): User {
  const now = new Date();
  return {
    id: 0,
    openId: "local-demo-admin",
    name: "Demo Admin",
    email: "defechi@gmail.com",
    loginMethod: "local-demo",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

async function serveStatic(urlPath: string, res: any) {
  const safePath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const requestedPath = safePath === "/" ? "/index.html" : safePath;
  const filePath = path.resolve(distPublic, `.${requestedPath}`);
  const resolved = filePath.startsWith(distPublic) && existsSync(filePath)
    ? filePath
    : path.resolve(distPublic, "index.html");
  const body = await readFile(resolved);
  const ext = path.extname(resolved);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || `localhost:${port}`}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "delivery-resource-planner-local", uptime: process.uptime() }));
      return;
    }

    if (url.pathname === "/ready") {
      const database = await checkDatabaseReadiness();
      res.writeHead(database.ok ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: database.ok, service: "delivery-resource-planner-local", database }));
      return;
    }

    if (url.pathname.startsWith("/api/trpc/")) {
      await nodeHTTPRequestHandler({
        req,
        res,
        path: url.pathname.replace("/api/trpc/", ""),
        router: appRouter,
        createContext: async () => {
          let user: User | null = null;
          try {
            user = await sdk.authenticateRequest(req as any);
          } catch {
            user = isSafeLocalDemoRequest(req) ? localDemoUser() : null;
          }
          return {
            req: { ...req, protocol: "http" } as any,
            res: {
              clearCookie: (name: string) => {
                res.setHeader("Set-Cookie", `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
              },
            } as any,
            user,
          };
        },
      });
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (error) {
    console.error("[localServer]", error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Erro ao abrir aplicacao local");
  }
});

server.listen(port, () => {
  console.log(`Local server running on http://localhost:${port}/`);
});
