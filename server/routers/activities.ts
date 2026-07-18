import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Activity, AppUser, Project } from "../../shared/types";
import { protectedProcedure, router } from "../_core/trpc";
import * as activityStore from "../activityStore";
import { flushActivityEmailOutbox } from "../activityMailer";
import { syncActivitiesFromSources, syncActivityStatusToSource } from "../activitySync";
import * as plannerStore from "../plannerStore";
import { storagePut } from "../storage";

const statusSchema = z.enum(["A fazer", "Em andamento", "Bloqueada", "Em validação", "Concluída"]);
const prioritySchema = z.enum(["Baixa", "Média", "Alta", "Crítica"]);
const isoDateSchema = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);

function forbidden(message = "Sem permissão para esta atividade"): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

const activityProcedure = (action: "view" | "create" | "modify" = "view") => protectedProcedure.use(({ ctx, next }) => {
  const actions = ctx.appUser.permissions.actions?.activities;
  if (ctx.appUser.role !== "admin" && (ctx.appUser.permissions.products?.techtask === false || !ctx.appUser.permissions.activities || (actions && !actions[action]))) forbidden("Sem permissão para acessar atividades");
  return next();
});
const activityViewProcedure = activityProcedure();
const activityCreateProcedure = activityProcedure("create");
const activityModifyProcedure = activityProcedure("modify");

function normalize(value: string | undefined) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

async function managedProject(user: AppUser, project: Project) {
  if (user.role !== "manager") return false;
  const resource = user.resourceId ? await plannerStore.getResourceById(user.resourceId) : null;
  const manager = normalize(project.manager);
  return Boolean(manager && [user.name, user.email, resource?.name, resource?.email].some(value => normalize(value) === manager));
}

function involved(activity: Activity, user: AppUser) {
  return activity.creatorUserId === user.id || activity.assigneeUserId === user.id || activity.participantUserIds.includes(user.id);
}

async function canView(activity: Activity, user: AppUser) {
  if (user.role === "admin") return true;
  if (activity.scope === "internal") return user.role === "manager" || involved(activity, user);
  if (user.role === "technical_lead") return true;
  const project = await plannerStore.getProjectById(activity.projectId);
  return Boolean(involved(activity, user) || (project && await managedProject(user, project)));
}

function canEdit(activity: Activity, user: AppUser) {
  return user.role === "admin" || involved(activity, user);
}

async function requireActivity(activityId: string, user: AppUser, edit = false) {
  const activity = await activityStore.getActivity(activityId);
  if (!activity) throw new TRPCError({ code: "NOT_FOUND", message: "Atividade não encontrada" });
  if (!(await canView(activity, user)) || (edit && !canEdit(activity, user))) forbidden();
  return activity;
}

async function projectMemberIds(project: Project) {
  const [users, allocations] = await Promise.all([plannerStore.listAppUsers(), plannerStore.listAllocations()]);
  const resourceIds = new Set(allocations.filter(item => item.projectId === project.id).map(item => item.resourceId));
  const manager = normalize(project.manager);
  return new Set(users.filter(user => user.active && (
    user.role === "admin" || resourceIds.has(user.resourceId || "") || normalize(user.name) === manager || normalize(user.email) === manager
  )).map(user => user.id));
}

async function assertEligibleUser(activity: Pick<Activity, "scope" | "projectId">, userId: string) {
  if (!userId) return;
  const users = await plannerStore.listAppUsers();
  if (!users.some(user => user.id === userId && user.active)) throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário responsável inválido" });
  if (activity.scope === "project") {
    const project = await plannerStore.getProjectById(activity.projectId);
    if (!project || !(await projectMemberIds(project)).has(userId)) throw new TRPCError({ code: "BAD_REQUEST", message: "O responsável deve participar do projeto" });
  }
}

async function notify(activity: Activity, actor: AppUser, eventType: string, message: string, extraUserIds: string[] = []) {
  const recipients = [...new Set([activity.assigneeUserId, ...activity.participantUserIds, ...extraUserIds].filter(id => id && id !== actor.id))];
  await activityStore.createNotifications({
    activityId: activity.id,
    eventKey: `${activity.id}:${eventType}:${activity.updatedAt}:${Date.now()}`,
    eventType,
    title: activity.title,
    message,
    userIds: recipients,
  });
  void flushActivityEmailOutbox().catch(error => console.warn("Falha ao processar e-mails de atividades", error));
}

