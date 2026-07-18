import type { Activity, ActivityPriority, ActivitySourceType, ActivityStatus, AppUser, GpChecklistStatus, Project, TechMoveData } from "../shared/types";
import * as activityStore from "./activityStore";
import * as gpStore from "./gpChecklistStore";
import * as plannerStore from "./plannerStore";

const automaticTypes = new Set<ActivitySourceType>([
  "gp_checklist", "gp_fit_step", "techmove_question", "techmove_gap", "techmove_configuration",
  "allocation_missing_front", "allocation_overallocated", "allocation_end_date", "allocation_unallocated", "techlead",
]);

function normalize(value: string | undefined) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function gpStatus(status: GpChecklistStatus): { status: ActivityStatus; resolved: boolean } {
  if (status === "Em andamento") return { status: "Em andamento", resolved: false };
  if (status === "Em validação") return { status: "Em validação", resolved: false };
  if (status === "Bloqueado") return { status: "Bloqueada", resolved: false };
  if (status === "Concluído" || status === "Não aplicável") return { status: "Concluída", resolved: true };
  return { status: "A fazer", resolved: false };
}

function gpSourceStatus(status: ActivityStatus): GpChecklistStatus {
  if (status === "Em andamento") return "Em andamento";
  if (status === "Em validação") return "Em validação";
  if (status === "Bloqueada") return "Bloqueado";
  if (status === "Concluída") return "Concluído";
  return "Pendente";
}

function findUser(users: AppUser[], value: string | undefined) {
  const key = normalize(value);
  if (!key) return undefined;
  return users.find(user => normalize(user.id) === key || normalize(user.name) === key || normalize(user.email) === key || normalize(user.resourceId) === key);
}

function projectManager(users: AppUser[], project: Project) {
  return findUser(users, project.manager) || users.find(user => user.role === "admin") || users[0];
}

function priorityFromSeverity(value: string | undefined): ActivityPriority {
  const key = normalize(value);
  if (key.includes("critic")) return "Crítica";
  if (key.includes("alt")) return "Alta";
  if (key.includes("baix")) return "Baixa";
  return "Média";
}

async function reconcileResolved(activeKeys: Set<string>) {
  const activities = await activityStore.listActivities();
  for (const activity of activities) {
    if (!automaticTypes.has(activity.sourceType) || activity.sourceType.startsWith("gp_") || activity.sourceType.startsWith("techmove_")) continue;
    const compound = `${activity.sourceType}:${activity.sourceKey}`;
    if (!activeKeys.has(compound) && !activity.sourceResolved) {
      const pendingRequired = activity.checklist.some(item => item.required && !item.completed);
      await activityStore.updateActivity(activity.id, { sourceResolved: true, status: pendingRequired ? "Em validação" : "Concluída" });
      await activityStore.addHistory(activity.id, null, "SOURCE_RESOLVED", { checklistPending: pendingRequired });
    }
  }
}

