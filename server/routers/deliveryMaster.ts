import { z } from "zod";
import { nanoid } from "nanoid";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { assertWorkflowProjectAccess } from "../workflowAccess";
import * as store from "../deliveryMasterStore";
import * as workflowDb from "./workflowDb";
import * as plannerStore from "../plannerStore";

const typeSchema = z.enum(store.DELIVERY_TYPES);
const approvalSchema = z.object({
  mode: z.enum(["none", "any", "all", "minimum"]).default("none"),
  minimumApprovals: z.number().int().min(1).default(1),
});
const templateInput = z.object({
  type: typeSchema,
  title: z.string().trim().min(1).max(512),
  description: z.string().max(10000).default(""),
  instructions: z.string().max(20000).default(""),
  phase: z.string().max(32).default("Prepare"),
  stage: z.string().trim().min(1).max(64),
  modules: z.array(z.string().max(128)).max(100).default([]),
  scopeItemKeys: z.array(z.string().max(128)).max(1000).default([]),
  projectIds: z.array(z.string().max(64)).max(500).default([]),
  required: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  dependencyTemplateIds: z.array(z.string().max(64)).max(100).default([]),
  ownerRole: z.string().max(64).default("consultant"),
  dueOffsetDays: z.number().int().min(-365).max(3650).default(0),
  evidenceRequirements: z.array(z.string().max(255)).max(100).default([]),
  approvalPolicy: approvalSchema.default({ mode: "none", minimumApprovals: 1 }),
  completionCriteria: z.string().max(10000).default(""),
  payload: z.record(z.string(), z.unknown()).default({}),
  effectiveFrom: z.string().max(10).default(""),
  active: z.boolean().default(true),
});
const raidInput = z.object({
  kind: z.enum(["risk", "issue"]),
  title: z.string().trim().min(1).max(512),
  description: z.string().max(10000).default(""),
  phase: z.string().max(32).default("Prepare"),
  module: z.string().max(128).default(""),
  scopeItemIds: z.array(z.string()).default([]),
  category: z.string().max(128).default(""),
  cause: z.string().max(10000).default(""),
  consequence: z.string().max(10000).default(""),
  probability: z.number().int().min(1).max(5).default(1),
  impact: z.number().int().min(1).max(5).default(1),
  strategy: z.enum(["", "avoid", "mitigate", "transfer", "accept"]).default(""),
  responsePlan: z.string().max(10000).default(""),
  workaround: z.string().max(10000).default(""),
  rootCause: z.string().max(10000).default(""),
  responsibleId: z.string().max(64).default(""),
  sponsorId: z.string().max(64).default(""),
  nextAction: z.string().max(2000).default(""),
  dueDate: z.string().max(10).default(""),
  reviewDate: z.string().max(10).default(""),
  required: z.boolean().default(false),
  status: z.string().max(32).default("open"),
  attachments: z
    .array(
      z.object({ name: z.string(), url: z.string(), contentType: z.string() })
    )
    .default([]),
  approvalPolicy: approvalSchema.optional(),
});
const raidUpdateInput = raidInput.omit({ kind: true }).partial();

async function assertAllocatedRaidPeople(
  projectId: string,
  responsibleId?: string,
  sponsorId?: string
) {
  const ids = [responsibleId, sponsorId].filter(Boolean) as string[];
  if (!ids.length) return;
  const allocations = await plannerStore.listAllocations();
  const allocated = new Set(
    allocations
      .filter(allocation => allocation.projectId === projectId)
      .map(allocation => allocation.resourceId)
  );
  if (responsibleId && !allocated.has(responsibleId))
    throw new Error(
      "O responsável precisa estar alocado no projeto pelo Planner"
    );
  if (sponsorId && !allocated.has(sponsorId))
    throw new Error(
      "O patrocinador precisa estar alocado no projeto pelo Planner"
    );
}

async function recordRaidAudit(
  ctx: any,
  projectId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown>
) {
  await workflowDb.createWorkflowAudit({
    id: nanoid(),
    projectId,
    userId: String(ctx.appUser?.id || ctx.user?.id || "unknown"),
    userName:
      ctx.appUser?.name || ctx.user?.name || ctx.user?.email || "Usuário",
    action,
    entityType: "delivery_raid",
    entityId,
    details,
  });
}

