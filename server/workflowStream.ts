import type { Express, Request, Response } from "express";
import { createContext } from "./_core/context";
import * as store from "./plannerStore";
import { assertWorkflowProjectAccess } from "./workflowAccess";
import { streamDcdGeneration } from "./routers/workflow";

function sendEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function registerWorkflowStream(app: Express) {
  app.get("/api/workflow/dcd/stream", async (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    let closed = false;
    req.on("close", () => { closed = true; });
    const heartbeat = setInterval(() => { if (!closed) res.write(": heartbeat\n\n"); }, 15_000);
    try {
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
      const module = typeof req.query.module === "string" ? req.query.module.trim().slice(0, 128) : undefined;
      const forceRegenerate = req.query.forceRegenerate === "true";
      if (!projectId) throw new Error("Projeto é obrigatório");
      const context = await createContext({ req, res });
      if (!context.user?.email) throw new Error("Sessão expirada ou usuário não autenticado");
      const appUser = await store.getAppUserByEmail(context.user.email);
      if (!appUser?.active) throw new Error("Usuário sem acesso ativo");
      await assertWorkflowProjectAccess(appUser, projectId, true);
      sendEvent(res, "status", { stage: "preparing", message: "Preparando contexto do projeto..." });
      const result = await streamDcdGeneration({
        projectId, module: module || undefined, forceRegenerate,
        user: { id: appUser.id, name: appUser.name || appUser.email },
        onDelta: (delta: string) => { if (!closed) sendEvent(res, "delta", { text: delta }); },
      });
      if (!closed) {
        sendEvent(res, "complete", result);
        res.end();
      }
    } catch (error: any) {
      if (!closed) { sendEvent(res, "generation_error", { message: error?.message || "Erro ao gerar DCD" }); res.end(); }
    } finally {
      clearInterval(heartbeat);
    }
  });
}