export async function syncActivitiesFromSources() {
  const [projects, users, resources, allocations] = await Promise.all([
    plannerStore.listProjects(), plannerStore.listAppUsers(), plannerStore.listResources(), plannerStore.listAllocations(),
  ]);
  const activeKeys = new Set<string>();

  for (const project of projects) {
    const manager = projectManager(users, project);
    if (!manager) continue;
    const [items, cycles, techmove] = await Promise.all([
      gpStore.listProjectChecklist(project), gpStore.listFitToStandardCycles(project.id), plannerStore.getTechMoveData(project.id),
    ]);
    for (const item of items) {
      const state = gpStatus(item.status);
      const assignee = findUser(users, item.responsible) || manager;
      await activityStore.upsertSourceActivity({
        scope: "project", projectId: project.id, title: item.title, description: item.description,
        status: state.status, priority: item.itemType === "Quality Gate" ? "Alta" : "Média", assigneeUserId: assignee.id,
        creatorUserId: manager.id, participantUserIds: [manager.id], dueDate: item.dueDate,
        sourceType: "gp_checklist", sourceKey: item.id, sourceUrl: `/techlead/gp-track?projectId=${encodeURIComponent(project.id)}`,
        sourceResolved: state.resolved,
      });
    }
    for (const cycle of cycles) for (const step of cycle.steps) {
      const state = gpStatus(step.status);
      const assignee = findUser(users, step.responsible) || manager;
      await activityStore.upsertSourceActivity({
        scope: "project", projectId: project.id, title: `${cycle.name}: ${step.title}`,
        description: cycle.module ? `Ciclo Fit-to-Standard · ${cycle.module}` : "Ciclo Fit-to-Standard",
        status: state.status, priority: "Média", assigneeUserId: assignee.id, creatorUserId: manager.id,
        participantUserIds: [manager.id], dueDate: step.dueDate, sourceType: "gp_fit_step", sourceKey: step.id,
        sourceUrl: `/techlead/gp-track?projectId=${encodeURIComponent(project.id)}`, sourceResolved: state.resolved,
      });
    }
    await syncTechMoveProject(project, techmove, users, manager);
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const project of projects) {
    const manager = projectManager(users, project);
    if (!manager) continue;
    for (const front of project.fronts || []) {
      const covered = allocations.some(allocation => allocation.projectId === project.id && allocation.front === front && allocation.startDate <= project.endDate && allocation.endDate >= project.startDate);
      if (covered) continue;
      const sourceKey = `${project.id}:${front}:${project.startDate}:${project.endDate}`;
      activeKeys.add(`allocation_missing_front:${sourceKey}`);
      await activityStore.upsertSourceActivity({ scope: "project", projectId: project.id, title: `Alocar recurso para a frente ${front}`,
        description: `O projeto não possui cobertura cadastrada para ${front} entre ${project.startDate} e ${project.endDate}.`,
        status: "A fazer", priority: "Alta", assigneeUserId: manager.id, creatorUserId: manager.id,
        sourceType: "allocation_missing_front", sourceKey, sourceUrl: "/techboard/planner", sourceResolved: false });
    }
  }

  for (const resource of resources.filter(item => item.status === "Ativo" && !item.skipAllocationCheck)) {
    const current = allocations.filter(allocation => allocation.resourceId === resource.id && allocation.startDate <= today && allocation.endDate >= today);
    const user = users.find(item => item.resourceId === resource.id) || findUser(users, resource.email);
    if (current.length === 0) {
      const sourceKey = `${resource.id}:${today}`;
      activeKeys.add(`allocation_unallocated:${sourceKey}`);
      const owner = user || users.find(item => item.role === "manager") || users.find(item => item.role === "admin");
      if (owner) await activityStore.upsertSourceActivity({ scope: "internal", title: `${resource.name} está sem alocação`,
        description: `Nenhuma alocação ativa foi encontrada em ${today}.`, status: "A fazer", priority: "Alta",
        assigneeUserId: owner.id, creatorUserId: owner.id, sourceType: "allocation_unallocated", sourceKey,
        sourceUrl: "/techboard/planner", sourceResolved: false });
    }
    const hours = current.reduce((sum, allocation) => sum + allocation.hoursPerDay, 0);
    if (hours > resource.dailyCapacity) {
      const sourceKey = `${resource.id}:${today}`;
      activeKeys.add(`allocation_overallocated:${sourceKey}`);
      const owner = user || users.find(item => item.role === "manager") || users.find(item => item.role === "admin");
      if (owner) await activityStore.upsertSourceActivity({ scope: "internal", title: `${resource.name} está sobrealocado`,
        description: `${hours}h/dia alocadas para uma capacidade de ${resource.dailyCapacity}h/dia em ${today}.`, status: "A fazer",
        priority: "Crítica", assigneeUserId: owner.id, creatorUserId: owner.id, sourceType: "allocation_overallocated",
        sourceKey, sourceUrl: "/techboard/planner", sourceResolved: false });
    }
    if (resource.endDate) for (const allocation of allocations.filter(item => item.resourceId === resource.id && item.endDate > resource.endDate)) {
      const project = projects.find(item => item.id === allocation.projectId);
      if (!project) continue;
      const manager = projectManager(users, project);
      if (!manager) continue;
      const sourceKey = `${resource.id}:${allocation.id}:${resource.endDate}`;
      activeKeys.add(`allocation_end_date:${sourceKey}`);
      await activityStore.upsertSourceActivity({ scope: "project", projectId: project.id, title: `Replanejar saída de ${resource.name}`,
        description: `A alocação termina em ${allocation.endDate}, após a saída do consultor em ${resource.endDate}.`, status: "A fazer",
        priority: "Alta", assigneeUserId: manager.id, creatorUserId: manager.id, dueDate: resource.endDate,
        sourceType: "allocation_end_date", sourceKey, sourceUrl: "/techboard/planner", sourceResolved: false });
    }
  }
  await reconcileResolved(activeKeys);
  const currentActivities = await activityStore.listActivities();
  for (const activity of currentActivities.filter(item => item.status !== "Concluída" && item.dueDate && item.dueDate <= today)) {
    const overdue = activity.dueDate < today;
    await activityStore.createNotifications({
      activityId: activity.id,
      eventKey: `${activity.id}:deadline:${activity.dueDate}:${overdue ? "overdue" : "due"}`,
      eventType: overdue ? "overdue" : "due_today",
      title: activity.title,
      message: overdue ? `A atividade venceu em ${activity.dueDate}.` : "A atividade vence hoje.",
      userIds: [activity.assigneeUserId, ...activity.participantUserIds],
    });
  }
}

