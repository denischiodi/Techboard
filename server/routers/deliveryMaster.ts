import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { assertWorkflowProjectAccess } from "../workflowAccess";
import * as store from "../deliveryMasterStore";
import * as workflowDb from "./workflowDb";
import * as plannerStore from "../plannerStore";
import * as publisher from "../deliveryPublisher";
import {
  storagePresignPut,
  storagePut,
  storagePutLocalChunk,
  storageRead,
  storageValidateUpload,
} from "../storage";
import { createHash } from "node:crypto";
import { assertRegisteredScopeItems } from "../sapLibraryStore";

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

function normalizeModule(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function assertTemplateManager(
  appUser: any,
  input: { type?: string; modules?: string[] }
) {
  if (appUser.role === "admin") return;
  if (appUser.role !== "technical_lead") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Somente administradores e líderes técnicos podem manter padrões",
    });
  }
  if (input.type === "activity" || !input.modules?.length) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Padrões gerais, do processo funcional e da Trilha do GP são administrados pelo perfil administrador",
    });
  }
  const owned = new Set((appUser.teamFronts || []).map(normalizeModule));
  const unauthorized = input.modules.filter(
    module => !owned.has(normalizeModule(module))
  );
  if (unauthorized.length) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Você não responde pelo(s) módulo(s): ${unauthorized.join(", ")}`,
    });
  }
}

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
    create: protectedProcedure
      .input(templateInput)
      .mutation(async ({ ctx, input }) => {
        assertTemplateManager(ctx.appUser, input);
        await assertRegisteredScopeItems(input.scopeItemKeys);
        const template: any = await store.createTemplate(input, ctx.appUser.id);
        const publicationJobId = await publisher.enqueueTemplatePublication(
          template,
          ctx.appUser.id,
          "template_created"
        );
        return { ...template, publicationJobId };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.string(), data: templateInput.partial() }))
      .mutation(async ({ ctx, input }) => {
        const current: any = await store.getTemplate(input.id);
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Padrão não encontrado",
          });
        assertTemplateManager(ctx.appUser, {
          type: input.data.type || current.type,
          modules: input.data.modules || current.modules || [],
        });
        assertTemplateManager(ctx.appUser, {
          type: current.type,
          modules: current.modules || [],
        });
        if (input.data.scopeItemKeys)
          await assertRegisteredScopeItems(input.data.scopeItemKeys);
        const template: any = await store.updateTemplate(
          input.id,
          input.data,
          ctx.appUser.id
        );
        if (template.active === false)
          await publisher.cancelTemplatePublications(template.id);
        const publicationJobId = await publisher.enqueueTemplatePublication(
          template,
          ctx.appUser.id,
          "template_updated"
        );
        return { ...template, publicationJobId };
      }),
    archive: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const current: any = await store.getTemplate(input.id);
        if (!current)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Padrão não encontrado",
          });
        const archived = await store.archiveTemplate(input.id, ctx.appUser.id);
        await publisher.cancelTemplatePublications(input.id);
        return archived;
      }),
    attachments: router({
      list: protectedProcedure
        .input(z.object({ templateId: z.string().min(1) }))
        .query(({ input }) => store.listTemplateAttachments(input.templateId)),
      upload: protectedProcedure
        .input(
          z.object({
            templateId: z.string().min(1),
            fileName: z.string().trim().min(1).max(255),
            contentType: z.string().max(255).default(""),
            fileData: z.string().min(1).max(70_000_000),
          })
        )
        .mutation(async ({ ctx, input }) => {
          let template: any = await store.getTemplate(input.templateId);
          if (!template)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Padrão não encontrado",
            });
          assertTemplateManager(ctx.appUser, template);
          const existing = await store.listTemplateAttachments(
            input.templateId
          );
          if (existing.length >= 20)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cada padrão aceita no máximo 20 anexos",
            });
          const extension = input.fileName
            .toLowerCase()
            .match(/\.(doc|docx|pdf|ppt|pptx|xls|xlsx)$/)?.[1];
          if (!extension)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Envie Word, PDF, PowerPoint ou Excel",
            });
          const buffer = Buffer.from(
            input.fileData.replace(/^data:[^;]+;base64,/, ""),
            "base64"
          );
          if (!buffer.length || buffer.length > 50 * 1024 * 1024)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "O arquivo deve ter entre 1 byte e 50 MB",
            });
          const signatures: Record<string, (data: Buffer) => boolean> = {
            pdf: data => data.subarray(0, 5).toString() === "%PDF-",
            docx: data => data[0] === 0x50 && data[1] === 0x4b,
            xlsx: data => data[0] === 0x50 && data[1] === 0x4b,
            pptx: data => data[0] === 0x50 && data[1] === 0x4b,
            doc: data =>
              data
                .subarray(0, 8)
                .equals(
                  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
                ),
            xls: data =>
              data
                .subarray(0, 8)
                .equals(
                  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
                ),
            ppt: data =>
              data
                .subarray(0, 8)
                .equals(
                  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
                ),
          };
          if (!signatures[extension]?.(buffer))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "O conteúdo do arquivo não corresponde à extensão informada",
            });
          const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          template = await store.updateTemplate(
            template.id,
            {},
            ctx.appUser.id
          );
          const stored = await storagePut(
            `delivery-templates/${template.id}/v${template.version}/${nanoid()}-${safeName}`,
            buffer,
            input.contentType || "application/octet-stream"
          );
          const attachment = await store.createTemplateAttachment({
            id: `dta_${nanoid(20)}`,
            templateId: template.id,
            templateVersion: template.version,
            fileName: input.fileName,
            contentType: input.contentType || "application/octet-stream",
            sizeBytes: buffer.length,
            checksum: createHash("sha256").update(buffer).digest("hex"),
            storageKey: stored.key,
            url: stored.url,
            uploadedBy: ctx.appUser.id,
          });
          await publisher.enqueueTemplatePublication(
            template,
            ctx.appUser.id,
            "template_attachment_added"
          );
          return attachment;
        }),
      prepareUpload: protectedProcedure
        .input(
          z.object({
            templateId: z.string().min(1),
            fileName: z.string().trim().min(1).max(255),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const template: any = await store.getTemplate(input.templateId);
          if (!template)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Padrão não encontrado",
            });
          assertTemplateManager(ctx.appUser, template);
          const extension = input.fileName
            .toLowerCase()
            .match(/\.(doc|docx|pdf|ppt|pptx|xls|xlsx)$/)?.[1];
          if (!extension)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Envie Word, PDF, PowerPoint ou Excel",
            });
          const existing = await store.listTemplateAttachments(
            input.templateId
          );
          if (existing.length >= 20)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cada padrão aceita no máximo 20 anexos",
            });
          const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          return storagePresignPut(
            `delivery-templates/${template.id}/pending/${nanoid()}-${safeName}`
          );
        }),
      uploadChunk: protectedProcedure
        .input(
          z.object({
            key: z.string().min(1).max(2000),
            expires: z.number().int().positive(),
            signature: z.string().regex(/^[a-f0-9]{64}$/),
            part: z.number().int().min(0),
            totalParts: z.number().int().min(1).max(50),
            offset: z
              .number()
              .int()
              .min(0)
              .max(50 * 1024 * 1024),
            totalSize: z
              .number()
              .int()
              .positive()
              .max(50 * 1024 * 1024),
            dataBase64: z.string().min(1).max(6_000_000),
          })
        )
        .mutation(({ input }) =>
          storagePutLocalChunk({
            key: input.key,
            expires: input.expires,
            signature: input.signature,
            part: input.part,
            totalParts: input.totalParts,
            offset: input.offset,
            totalSize: input.totalSize,
            data: Buffer.from(input.dataBase64, "base64"),
          })
        ),
      registerUpload: protectedProcedure
        .input(
          z.object({
            templateId: z.string().min(1),
            fileName: z.string().trim().min(1).max(255),
            contentType: z.string().max(255).default(""),
            storageKey: z.string().min(1).max(2000),
            sizeBytes: z
              .number()
              .int()
              .positive()
              .max(50 * 1024 * 1024),
          })
        )
        .mutation(async ({ ctx, input }) => {
          let template: any = await store.getTemplate(input.templateId);
          if (!template)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Padrão não encontrado",
            });
          assertTemplateManager(ctx.appUser, template);
          if (
            !input.storageKey.startsWith(
              `delivery-templates/${template.id}/pending/`
            )
          )
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Arquivo enviado para um local inválido",
            });
          const existing = await store.listTemplateAttachments(
            input.templateId
          );
          if (existing.length >= 20)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cada padrão aceita no máximo 20 anexos",
            });
          const extension = input.fileName
            .toLowerCase()
            .match(/\.(doc|docx|pdf|ppt|pptx|xls|xlsx)$/)?.[1];
          if (!extension)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Envie Word, PDF, PowerPoint ou Excel",
            });
          await storageValidateUpload(input.storageKey, input.sizeBytes);
          const buffer = await storageRead(input.storageKey);
          if (!buffer.length || buffer.length !== input.sizeBytes)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "O arquivo recebido está incompleto",
            });
          const signatures: Record<string, (data: Buffer) => boolean> = {
            pdf: data => data.subarray(0, 5).toString() === "%PDF-",
            docx: data => data[0] === 0x50 && data[1] === 0x4b,
            xlsx: data => data[0] === 0x50 && data[1] === 0x4b,
            pptx: data => data[0] === 0x50 && data[1] === 0x4b,
            doc: data =>
              data
                .subarray(0, 8)
                .equals(
                  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
                ),
            xls: data =>
              data
                .subarray(0, 8)
                .equals(
                  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
                ),
            ppt: data =>
              data
                .subarray(0, 8)
                .equals(
                  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
                ),
          };
          if (!signatures[extension]?.(buffer))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "O conteúdo do arquivo não corresponde à extensão informada",
            });
          template = await store.updateTemplate(
            template.id,
            {},
            ctx.appUser.id
          );
          const attachment = await store.createTemplateAttachment({
            id: `dta_${nanoid(20)}`,
            templateId: template.id,
            templateVersion: template.version,
            fileName: input.fileName,
            contentType: input.contentType || "application/octet-stream",
            sizeBytes: buffer.length,
            checksum: createHash("sha256").update(buffer).digest("hex"),
            storageKey: input.storageKey,
            url: `/manus-storage/${input.storageKey}`,
            uploadedBy: ctx.appUser.id,
          });
          await publisher.enqueueTemplatePublication(
            template,
            ctx.appUser.id,
            "template_attachment_added"
          );
          return attachment;
        }),
      remove: protectedProcedure
        .input(
          z.object({ templateId: z.string().min(1), id: z.string().min(1) })
        )
        .mutation(async ({ ctx, input }) => {
          const template: any = await store.getTemplate(input.templateId);
          if (!template)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Padrão não encontrado",
            });
          assertTemplateManager(ctx.appUser, template);
          const archived = await store.archiveTemplateAttachment(
            input.id,
            input.templateId
          );
          const updated: any = await store.updateTemplate(
            template.id,
            {},
            ctx.appUser.id
          );
          await publisher.enqueueTemplatePublication(
            updated,
            ctx.appUser.id,
            "template_attachment_removed"
          );
          return archived;
        }),
    }),
  }),
  publications: router({
    history: protectedProcedure
      .input(
        z
          .object({ limit: z.number().int().min(1).max(500).default(100) })
          .default({ limit: 100 })
      )
      .query(({ input }) => publisher.listPublicationHistory(input.limit)),
    retry: adminProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(({ input }) => publisher.retryPublicationJob(input.id)),
    reconcile: adminProcedure.mutation(({ ctx }) =>
      publisher.enqueueReconciliation(ctx.appUser.id)
    ),
    blocked: protectedProcedure
      .input(z.object({ projectId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, false);
        return publisher.listBlocked(input.projectId);
      }),
    confirmBlocked: protectedProcedure
      .input(
        z.object({
          projectId: z.string().min(1),
          templateIds: z.array(z.string().min(1)).min(1).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertWorkflowProjectAccess(ctx.appUser, input.projectId, true);
        return publisher.confirmBlocked(input.projectId, input.templateIds);
      }),
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
          scopeItems.map((item: any) => ({
            id: item.id,
            key: item.code || item.id,
            module: item.module,
          }))
        );
      }),
    applyModels: protectedProcedure
      .input(
        z.object({
          projectId: z.string().min(1),
          occurrenceKeys: z.array(z.string().max(1000)).max(5000).optional(),
        })
      )
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
          project?.startDate || "",
          input.occurrenceKeys
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
