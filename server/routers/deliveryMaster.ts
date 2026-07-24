import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { assertWorkflowProjectAccess } from "../workflowAccess";
import * as store from "../deliveryMasterStore";
import * as workflowDb from "./workflowDb";
import * as plannerStore from "../plannerStore";
import * as publisher from "../deliveryPublisher";

const typeSchema = z.enum(store.DELIVERY_TYPES);
const approvalSchema = z.object({
  mode: z.enum(["none", "any", "all", "minimum"]).default("none"),
  minimumApprovals: z.number().int().min(1).default(1),
});
const templateInput = z.object({
  type: typeSchema, title: z.string().trim().min(1).max(512), description: z.string().max(10000).default(""),
  instructions: z.string().max(20000).default(""), phase: z.string().max(32).default("Prepare"),
  stage: z.string().trim().min(1).max(64), modules: z.array(z.string().max(128)).max(100).default([]),
  scopeItemKeys: z.array(z.string().max(128)).max(1000).default([]), projectIds: z.array(z.string().max(64)).max(500).default([]),
  required: z.boolean().default(true), sortOrder: z.number().int().min(0).default(0),
  dependencyTemplateIds: z.array(z.string().max(64)).max(100).default([]), ownerRole: z.string().max(64).default("consultant"),
  dueOffsetDays: z.number().int().min(-365).max(3650).default(0), evidenceRequirements: z.array(z.string().max(255)).max(100).default([]),
  approvalPolicy: approvalSchema.default({ mode: "none", minimumApprovals: 1 }), completionCriteria: z.string().max(10000).default(""),
  payload: z.record(z.string(), z.unknown()).default({}), effectiveFrom: z.string().max(10).default(""), active: z.boolean().default(true),
});
const raidInput = z.object({
  kind: z.enum(["risk", "issue"]), title: z.string().trim().min(1).max(512), description: z.string().max(10000).default(""),
  phase: z.string().max(32).default("Prepare"), module: z.string().max(128).default(""), scopeItemIds: z.array(z.string()).default([]),
  category: z.string().max(128).default(""), cause: z.string().max(10000).default(""), consequence: z.string().max(10000).default(""),
  probability: z.number().int().min(1).max(5).default(1), impact: z.number().int().min(1).max(5).default(1),
  strategy: z.enum(["", "avoid", "mitigate", "transfer", "accept"]).default(""), responsePlan: z.string().max(10000).default(""),
  workaround: z.string().max(10000).default(""), rootCause: z.string().max(10000).default(""), responsibleId: z.string().max(64).default(""),
  sponsorId: z.string().max(64).default(""), nextAction: z.string().max(2000).default(""), dueDate: z.string().max(10).default(""),
  reviewDate: z.string().max(10).default(""), required: z.boolean().default(false), status: z.string().max(32).default("open"),
  attachments: z.array(z.object({ name: z.string(), url: z.string(), contentType: z.string() })).default([]), approvalPolicy: approvalSchema.optional(),
});

function normalizeModule(value: unknown) {
  return String(value || "").trim().toLocaleUpperCase("pt-BR");
}