async function syncTechMoveProject(project: Project, data: TechMoveData, users: AppUser[], manager: AppUser) {
  const scopeByCode = new Map(data.scopeItems.map(item => [item.code, item]));
  for (const question of data.questions.filter(item => item.level === "L3 Consultor" && item.required !== false)) {
    const scope = question.scopeItemCodes.map(code => scopeByCode.get(code)).find(Boolean);
    const assignee = findUser(users, scope?.consultantId || scope?.consultantName) || manager;
    const state: ActivityStatus = question.status === "Validado" ? "Concluída" : question.status === "Respondido" ? "Em validação" : question.status === "Gap" ? "Bloqueada" : "A fazer";
    await activityStore.upsertSourceActivity({ scope: "project", projectId: project.id, title: question.text,
      description: `${question.module}${question.objective ? ` · ${question.objective}` : ""}`, status: state,
      priority: question.status === "Gap" ? "Alta" : "Média", assigneeUserId: assignee.id, creatorUserId: manager.id,
      participantUserIds: [manager.id], sourceType: "techmove_question", sourceKey: `${project.id}:${question.id}`,
      sourceUrl: `/techmove?projectId=${encodeURIComponent(project.id)}`, sourceResolved: question.status === "Validado" });
  }
  for (const gap of data.gaps) {
    const assignee = findUser(users, gap.assignedTo) || manager;
    const state: ActivityStatus = gap.status === "Resolvido" || gap.status === "Rejeitado" ? "Concluída" : gap.status === "Aprovado" ? "Em validação" : gap.status === "Em analise" ? "Em andamento" : "A fazer";
    await activityStore.upsertSourceActivity({ scope: "project", projectId: project.id, title: gap.title,
      description: gap.description, status: state, priority: priorityFromSeverity(gap.severity), assigneeUserId: assignee.id,
      creatorUserId: manager.id, participantUserIds: [manager.id], dueDate: gap.dueDate || "", sourceType: "techmove_gap",
      sourceKey: `${project.id}:${gap.id}`, sourceUrl: `/techmove?projectId=${encodeURIComponent(project.id)}`,
      sourceResolved: gap.status === "Resolvido" || gap.status === "Rejeitado" });
  }
  for (const configuration of data.configurations || []) {
    const assignee = findUser(users, configuration.owner) || manager;
    const state: ActivityStatus = configuration.status === "Concluido" ? "Concluída" : configuration.status === "Em andamento" ? "Em andamento" : configuration.status === "Bloqueado" ? "Bloqueada" : "A fazer";
    await activityStore.upsertSourceActivity({ scope: "project", projectId: project.id, title: configuration.title,
      description: configuration.description, status: state, priority: configuration.priority === "Alta" ? "Alta" : configuration.priority === "Baixa" ? "Baixa" : "Média",
      assigneeUserId: assignee.id, creatorUserId: manager.id, participantUserIds: [manager.id], sourceType: "techmove_configuration",
      sourceKey: `${project.id}:${configuration.id}`, sourceUrl: `/techmove?projectId=${encodeURIComponent(project.id)}`,
      sourceResolved: configuration.status === "Concluido" });
  }
}

export async function syncActivityStatusToSource(activity: Activity, status: ActivityStatus) {
  if (activity.sourceType === "gp_checklist") {
    await gpStore.updateChecklistItem(activity.projectId, activity.sourceKey, { status: gpSourceStatus(status) });
    return;
  }
  if (activity.sourceType === "gp_fit_step") {
    await gpStore.updateFitToStandardStep(activity.projectId, activity.sourceKey, { status: gpSourceStatus(status) });
    return;
  }
  if (!activity.sourceType.startsWith("techmove_")) return;
  const data = await plannerStore.getTechMoveData(activity.projectId);
  const entityId = activity.sourceKey.slice(activity.projectId.length + 1);
  if (activity.sourceType === "techmove_question") {
    data.questions = data.questions.map(item => item.id === entityId ? { ...item, status: status === "Concluída" ? "Validado" : status === "Em validação" ? "Respondido" : status === "Bloqueada" ? "Gap" : "Pendente" } : item);
  } else if (activity.sourceType === "techmove_gap") {
    data.gaps = data.gaps.map(item => item.id === entityId ? { ...item, status: status === "Concluída" ? "Resolvido" : status === "Em validação" ? "Aprovado" : status === "Em andamento" ? "Em analise" : "Aberto" } : item);
  } else if (activity.sourceType === "techmove_configuration") {
    data.configurations = (data.configurations || []).map(item => item.id === entityId ? { ...item, status: status === "Concluída" ? "Concluido" : status === "Bloqueada" ? "Bloqueado" : status === "Em andamento" || status === "Em validação" ? "Em andamento" : "Pendente" } : item);
  }
  await plannerStore.saveTechMoveData(activity.projectId, data);
}
