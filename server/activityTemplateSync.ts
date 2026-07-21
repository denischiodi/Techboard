import type { ActivityTemplate, AppUser, Project } from "../shared/types";
import * as activityStore from "./activityStore";
import * as templateStore from "./activityTemplateStore";
import * as plannerStore from "./plannerStore";

function normalize(value: string | undefined) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIso(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number) {
  const date = parseIso(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatIso(date);
}

function zonedToday(timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function mondayOfWeek(today: string) {
  const date = parseIso(today);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return formatIso(date);
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function occurrenceForTemplate(template: ActivityTemplate, project: Project, today = zonedToday()) {
  if (template.recurrence === "none") {
    return { key: "once", dueDate: addDays(project.startDate, template.dueOffsetDays) };
  }
  if (template.recurrence === "weekly") {
    const periodStart = mondayOfWeek(today);
    const dueDate = addDays(periodStart, (template.weekday + 6) % 7);
    if (dueDate < project.startDate || periodStart > project.endDate) return null;
    return { key: `week-${periodStart}`, dueDate };
  }
  const [year, month] = today.split("-").map(Number);
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const dueDay = Math.min(template.monthDay, lastDayOfMonth(year, month));
  const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
  if (dueDate < project.startDate || periodStart > project.endDate) return null;
  return { key: `month-${year}-${String(month).padStart(2, "0")}`, dueDate };
}

function isEligibleProject(project: Project, today: string) {
  const status = normalize(project.status);
  return !status.includes("conclu") && !status.includes("cancel") && project.endDate >= today;
}

function findProjectManager(users: AppUser[], project: Project) {
  const manager = normalize(project.manager);
  return users.find(user => user.active && [user.name, user.email, user.resourceId].some(value => normalize(value) === manager))
    || users.find(user => user.active && user.role === "admin");
}

export async function syncActivityTemplates(today = zonedToday()) {
  const [templates, projects, users, allocations] = await Promise.all([
    templateStore.listActivityTemplates(), plannerStore.listProjects(), plannerStore.listAppUsers(), plannerStore.listAllocations(),
  ]);
  let created = 0;
  let updated = 0;
  for (const template of templates.filter(item => item.active)) {
    const configuredProjects = new Map(template.projects.map(item => [item.projectId, item]));
    const targets = projects.filter(project => isEligibleProject(project, today) && (template.appliesToAllProjects || configuredProjects.has(project.id)));
    for (const project of targets) {
      const occurrence = occurrenceForTemplate(template, project, today);
      if (!occurrence) continue;
      const manager = findProjectManager(users, project);
      if (!manager) continue;
      const override = configuredProjects.get(project.id)?.assigneeUserId || "";
      const allocatedResourceIds = new Set(allocations.filter(item => item.projectId === project.id).map(item => item.resourceId));
      const roleCandidate = users.find(user => user.active && user.role === template.ownerRole && allocatedResourceIds.has(user.resourceId || ""));
      const assignee = users.find(user => user.active && user.id === override) || (template.ownerRole === "manager" ? manager : roleCandidate) || manager;
      const sourceKey = `${template.id}:${project.id}:${occurrence.key}`;
      const existing = await activityStore.findBySource("activity_template", sourceKey);
      if (existing?.status === "Concluída" || existing?.archivedAt) continue;
      await activityStore.upsertSourceActivity({
        scope: "project",
        projectId: project.id,
        title: template.title,
        description: template.description,
        status: existing?.status || "A fazer",
        priority: template.priority,
        assigneeUserId: assignee.id,
        creatorUserId: manager.id,
        participantUserIds: [manager.id],
        dueDate: occurrence.dueDate,
        sourceType: "activity_template",
        sourceKey,
        sourceResolved: false,
      });
      if (existing) updated++;
      else created++;
    }
  }
  return { created, updated };
}