async function syncAndList(user: AppUser) {
  scheduleSourceSync();
  const activities = await activityStore.listActivities();
  if (user.role === "admin") return activities;

  const projectIds = new Set(activities.filter(activity => activity.scope === "project" && !involved(activity, user)).map(activity => activity.projectId));
  const projects = projectIds.size ? (await plannerStore.listProjects()).filter(project => projectIds.has(project.id)) : [];
  const visibleProjectIds = new Set<string>();
  if (user.role === "technical_lead") for (const project of projects) visibleProjectIds.add(project.id);
  else if (user.role === "manager") for (const project of projects) if (await managedProject(user, project)) visibleProjectIds.add(project.id);

  const visible: Activity[] = [];
  for (const activity of activities) {
    if (involved(activity, user)) visible.push(activity);
    else if (activity.scope === "internal" && user.role === "manager") visible.push(activity);
    else if (activity.scope === "project" && visibleProjectIds.has(activity.projectId)) visible.push(activity);
  }
  return visible;
}

let sourceSync: Promise<void> | null = null;
let lastSourceSyncAt = 0;
const SOURCE_SYNC_INTERVAL_MS = 60_000;

function scheduleSourceSync() {
  if (sourceSync || Date.now() - lastSourceSyncAt < SOURCE_SYNC_INTERVAL_MS) return;
  sourceSync = syncActivitiesFromSources()
    .then(() => { lastSourceSyncAt = Date.now(); })
    .catch(error => console.warn("Falha ao sincronizar fontes de atividades", error))
    .finally(() => { sourceSync = null; });
}