export const deliveryMasterRouter = router({
  templates: router({
    list: protectedProcedure
      .input(
        z
          .object({
            type: typeSchema.optional(),
            includeArchived: z.boolean().default(false),
          })
          .default({ includeArchived: false })
      )
      .query(({ input }) => store.listTemplates(input)),
    create: adminProcedure
      .input(templateInput)
      .mutation(({ ctx, input }) =>
        store.createTemplate(input, ctx.appUser.id)
      ),
    update: adminProcedure
      .input(z.object({ id: z.string(), data: templateInput.partial() }))
      .mutation(({ ctx, input }) =>
        store.updateTemplate(input.id, input.data, ctx.appUser.id)
      ),
    archive: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ ctx, input }) =>
        store.archiveTemplate(input.id, ctx.appUser.id)
      ),
  }),
  trail: router({
    preview: protectedProcedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, false);
        const scopeItems = await workflowDb.listScopeItems(input.projectId);
        const modules = [
          ...new Set(
            scopeItems.map((item: any) => item.module).filter(Boolean)
          ),
        ];
        return store.previewTrail(
          input.projectId,
          modules,
          scopeItems.map((item: any) => item.code || item.id)
        );
      }),
    applyModels: protectedProcedure
      .input(z.object({ projectId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
        const scopeItems = await workflowDb.listScopeItems(input.projectId);
        const modules = [
          ...new Set(
            scopeItems.map((item: any) => item.module).filter(Boolean)
          ),
        ] as string[];
        const project = await plannerStore.getProjectById(input.projectId);
        return store.applyTrail(
          input.projectId,
          modules,
          scopeItems.map((item: any) => ({
            id: item.id,
            key: item.code || item.id,
            module: item.module,
          })),
          project?.startDate || ""
        );
      }),
    list: protectedProcedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, false);
        return store.listItems(input.projectId);
      }),
    update: protectedProcedure
      .input(
        z.object({
          projectId: z.string().min(1),
          id: z.string().min(1),
          data: z.object({
            status: z
              .enum([
                "not_started",
                "ready",
                "in_progress",
                "awaiting_validation",
                "approved",
                "blocked",
                "completed",
              ])
              .optional(),
            responsibleId: z.string().max(64).optional(),
            dueDate: z.string().max(10).optional(),
            evidences: z
              .array(
                z.object({
                  name: z.string(),
                  url: z.string(),
                  contentType: z.string(),
                })
              )
              .optional(),
            payload: z.record(z.string(), z.unknown()).optional(),
            title: z.string().trim().min(1).max(512).optional(),
            description: z.string().max(10000).optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
        const item = (await store.listItems(input.projectId)).find(
          (candidate: any) => candidate.id === input.id
        );
        if (!item) throw new Error("Item da trilha não encontrado");
        if (input.data.responsibleId) {
          const allocations = await plannerStore.listAllocations();
          if (
            !allocations.some(
              allocation =>
                allocation.projectId === input.projectId &&
                allocation.resourceId === input.data.responsibleId
            )
          )
            throw new Error(
              "O responsável precisa estar alocado no projeto pelo Planner"
            );
        }
        return store.updateItem(input.id, input.data);
      }),
  }),
  raid: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, false);
        return store.listRaid(input.projectId);
      }),
    create: protectedProcedure
      .input(z.object({ projectId: z.string().min(1), data: raidInput }))
      .mutation(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
        await assertAllocatedRaidPeople(
          input.projectId,
          input.data.responsibleId,
          input.data.sponsorId
        );
        const created = await store.createRaid(input.projectId, input.data);
        await recordRaidAudit(
          ctx,
          input.projectId,
          "raid.created",
          created.id,
          {
            after: created,
          }
        );
        return created;
      }),
    update: protectedProcedure
      .input(
        z.object({
          projectId: z.string().min(1),
          id: z.string().min(1),
          data: raidUpdateInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
        await assertAllocatedRaidPeople(
          input.projectId,
          input.data.responsibleId,
          input.data.sponsorId
        );
        const result = await store.updateRaid(
          input.projectId,
          input.id,
          input.data
        );
        await recordRaidAudit(ctx, input.projectId, "raid.updated", input.id, {
          before: result.before,
          after: result.item,
        });
        return result.item;
      }),
    archive: protectedProcedure
      .input(
        z.object({
          projectId: z.string().min(1),
          id: z.string().min(1),
          confirmation: z.string().trim().min(1).max(32),
          reason: z.string().trim().min(5).max(1000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
        const result = await store.archiveRaid(
          input.projectId,
          input.id,
          ctx.appUser.id,
          input.confirmation
        );
        await recordRaidAudit(ctx, input.projectId, "raid.archived", input.id, {
          before: result.before,
          reason: input.reason,
        });
        return result.item;
      }),
  }),
  archive: router({
    preview: adminProcedure.query(() => store.previewInitialArchive()),
    batches: adminProcedure.query(() => store.listArchiveBatches()),
    execute: adminProcedure
      .input(
        z.object({
          confirmation: z.literal("ARQUIVAR DADOS ATUAIS"),
          reason: z.string().trim().min(10).max(1000),
        })
      )
      .mutation(({ ctx, input }) =>
        store.archiveInitialData(ctx.appUser.id, input.reason)
      ),
    restore: adminProcedure
      .input(
        z.object({
          batchId: z.string().min(1),
          confirmation: z.literal("RESTAURAR LOTE"),
        })
      )
      .mutation(({ ctx, input }) =>
        store.restoreArchiveBatch(input.batchId, ctx.appUser.id)
      ),
  }),
});