function assertTemplateManager(appUser: any, input: { type?: string; modules?: string[] }) {
  if (appUser.role === "admin") return;
  if (appUser.role !== "technical_lead") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente administradores e líderes técnicos podem manter padrões" });
  }
  if (input.type === "activity" || !input.modules?.length) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Padrões gerais e da Trilha do GP são administrados pelo perfil administrador" });
  }
  const owned = new Set((appUser.teamFronts || []).map(normalizeModule));
  const unauthorized = input.modules.filter(module => !owned.has(normalizeModule(module)));
  if (unauthorized.length) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Você não responde pelo(s) módulo(s): ${unauthorized.join(", ")}` });
  }
}

export const deliveryMasterRouter = router({
  templates: router({
    list: protectedProcedure.input(z.object({ type: typeSchema.optional(), includeArchived: z.boolean().default(false) }).default({ includeArchived: false })).query(({ input }) => store.listTemplates(input)),
    create: protectedProcedure.input(templateInput).mutation(async ({ ctx, input }) => {
      assertTemplateManager(ctx.appUser, input);
      const template: any = await store.createTemplate(input, ctx.appUser.id);
      const publicationJobId = await publisher.enqueueTemplatePublication(template, ctx.appUser.id, "template_created");
      return { ...template, publicationJobId };
    }),
    update: protectedProcedure.input(z.object({ id: z.string(), data: templateInput.partial() })).mutation(async ({ ctx, input }) => {
      const current: any = await store.getTemplate(input.id);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Padrão não encontrado" });
      assertTemplateManager(ctx.appUser, { type: input.data.type || current.type, modules: input.data.modules || current.modules || [] });
      assertTemplateManager(ctx.appUser, { type: current.type, modules: current.modules || [] });
      const template: any = await store.updateTemplate(input.id, input.data, ctx.appUser.id);
      if (template.active === false) await publisher.cancelTemplatePublications(template.id);
      const publicationJobId = await publisher.enqueueTemplatePublication(template, ctx.appUser.id, "template_updated");
      return { ...template, publicationJobId };
    }),
    archive: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      const current: any = await store.getTemplate(input.id);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Padrão não encontrado" });
      assertTemplateManager(ctx.appUser, current);
      const archived = await store.archiveTemplate(input.id, ctx.appUser.id);
      await publisher.cancelTemplatePublications(input.id);
      return archived;
    }),
  }),
  publications: router({
    history: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).default({ limit: 100 }))
      .query(({ input }) => publisher.listPublicationHistory(input.limit)),
    retry: adminProcedure.input(z.object({ id: z.string().min(1) }))
      .mutation(({ input }) => publisher.processPublicationJob(input.id)),
    blocked: protectedProcedure.input(z.object({ projectId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, false);
        return publisher.listBlocked(input.projectId);
      }),
    confirmBlocked: protectedProcedure.input(z.object({
      projectId: z.string().min(1),
      templateIds: z.array(z.string().min(1)).min(1).max(500),
    })).mutation(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
      return publisher.confirmBlocked(input.projectId, input.templateIds);
    }),
  }),
  trail: router({
    preview: protectedProcedure.input(z.object({ projectId: z.string().min(1) })).query(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, false);
      const scopeItems = await workflowDb.listScopeItems(input.projectId);
      const modules = [...new Set(scopeItems.map((item: any) => item.module).filter(Boolean))];
      return store.previewTrail(input.projectId, modules, scopeItems.map((item: any) => ({ id: item.id, key: item.code || item.id, module: item.module })));
    }),
    applyModels: protectedProcedure.input(z.object({ projectId: z.string().min(1), occurrenceKeys: z.array(z.string().max(1000)).max(5000).optional() })).mutation(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
      const scopeItems = await workflowDb.listScopeItems(input.projectId);
      const modules = [...new Set(scopeItems.map((item: any) => item.module).filter(Boolean))] as string[];
      const project = await plannerStore.getProjectById(input.projectId);
      return store.applyTrail(input.projectId, modules, scopeItems.map((item: any) => ({ id: item.id, key: item.code || item.id, module: item.module })), project?.startDate || "", input.occurrenceKeys);
    }),
    list: protectedProcedure.input(z.object({ projectId: z.string().min(1) })).query(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, false);
      return store.listItems(input.projectId);
    }),
    update: protectedProcedure.input(z.object({
      projectId: z.string().min(1), id: z.string().min(1),
      data: z.object({
        status: z.enum(["not_started", "ready", "in_progress", "awaiting_validation", "approved", "blocked", "completed"]).optional(),
        responsibleId: z.string().max(64).optional(), dueDate: z.string().max(10).optional(),
        evidences: z.array(z.object({ name: z.string(), url: z.string(), contentType: z.string() })).optional(),
        payload: z.record(z.string(), z.unknown()).optional(), title: z.string().trim().min(1).max(512).optional(),
        description: z.string().max(10000).optional(),
      }),
    })).mutation(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
      const item = (await store.listItems(input.projectId)).find((candidate: any) => candidate.id === input.id);
      if (!item) throw new Error("Item da trilha não encontrado");
      if (input.data.responsibleId) {
        const allocations = await plannerStore.listAllocations();
        if (!allocations.some(allocation => allocation.projectId === input.projectId && allocation.resourceId === input.data.responsibleId))
          throw new Error("O responsável precisa estar alocado no projeto pelo Planner");
      }
      return store.updateItem(input.id, input.data);
    }),
  }),
  raid: router({
    list: protectedProcedure.input(z.object({ projectId: z.string().min(1) })).query(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, false);
      return store.listRaid(input.projectId);
    }),
    create: protectedProcedure.input(z.object({ projectId: z.string().min(1), data: raidInput })).mutation(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
      return store.createRaid(input.projectId, input.data);
    }),
    update: protectedProcedure.input(z.object({ projectId: z.string().min(1), id: z.string().min(1), data: raidInput.partial() })).mutation(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
      const current = (await store.listRaid(input.projectId)).find((item: any) => item.id === input.id);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Risco ou issue não encontrado" });
      return store.updateRaid(input.id, input.data);
    }),
    delete: protectedProcedure.input(z.object({ projectId: z.string().min(1), id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
      const current = (await store.listRaid(input.projectId)).find((item: any) => item.id === input.id);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Risco ou issue não encontrado" });
      return store.archiveRaid(input.id);
    }),
  }),
  archive: router({
    preview: adminProcedure.query(() => store.previewInitialArchive()),
    batches: adminProcedure.query(() => store.listArchiveBatches()),
    execute: adminProcedure.input(z.object({ confirmation: z.literal("ARQUIVAR DADOS ATUAIS"), reason: z.string().trim().min(10).max(1000) })).mutation(({ ctx, input }) => store.archiveInitialData(ctx.appUser.id, input.reason)),
    restore: adminProcedure.input(z.object({ batchId: z.string().min(1), confirmation: z.literal("RESTAURAR LOTE") })).mutation(({ ctx, input }) => store.restoreArchiveBatch(input.batchId, ctx.appUser.id)),
  }),
});
