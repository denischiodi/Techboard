import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { validateRuntimeEnv } from "./env";
import { serveStatic, setupVite } from "./vite";
import { ensureDatabaseSchema } from "../plannerStore";
import { checkDatabaseReadiness } from "../db";
import { registerTechEduca } from "../techeduca";
import { registerWorkflowStream } from "../workflowStream";
import { syncActivitiesFromSources } from "../activitySync";
import { flushActivityEmailOutbox } from "../activityMailer";
import { startDashboardSnapshotScheduler } from "../dashboardSnapshots";
import { enqueueReconciliation, resumePendingPublications } from "../deliveryPublisher";

function isAllowedOrigin(req: express.Request) {
  const origin = req.headers.origin;
  if (!origin) return true;

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const requestHost = Array.isArray(host) ? host[0] : host;
  const requestProto = Array.isArray(proto) ? proto[0] : proto;
  if (!requestHost) return false;

  try {
    const expectedOrigin = `${String(requestProto).split(",")[0].trim()}://${requestHost}`;
    return new URL(origin).origin === new URL(expectedOrigin).origin;
  } catch {
    return false;
  }
}

async function startServer() {
  validateRuntimeEnv();
  await ensureDatabaseSchema();
  startDashboardSnapshotScheduler();

  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/health", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "delivery-resource-planner",
      uptime: process.uptime(),
    });
  });
  app.get("/ready", async (_req, res) => {
    const database = await checkDatabaseReadiness();
    res.status(database.ok ? 200 : 503).json({
      ok: database.ok,
      service: "delivery-resource-planner",
      database,
    });
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerWorkflowStream(app);
  app.use("/api/trpc", (req, res, next) => {
    if (req.method !== "GET" && !isAllowedOrigin(req)) {
      res.status(403).json({ error: "Origem da requisicao nao permitida" });
      return;
    }
    next();
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  await registerTechEduca(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000", 10);
  const host =
    process.env.HOST ||
    (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });

  const runActivityScheduler = () =>
    syncActivitiesFromSources()
      .then(() => flushActivityEmailOutbox())
      .catch(error =>
        console.warn("Falha na sincronização programada de atividades", error)
      );
  void runActivityScheduler();
  const activityTimer = setInterval(
    () => void runActivityScheduler(),
    60 * 60 * 1000
  );
  activityTimer.unref();

  const runTemplatePublisher = () =>
    enqueueReconciliation()
      .then(() => resumePendingPublications())
      .catch(error =>
        console.warn("Falha na publicação automática de padrões", error)
      );
  void runTemplatePublisher();
  const templatePublicationTimer = setInterval(
    () => void runTemplatePublisher(),
    5 * 60 * 1000
  );
  templatePublicationTimer.unref();
}

startServer().catch(console.error);
