import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { checkDatabaseReadiness } from "../db";
import { ENV } from "./env";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  diagnostics: adminProcedure.query(async () => {
    const database = await checkDatabaseReadiness();
    return {
      checkedAt: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: ENV.isProduction ? "production" : "development",
      services: [
        {
          id: "database",
          label: "Banco de dados",
          status: database.ok ? "operational" : "error",
          detail: database.ok ? `Resposta em ${database.latencyMs} ms` : database.reason,
        },
        {
          id: "storage",
          label: "Armazenamento",
          status: ENV.forgeApiUrl && ENV.forgeApiKey ? "configured" : "warning",
          detail: ENV.forgeApiUrl && ENV.forgeApiKey ? "Serviço configurado" : "Credenciais de armazenamento ausentes",
        },
        {
          id: "email",
          label: "E-mail",
          status: ENV.emailDeliveryMode === "log" || (ENV.resendApiKey && ENV.emailFrom) ? "configured" : "warning",
          detail: ENV.emailDeliveryMode === "log" ? "Modo de desenvolvimento" : ENV.resendApiKey && ENV.emailFrom ? "Provedor configurado" : "Provedor não configurado",
        },
        {
          id: "ai",
          label: "Inteligência artificial",
          status: ENV.forgeApiUrl && ENV.forgeApiKey ? "configured" : "warning",
          detail: ENV.forgeApiUrl && ENV.forgeApiKey ? "Gateway configurado" : "Gateway não configurado",
        },
        {
          id: "authentication",
          label: "Autenticação",
          status: ENV.emailAuthEnabled || ENV.demoAuthEnabled ? "operational" : "warning",
          detail: ENV.demoAuthEnabled ? "Modo demonstração" : ENV.emailAuthEnabled ? "Código por e-mail habilitado" : "Somente OAuth",
        },
      ] as const,
    };
  }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