export const activitiesRouter = router({
  list: activityViewProcedure.query(async ({ ctx }) => {
    return syncAndList(ctx.appUser);
  }),

  get: activityViewProcedure.input(z.object({ id: z.string().min(1) })).query(({ ctx, input }) => requireActivity(input.id, ctx.appUser)),

  eligibleUsers: activityViewProcedure.input(z.object({ scope: z.enum(["project", "internal"]), projectId: z.string().default("") })).query(async ({ ctx, input }) => {
    const users = (await plannerStore.listAppUsers()).filter(user => user.active);
    if (input.scope === "internal") return users;
    const project = await plannerStore.getProjectById(input.projectId);
    if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
    const ids = await projectMemberIds(project);
    return users.filter(user => ids.has(user.id));
  }),

  create: activityCreateProcedure.input(z.object({
    scope: z.enum(["project", "internal"]), projectId: z.string().default(""), title: z.string().trim().min(1).max(500),
    description: z.string().max(10000).default(""), priority: prioritySchema.default("Média"),
    assigneeUserId: z.string().default(""), participantUserIds: z.array(z.string()).default([]), dueDate: isoDateSchema.default(""),
  })).mutation(async ({ ctx, input }) => {
    if (input.scope === "project") {
      const project = await plannerStore.getProjectById(input.projectId);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      const members = await projectMemberIds(project);
      if (ctx.appUser.role !== "admin" && !members.has(ctx.appUser.id)) forbidden("Somente membros do projeto podem criar atividades nele");
      for (const userId of [input.assigneeUserId, ...input.participantUserIds]) if (userId && !members.has(userId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Todos os envolvidos devem participar do projeto" });
    } else {
      for (const userId of [input.assigneeUserId, ...input.participantUserIds]) await assertEligibleUser({ scope: "internal", projectId: "" }, userId);
    }
    const created = await activityStore.createActivity({ ...input, creatorUserId: ctx.appUser.id });
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar a atividade" });
    await activityStore.addHistory(created.id, ctx.appUser, "CREATED", { scope: created.scope });
    const current = await activityStore.getActivity(created.id) as Activity;
    await notify(current, ctx.appUser, "assigned", `${ctx.appUser.name} criou e atribuiu uma atividade.`);
    return current;
  }),

  update: activityModifyProcedure.input(z.object({
    id: z.string().min(1), expectedUpdatedAt: z.string().optional(), data: z.object({ title: z.string().trim().min(1).max(500).optional(), description: z.string().max(10000).optional(),
      status: statusSchema.optional(), priority: prioritySchema.optional(), assigneeUserId: z.string().optional(), dueDate: isoDateSchema.optional() }),
  })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.id, ctx.appUser, true);
    if (input.expectedUpdatedAt && activity.updatedAt !== input.expectedUpdatedAt) throw new TRPCError({ code: "CONFLICT", message: "A atividade foi alterada por outra pessoa. Recarregue e tente novamente." });
    if (activity.sourceType !== "manual" && (input.data.title !== undefined || input.data.description !== undefined || input.data.priority !== undefined)) throw new TRPCError({ code: "BAD_REQUEST", message: "Título, descrição e prioridade são controlados pela origem desta atividade" });
    if (input.data.assigneeUserId !== undefined) await assertEligibleUser(activity, input.data.assigneeUserId);
    if (input.data.status === "Concluída") {
      if (activity.checklist.some(item => item.required && !item.completed)) throw new TRPCError({ code: "BAD_REQUEST", message: "Conclua todos os itens obrigatórios do checklist" });
      if (activity.sourceType.startsWith("allocation_") && !activity.sourceResolved) throw new TRPCError({ code: "BAD_REQUEST", message: "Este alerta será concluído quando a condição de alocação for resolvida" });
    }
    const updated = await activityStore.updateActivity(activity.id, input.data);
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Atividade não encontrada" });
    if (input.data.status) await syncActivityStatusToSource(activity, input.data.status);
    await activityStore.addHistory(activity.id, ctx.appUser, "UPDATED", input.data);
    const current = await activityStore.getActivity(activity.id) as Activity;
    await notify(current, ctx.appUser, input.data.status ? "status_changed" : "updated", input.data.status ? `Status alterado para ${input.data.status}.` : "A atividade foi atualizada.", input.data.assigneeUserId ? [input.data.assigneeUserId] : []);
    return current;
  }),

  archive: activityModifyProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.id, ctx.appUser);
    if (activity.sourceType !== "manual") throw new TRPCError({ code: "BAD_REQUEST", message: "Atividades automáticas não podem ser arquivadas" });
    if (ctx.appUser.role !== "admin" && activity.creatorUserId !== ctx.appUser.id) forbidden();
    await activityStore.archiveActivity(activity.id);
    await activityStore.addHistory(activity.id, ctx.appUser, "ARCHIVED");
    return { success: true };
  }),

  join: activityModifyProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.id, ctx.appUser);
    const updated = await activityStore.addParticipant(activity.id, ctx.appUser.id) as Activity;
    await activityStore.addHistory(activity.id, ctx.appUser, "PARTICIPANT_JOINED");
    await notify(updated, ctx.appUser, "participant_joined", `${ctx.appUser.name} passou a participar da atividade.`);
    return updated;
  }),

  leave: activityModifyProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.id, ctx.appUser, true);
    if (activity.creatorUserId === ctx.appUser.id || activity.assigneeUserId === ctx.appUser.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Criador ou responsável não pode sair da atividade" });
    return activityStore.removeParticipant(activity.id, ctx.appUser.id);
  }),

  checklistCreate: activityCreateProcedure.input(z.object({ activityId: z.string(), description: z.string().trim().min(1).max(1000), assigneeUserId: z.string().default(""), dueDate: isoDateSchema.default(""), required: z.boolean().default(true) })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.activityId, ctx.appUser, true);
    await assertEligibleUser(activity, input.assigneeUserId);
    const item = await activityStore.createChecklistItem(activity.id, { ...input, createdByUserId: ctx.appUser.id });
    await activityStore.addHistory(activity.id, ctx.appUser, "CHECKLIST_CREATED", { itemId: item.id, description: item.description });
    const current = await activityStore.getActivity(activity.id) as Activity;
    await notify(current, ctx.appUser, "checklist_created", `Novo item de checklist: ${item.description}`, item.assigneeUserId ? [item.assigneeUserId] : []);
    return item;
  }),

  checklistUpdate: activityModifyProcedure.input(z.object({ activityId: z.string(), itemId: z.string(), data: z.object({ description: z.string().trim().min(1).max(1000).optional(), assigneeUserId: z.string().optional(), dueDate: isoDateSchema.optional(), required: z.boolean().optional(), completed: z.boolean().optional(), position: z.number().int().min(0).optional() }) })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.activityId, ctx.appUser, true);
    if (input.data.assigneeUserId !== undefined) await assertEligibleUser(activity, input.data.assigneeUserId);
    const item = await activityStore.updateChecklistItem(activity.id, input.itemId, input.data);
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
    await activityStore.addHistory(activity.id, ctx.appUser, input.data.completed === true ? "CHECKLIST_COMPLETED" : input.data.completed === false ? "CHECKLIST_REOPENED" : "CHECKLIST_UPDATED", { itemId: item.id, description: item.description });
    const current = await activityStore.getActivity(activity.id) as Activity;
    await notify(current, ctx.appUser, input.data.completed === true ? "checklist_completed" : "checklist_updated", `${item.description}: ${input.data.completed === true ? "concluído" : "atualizado"}.`, item.assigneeUserId ? [item.assigneeUserId] : []);
    return item;
  }),

  checklistDelete: activityModifyProcedure.input(z.object({ activityId: z.string(), itemId: z.string() })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.activityId, ctx.appUser, true);
    await activityStore.deleteChecklistItem(activity.id, input.itemId);
    await activityStore.addHistory(activity.id, ctx.appUser, "CHECKLIST_DELETED", { itemId: input.itemId });
    return { success: true };
  }),

  checklistReorder: activityModifyProcedure.input(z.object({ activityId: z.string(), itemIds: z.array(z.string()) })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.activityId, ctx.appUser, true);
    if (new Set(input.itemIds).size !== activity.checklist.length || input.itemIds.some(id => !activity.checklist.some(item => item.id === id))) throw new TRPCError({ code: "BAD_REQUEST", message: "A ordem deve conter todos os itens do checklist" });
    const items = await activityStore.reorderChecklist(activity.id, input.itemIds);
    await activityStore.addHistory(activity.id, ctx.appUser, "CHECKLIST_REORDERED");
    return items;
  }),

  comment: activityModifyProcedure.input(z.object({ activityId: z.string(), content: z.string().trim().min(1).max(10000) })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.activityId, ctx.appUser, true);
    const comment = await activityStore.addComment(activity.id, ctx.appUser, input.content);
    await activityStore.addHistory(activity.id, ctx.appUser, "COMMENTED", { commentId: comment.id });
    const users = await plannerStore.listAppUsers();
    const mentioned = users.filter(user => input.content.toLowerCase().includes(`@${user.name.toLowerCase()}`)).map(user => user.id);
    await notify(activity, ctx.appUser, mentioned.length ? "mentioned" : "commented", `${ctx.appUser.name} comentou: ${input.content.slice(0, 160)}`, mentioned);
    return comment;
  }),

  upload: activityModifyProcedure.input(z.object({ activityId: z.string(), fileName: z.string().min(1).max(255), contentType: z.string().max(255), fileData: z.string().max(14_000_000) })).mutation(async ({ ctx, input }) => {
    const activity = await requireActivity(input.activityId, ctx.appUser, true);
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const buffer = Buffer.from(input.fileData, "base64");
    if (buffer.byteLength > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "O anexo deve ter no máximo 10 MB" });
    const stored = await storagePut(`activities/${activity.id}/${safeName}`, buffer, input.contentType);
    const attachment = await activityStore.addAttachment(activity.id, { fileName: input.fileName, contentType: input.contentType, url: stored.url, uploadedByUserId: ctx.appUser.id });
    await activityStore.addHistory(activity.id, ctx.appUser, "ATTACHED", { fileName: input.fileName });
    await notify(activity, ctx.appUser, "attached", `${ctx.appUser.name} adicionou o anexo ${input.fileName}.`);
    return attachment;
  }),

  notifications: protectedProcedure.query(async ({ ctx }) => {
    void flushActivityEmailOutbox().catch(error => console.warn("Falha ao processar e-mails de atividades", error));
    return activityStore.listNotifications(ctx.appUser.id);
  }),
  markNotificationsRead: protectedProcedure.input(z.object({ id: z.string().optional() })).mutation(async ({ ctx, input }) => {
    await activityStore.markNotificationsRead(ctx.appUser.id, input.id);
    return { success: true };
  }),
});
