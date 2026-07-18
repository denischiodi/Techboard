import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { workflowRouter } from "./routers/workflow";
import { z } from "zod";
import type { Resource, Project, Phase, Absence, Allocation, ResourceFront, AppUser, UserRole, LookupItem, AppTab, ProjectFrontGap, ProjectMissingFrontsAlert, ResourceEndDateAlert, ResourceEndDateImpact, TechMoveData } from "../shared/types";
import { DEFAULT_PERMISSIONS } from "../shared/types";
import { parseISO, startOfWeek, endOfWeek, eachDayOfInterval, differenceInCalendarDays, format, getMonth, getDate, addDays, addYears, isValid } from "date-fns";
import * as store from "./plannerStore";
import { LoginCodeRateLimitError, consumeLoginCode, establishEmailSession, issueLoginCode, normalizeLoginEmail } from "./_core/emailAuth";

function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

function assertRequired(value: string | undefined, field: string) {
  if (!value || value.trim().length === 0) {
    badRequest(`${field} e obrigatorio`);
  }
}

function assertIsoDate(value: string | undefined, field: string, optional = false) {
  if (!value) {
    if (optional) return;
    badRequest(`${field} e obrigatorio`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isValid(parseISO(value))) {
    badRequest(`${field} deve estar no formato YYYY-MM-DD`);
  }
}

function assertDateRange(startDate: string | undefined, endDate: string | undefined, label: string, optional = false) {
  if (optional && !startDate && !endDate) return;
  assertIsoDate(startDate, `${label}: data inicial`, optional);
  assertIsoDate(endDate, `${label}: data final`, optional);
  if (startDate && endDate && parseISO(startDate) > parseISO(endDate)) {
    badRequest(`${label}: data inicial nao pode ser maior que data final`);
  }
}

function normalizeLookupText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function dateRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA <= endB && endA >= startB;
}

function formatIsoDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function countVacationDays(startDate: string, endDate: string, contractType: string) {
  const days = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
  if (contractType === "PJ") {
    return days.filter(day => day.getDay() !== 0 && day.getDay() !== 6).length;
  }
  return days.length;
}

function consumesVacationBalance(type: string) {
  const normalizedType = normalizeLookupText(type);
  return normalizedType === "ferias" || normalizedType === "dias vendidos";
}

function isSoldVacationDays(type: string) {
  return normalizeLookupText(type) === "dias vendidos";
}

function isBlockingAbsence(type: string) {
  return !isSoldVacationDays(type);
}

function getVacationPeriod(resource: Pick<Resource, "startDate" | "vacationDaysEntitled">, referenceDate = new Date()) {
  if (!resource.startDate || !isValid(parseISO(resource.startDate))) {
    return {
      available: false,
      entitled: 0,
      periodStart: "",
      periodEnd: "",
      nextReleaseDate: "",
    };
  }

  const startDate = parseISO(resource.startDate);
  let periodStart = addYears(startDate, 1);

  if (referenceDate < periodStart) {
    return {
      available: false,
      entitled: 0,
      periodStart: formatIsoDate(periodStart),
      periodEnd: formatIsoDate(addDays(addYears(periodStart, 1), -1)),
      nextReleaseDate: formatIsoDate(periodStart),
    };
  }

  while (addYears(periodStart, 1) <= referenceDate) {
    periodStart = addYears(periodStart, 1);
  }

  return {
    available: true,
    entitled: resource.vacationDaysEntitled,
    periodStart: formatIsoDate(periodStart),
    periodEnd: formatIsoDate(addDays(addYears(periodStart, 1), -1)),
    nextReleaseDate: "",
  };
}

function countUsedVacationDaysForPeriod(absences: Absence[], resource: Resource, excludeAbsenceId?: string) {
  const contractType = (resource as any).contractType || "CLT";
  const period = getVacationPeriod(resource);
  if (!period.available || !period.periodStart || !period.periodEnd) return 0;

  return absences
    .filter(absence => absence.id !== excludeAbsenceId && absence.resourceId === resource.id && consumesVacationBalance(absence.type))
    .reduce((sum, absence) => {
      if (!dateRangesOverlap(absence.startDate, absence.endDate, period.periodStart, period.periodEnd)) return sum;
      if (isSoldVacationDays(absence.type)) return sum + Math.max(0, Number(absence.daysCount || 0));
      const overlapStart = absence.startDate > period.periodStart ? absence.startDate : period.periodStart;
      const overlapEnd = absence.endDate < period.periodEnd ? absence.endDate : period.periodEnd;
      return sum + countVacationDays(overlapStart, overlapEnd, contractType);
    }, 0);
}

function assertVacationBalance(resource: Resource, absences: Absence[], input: Pick<Absence, "type" | "startDate" | "endDate"> & { daysCount?: number | null }, excludeAbsenceId?: string) {
  const contractType = (resource as any).contractType || "CLT";
  const period = getVacationPeriod(resource);
  if (!period.available) {
    return;
  }

  if (input.startDate < period.periodStart || input.endDate > period.periodEnd) {
    return;
  }

  const usedDays = countUsedVacationDaysForPeriod(absences, resource, excludeAbsenceId);
  const requestedDays = isSoldVacationDays(input.type)
    ? Number(input.daysCount || 0)
    : countVacationDays(input.startDate, input.endDate, contractType);
  const availableDays = period.entitled - usedDays;

  // Saldo insuficiente deve ser tratado como alerta operacional, nao como bloqueio.
  // Gestores podem aprovar excecoes combinadas com o consultor.
  void requestedDays;
  void availableDays;
}

async function assertUniqueResourceName(name: string, excludeId?: string) {
  const normalizedName = normalizeLookupText(name);
  const resources = await store.listResources();
  const duplicate = resources.find(resource =>
    resource.id !== excludeId && normalizeLookupText(resource.name) === normalizedName
  );
  if (duplicate) badRequest("Ja existe colaborador com este nome");
}

async function assertUniqueProjectName(name: string, excludeId?: string) {
  const normalizedName = normalizeLookupText(name);
  const projects = await store.listProjects();
  const duplicate = projects.find(project =>
    project.id !== excludeId && normalizeLookupText(project.name) === normalizedName
  );
  if (duplicate) badRequest("Ja existe projeto com este nome");
}

async function assertNoSameProjectResourceOverlap(input: Pick<Allocation, "resourceId" | "projectId" | "front" | "startDate" | "endDate"> & { id?: string }) {
  const resource = await store.getResourceById(input.resourceId);
  if (resource?.skipAllocationCheck) return;
  const allocations = await store.listAllocations();
  const duplicate = allocations.find(allocation =>
    allocation.id !== input.id &&
    allocation.resourceId === input.resourceId &&
    allocation.projectId === input.projectId &&
    allocation.front === input.front &&
    dateRangesOverlap(allocation.startDate, allocation.endDate, input.startDate, input.endDate)
  );

  if (duplicate) {
    badRequest(`Ja existe alocacao deste consultor nesta frente do projeto entre ${duplicate.startDate} e ${duplicate.endDate}. Ajuste o periodo ou edite a alocacao existente.`);
  }
}

function assertPositiveNumber(value: number | undefined, field: string, max?: number) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    badRequest(`${field} deve ser maior que zero`);
  }
  if (max !== undefined && value > max) {
    badRequest(`${field} deve ser menor ou igual a ${max}`);
  }
}

function assertNonNegativeNumber(value: number | undefined, field: string, max?: number) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    badRequest(`${field} deve ser zero ou maior`);
  }
  if (max !== undefined && value > max) {
    badRequest(`${field} deve ser menor ou igual a ${max}`);
  }
}

function isoDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function maxDate(...dates: Date[]) {
  return dates.reduce((max, date) => (date > max ? date : max));
}

function minDate(...dates: Date[]) {
  return dates.reduce((min, date) => (date < min ? date : min));
}

function hasUsableEndDate(value: string | undefined) {
  return Boolean(value && value > "1900-01-01" && isValid(parseISO(value)));
}

function isProjectInPlanningScope(project: Project) {
  return project.status === "Em andamento" || project.status === "Em Andamento" || project.status === "Em risco" || project.status === "Planejado";
}

function buildProjectFrontGaps(project: Project, front: ResourceFront, allocations: Allocation[], resources: Resource[]): ProjectFrontGap[] {
  const projectStart = parseISO(project.startDate);
  const projectEnd = parseISO(project.endDate);
  const frontAllocations = allocations
    .filter(allocation => allocation.projectId === project.id && allocation.front === front)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  let fallbackReason = "Sem alocação cadastrada para a frente";
  const spans = frontAllocations.flatMap(allocation => {
    const allocationStart = parseISO(allocation.startDate);
    const allocationEnd = parseISO(allocation.endDate);
    if (allocationEnd < projectStart || allocationStart > projectEnd) return [];

    const resource = resources.find(r => r.id === allocation.resourceId);
    const resourceStart = hasUsableEndDate(resource?.startDate) ? parseISO(resource!.startDate) : null;
    const resourceEnd = hasUsableEndDate(resource?.endDate) ? parseISO(resource!.endDate) : null;
    let effectiveEnd = allocationEnd;
    let reasonAfter = `Alocação termina em ${allocation.endDate} antes do fim do projeto (${project.endDate})`;

    if (resourceEnd && resourceEnd < allocationStart) {
      fallbackReason = `${resource?.name || "Consultor"} saiu da consultoria em ${resource!.endDate} antes do início da alocação`;
      return [];
    }

    if (resourceEnd && resourceEnd >= allocationStart && resourceEnd < effectiveEnd) {
      effectiveEnd = resourceEnd;
      reasonAfter = `${resource?.name || "Consultor"} sai da consultoria em ${resource!.endDate}`;
    }

    const start = maxDate(allocationStart, projectStart, resourceStart || projectStart);
    const end = minDate(effectiveEnd, projectEnd);
    if (end < start) return [];

    return [{
      start,
      end,
      allocationId: allocation.id,
      resourceId: allocation.resourceId,
      resourceName: resource?.name,
      reasonAfter,
    }];
  });

  if (spans.length === 0) {
    return [{ front, gapStart: project.startDate, gapEnd: project.endDate, reason: fallbackReason }];
  }

  const gaps: ProjectFrontGap[] = [];
  let cursor = projectStart;
  let lastReason = fallbackReason;

  for (const span of spans.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())) {
    if (span.start > cursor) {
      gaps.push({
        front,
        gapStart: isoDate(cursor),
        gapEnd: isoDate(addDays(span.start, -1)),
        reason: lastReason,
      });
    }

    if (span.end >= cursor) {
      cursor = addDays(span.end, 1);
      lastReason = span.reasonAfter;
      if (cursor > projectEnd) break;
    }
  }

  if (cursor <= projectEnd) {
    gaps.push({
      front,
      gapStart: isoDate(cursor),
      gapEnd: project.endDate,
      reason: lastReason,
    });
  }

  return gaps;
}

function buildProjectsMissingFronts(projects: Project[], allocations: Allocation[], resources: Resource[]): ProjectMissingFrontsAlert[] {
  const today = isoDate(new Date());
  return projects
    .filter(isProjectInPlanningScope)
    .flatMap(project => {
      if (!project.fronts || project.fronts.length === 0) return [];

      const gaps = project.fronts
        .flatMap(front => buildProjectFrontGaps(project, front, allocations, resources))
        .flatMap(gap => {
          if (gap.gapEnd < today) return [];
          return [{
            ...gap,
            gapStart: gap.gapStart < today ? today : gap.gapStart,
          }];
        });
      if (gaps.length === 0) return [];

      return [{
        projectId: project.id,
        projectName: project.name,
        missingFronts: Array.from(new Set(gaps.map(gap => gap.front))) as ResourceFront[],
        gaps,
      }];
    });
}

function isProjectFrontCovered(
  projectId: string,
  front: ResourceFront,
  startDate: string,
  endDate: string,
  allocations: Allocation[],
  resources: Resource[],
  excludeResourceId?: string,
) {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const spans = allocations
    .filter(allocation =>
      allocation.projectId === projectId &&
      allocation.front === front &&
      allocation.resourceId !== excludeResourceId
    )
    .flatMap(allocation => {
      const resource = resources.find(r => r.id === allocation.resourceId);
      const resourceStart = hasUsableEndDate(resource?.startDate) ? parseISO(resource!.startDate) : null;
      const resourceEnd = hasUsableEndDate(resource?.endDate) ? parseISO(resource!.endDate) : null;
      const allocationStart = parseISO(allocation.startDate);
      const allocationEnd = parseISO(allocation.endDate);
      const effectiveStart = maxDate(start, allocationStart, resourceStart || start);
      const effectiveEnd = minDate(end, allocationEnd, resourceEnd || end);

      if (effectiveEnd < effectiveStart) return [];
      return [{ start: effectiveStart, end: effectiveEnd }];
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());

  if (spans.length === 0) return false;

  let cursor = start;
  for (const span of spans) {
    if (span.start > cursor) return false;
    if (span.end >= cursor) cursor = addDays(span.end, 1);
    if (cursor > end) return true;
  }

  return false;
}

function buildResourceEndDateAlerts(resources: Resource[], projects: Project[], allocations: Allocation[]): ResourceEndDateAlert[] {
  const projectsById = new Map(projects.map(project => [project.id, project]));
  const today = isoDate(new Date());

  return resources
    .filter(resource => hasUsableEndDate(resource.endDate))
    .flatMap(resource => {
      const resourceEnd = parseISO(resource.endDate);
      const impactsByProjectFront = new Map<string, ResourceEndDateImpact>();

      allocations
        .filter(allocation => allocation.resourceId === resource.id)
        .forEach(allocation => {
          const project = projectsById.get(allocation.projectId);
          if (!project || !isProjectInPlanningScope(project)) return;

          const allocationStart = parseISO(allocation.startDate);
          const allocationEnd = parseISO(allocation.endDate);
          const projectStart = parseISO(project.startDate);
          const projectEnd = parseISO(project.endDate);
          const overlapsProject = allocationEnd >= projectStart && allocationStart <= projectEnd;
          if (!overlapsProject) return;

          const leavesDuringAllocation = resourceEnd < allocationEnd;
          const allocatedWhenLeaves = allocationStart <= resourceEnd && allocationEnd >= resourceEnd;
          const projectContinuesAfterResource = resourceEnd < projectEnd;
          if (!leavesDuringAllocation && !(allocatedWhenLeaves && projectContinuesAfterResource)) return;

          const impactStart = maxDate(projectStart, leavesDuringAllocation && resourceEnd < allocationStart ? allocationStart : addDays(resourceEnd, 1));
          const impactEnd = minDate(projectEnd, maxDate(allocationEnd, projectEnd));
          if (impactEnd < impactStart) return;
          if (isProjectFrontCovered(allocation.projectId, allocation.front, isoDate(impactStart), isoDate(impactEnd), allocations, resources, resource.id)) return;

          const key = `${allocation.projectId}:${allocation.front}`;
          const reason = leavesDuringAllocation && projectContinuesAfterResource
            ? "Consultor sai antes do fim da alocação e do projeto"
            : leavesDuringAllocation
            ? "Consultor sai antes do fim da alocação"
            : "Consultor sai antes do fim do projeto";
          const existing = impactsByProjectFront.get(key);

          impactsByProjectFront.set(key, {
            projectId: allocation.projectId,
            projectName: project.name,
            front: allocation.front,
            allocationEnd: existing && existing.allocationEnd > allocation.endDate ? existing.allocationEnd : allocation.endDate,
            projectEnd: project.endDate,
            impactStart: existing && existing.impactStart < isoDate(impactStart) ? existing.impactStart : isoDate(impactStart),
            impactEnd: existing && existing.impactEnd > isoDate(impactEnd) ? existing.impactEnd : isoDate(impactEnd),
            reason,
          });
        });

      const affectedProjects = Array.from(impactsByProjectFront.values())
        .flatMap(impact => {
          if (impact.impactEnd < today) return [];
          return [{
            ...impact,
            impactStart: impact.impactStart < today ? today : impact.impactStart,
          }];
        })
        .sort((a, b) => a.impactStart.localeCompare(b.impactStart));
      if (affectedProjects.length === 0) return [];

      return [{
        resourceId: resource.id,
        resourceName: resource.name,
        endDate: resource.endDate,
        affectedProjects,
      }];
    });
}

function assertPercent(value: number | undefined, field: string) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 100) {
    badRequest(`${field} deve estar entre 0 e 100`);
  }
}

async function assertAllocationReferences(input: Pick<Allocation, "resourceId" | "projectId"> & { phaseId?: string }) {
  const { resources, projects, phases } = await store.getPlannerSnapshot();
  if (!resources.some(r => r.id === input.resourceId)) badRequest("Recurso da alocacao nao existe");
  if (!projects.some(p => p.id === input.projectId)) badRequest("Projeto da alocacao nao existe");
  if (input.phaseId && !phases.some(p => p.id === input.phaseId)) badRequest("Fase da alocacao nao existe");
}

async function assertAbsenceReferences(input: Pick<Absence, "resourceId">) {
  const resources = await store.listResources();
  if (!resources.some(r => r.id === input.resourceId)) badRequest("Recurso da ausencia nao existe");
}

async function assertPhaseReferences(input: Pick<Phase, "projectId">) {
  const projects = await store.listProjects();
  if (!projects.some(p => p.id === input.projectId)) badRequest("Projeto da fase nao existe");
}

async function assertResourceCanBeDeleted(id: string) {
  const { absences, allocations } = await store.getPlannerSnapshot();
  if (allocations.some(a => a.resourceId === id)) badRequest("Nao e possivel excluir recurso com alocacoes vinculadas");
  if (absences.some(a => a.resourceId === id)) badRequest("Nao e possivel excluir recurso com ferias/ausencias vinculadas");
}

async function assertProjectCanBeDeleted(id: string) {
  const { phases, allocations } = await store.getPlannerSnapshot();
  if (allocations.some(a => a.projectId === id)) badRequest("Nao e possivel excluir projeto com alocacoes vinculadas");
  if (phases.some(p => p.projectId === id)) badRequest("Nao e possivel excluir projeto com fases vinculadas");
}

async function assertPhaseCanBeDeleted(id: string) {
  const allocations = await store.listAllocations();
  if (allocations.some(a => a.phaseId === id)) badRequest("Nao e possivel excluir fase com alocacoes vinculadas");
}

const permissionProcedure = (tab: AppTab) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    if (ctx.appUser?.role === "admin") {
      return next();
    }

    if (ctx.appUser?.permissions[tab]) {
      return next();
    }

    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Sem permissao para acessar ${tab}`,
    });
  });

const dashboardProcedure = permissionProcedure("dashboard");
const resourcesProcedure = permissionProcedure("resources");
const projectsProcedure = permissionProcedure("projects");
const absencesProcedure = permissionProcedure("absences");
const plannerProcedure = permissionProcedure("planner");
const techMoveProcedure = permissionProcedure("techmove");
const settingsProcedure = permissionProcedure("settings");

function isReadOnlyScopedRole(appUser?: AppUser | null) {
  return appUser?.role === "consultant" || appUser?.role === "technical_lead";
}

function assertCanWrite(ctx: { appUser?: AppUser | null }) {
  if (isReadOnlyScopedRole(ctx.appUser)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil permite apenas consulta" });
  }
}

async function assertCanManageAbsenceResource(ctx: { appUser?: AppUser | null }, resourceId: string) {
  if (!ctx.appUser) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para gerenciar ausencia" });
  }
  if (ctx.appUser.role === "admin" || ctx.appUser.role === "manager") return;
  if (ctx.appUser.role !== "technical_lead") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil permite apenas consulta" });
  }
  const allowedIds = await getAllowedResourceIds(ctx.appUser);
  if (!allowedIds.has(resourceId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Lider tecnico so pode gerenciar ferias do proprio time" });
  }
}

async function resolveUserResourceId(appUser?: AppUser | null) {
  if (!appUser) return "";
  if (appUser.resourceId) return appUser.resourceId;
  const resources = await store.listResources();
  return resources.find(resource => resource.email && resource.email.toLowerCase() === appUser.email.toLowerCase())?.id || "";
}

function resourceMatchesTeam(resource: Resource, teamFronts: string[]) {
  if (teamFronts.length === 0) return false;
  const fronts = Array.isArray(resource.fronts) && resource.fronts.length > 0 ? resource.fronts : [resource.front].filter(Boolean);
  return fronts.some(front => teamFronts.includes(front));
}

async function getAllowedResourceIds(appUser?: AppUser | null) {
  const resources = await store.listResources();
  if (!appUser || appUser.role === "admin" || appUser.role === "manager") {
    return new Set(resources.map(resource => resource.id));
  }

  if (appUser.role === "consultant") {
    const resourceId = await resolveUserResourceId(appUser);
    return new Set(resourceId ? [resourceId] : []);
  }

  if (appUser.role === "technical_lead") {
    const teamFronts = appUser.teamFronts || [];
    const ownResourceId = await resolveUserResourceId(appUser);
    return new Set(resources
      .filter(resource => resource.id === ownResourceId || resourceMatchesTeam(resource, teamFronts))
      .map(resource => resource.id));
  }

  return new Set<string>();
}

async function filterResourcesForUser(resources: Resource[], appUser?: AppUser | null) {
  if (!appUser || appUser.role === "admin" || appUser.role === "manager") return resources;
  const allowedIds = await getAllowedResourceIds(appUser);
  return resources.filter(resource => allowedIds.has(resource.id));
}

async function filterAllocationsForUser(allocations: Allocation[], appUser?: AppUser | null) {
  if (!appUser || appUser.role === "admin" || appUser.role === "manager") return allocations;
  const allowedIds = await getAllowedResourceIds(appUser);
  return allocations.filter(allocation => allowedIds.has(allocation.resourceId));
}

async function filterAbsencesForUser(absences: Absence[], appUser?: AppUser | null) {
  if (!appUser || appUser.role === "admin" || appUser.role === "manager") return absences;
  const allowedIds = await getAllowedResourceIds(appUser);
  return absences.filter(absence => allowedIds.has(absence.resourceId));
}

async function filterProjectsForUser(projects: Project[], allocations: Allocation[], appUser?: AppUser | null) {
  if (!appUser || appUser.role === "admin" || appUser.role === "manager") return projects;
  const scopedAllocations = await filterAllocationsForUser(allocations, appUser);
  const projectIds = new Set(scopedAllocations.map(allocation => allocation.projectId));
  return projects.filter(project => projectIds.has(project.id));
}

export const appRouter = router({
  system: systemRouter,
  workflow: workflowRouter,
  auth: router({
    me: publicProcedure.query(async opts => {
      const user = opts.ctx.user;
      if (!user?.email) return null;

      const appUser = await store.getAppUserByEmail(user.email);
      if (!appUser?.active) return null;

      return {
        ...user,
        email: appUser.email,
        name: appUser.name,
        role: appUser.role === "admin" ? "admin" as const : "user" as const,
        appRole: appUser.role,
        permissions: appUser.permissions,
        resourceId: appUser.resourceId || "",
        teamFronts: appUser.teamFronts || [],
      };
    }),
    requestCode: publicProcedure.input(z.object({
      email: z.string().email(),
    })).mutation(async ({ ctx, input }) => {
      const email = normalizeLoginEmail(input.email);
      const appUser = await store.getAppUserByEmail(email);
      if (!appUser || !appUser.active) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "E-mail sem acesso ativo. Solicite liberacao em Gestao de Acesso.",
        });
      }

      let result: Awaited<ReturnType<typeof issueLoginCode>>;
      try {
        result = await issueLoginCode(email, ctx.req);
      } catch (error) {
        if (error instanceof LoginCodeRateLimitError) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
        }
        throw error;
      }

      return {
        success: true,
        delivery: result.delivery,
        ...(result.delivery === "log" && "code" in result ? { code: result.code } : {}),
      };
    }),
    verifyCode: publicProcedure.input(z.object({
      email: z.string().email(),
      code: z.string().trim().regex(/^\d{6}$/, "Codigo deve ter 6 digitos"),
    })).mutation(async ({ ctx, input }) => {
      const email = normalizeLoginEmail(input.email);
      const appUser = await store.getAppUserByEmail(email);
      if (!appUser || !appUser.active) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "E-mail sem acesso ativo. Solicite liberacao em Gestao de Acesso.",
        });
      }

      let valid: boolean;
      try {
        valid = await consumeLoginCode(email, input.code, ctx.req);
      } catch (error) {
        if (error instanceof LoginCodeRateLimitError) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
        }
        throw error;
      }

      if (!valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Codigo invalido ou expirado.",
        });
      }

      return establishEmailSession(appUser, ctx.res, ctx.req);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ===== RESOURCES =====
  resources: router({
    list: resourcesProcedure.query(async ({ ctx }) => {
      const { resources, absences } = await store.getPlannerSnapshot();
      const visibleResources = await filterResourcesForUser(resources, ctx.appUser);
      const visibleAbsences = await filterAbsencesForUser(absences, ctx.appUser);
      return visibleResources.map(r => {
        const contractType = (r as any).contractType || 'CLT';
        const vacationPeriod = getVacationPeriod(r);
        const usedDays = countUsedVacationDaysForPeriod(visibleAbsences, r);
        const entitledDays = vacationPeriod.entitled;
        const fronts = Array.isArray((r as any).fronts) && (r as any).fronts.length > 0 ? (r as any).fronts : [r.front].filter(Boolean);
        return {
          ...r,
          email: (r as any).email || '',
          fronts,
          contractType,
          vacationDaysUsed: usedDays,
          vacationDaysAvailableEntitled: entitledDays,
          vacationBalance: entitledDays - usedDays,
          vacationPeriodStart: vacationPeriod.periodStart,
          vacationPeriodEnd: vacationPeriod.periodEnd,
          vacationNextReleaseDate: vacationPeriod.nextReleaseDate,
        };
      });
    }),
    getById: resourcesProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
      const resource = await store.getResourceById(input.id);
      if (!resource) return null;
      const visibleResources = await filterResourcesForUser([resource], ctx.appUser);
      if (visibleResources.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para consultar este recurso" });
      }
      return resource;
    }),
    create: resourcesProcedure.input(z.object({
      name: z.string(),
      email: z.string().default(''),
      photoUrl: z.string().default(''),
      group: z.string().default(''),
      profile: z.string(),
      front: z.string().default(''),
      fronts: z.array(z.string()).default([]),
      dailyCapacity: z.number().default(8),
      status: z.string().default('Ativo'),
      contractType: z.string().default('CLT'),
      birthDate: z.string().default(''),
      startDate: z.string().default(''),
      endDate: z.string().default(''),
      vacationDaysEntitled: z.number().default(30),
      skipAllocationCheck: z.boolean().default(false),
      notes: z.string().default(''),
    })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      assertRequired(input.name, "Nome");
      assertRequired(input.profile, "Perfil");
      assertPositiveNumber(input.dailyCapacity, "Capacidade diaria", 24);
      assertNonNegativeNumber(input.vacationDaysEntitled, "Dias de ferias/ano", 365);
      assertIsoDate(input.birthDate, "Data de nascimento", true);
      assertIsoDate(input.startDate, "Inicio na consultoria", true);
      assertIsoDate(input.endDate, "Fim na consultoria", true);
      assertDateRange(input.startDate, input.endDate, "Periodo na consultoria", true);
      await assertUniqueResourceName(input.name);
      const fronts = input.fronts.length > 0 ? input.fronts : [input.front].filter(Boolean);
      return store.createResource({ ...input, front: fronts[0] || '', fronts } as Omit<Resource, "id">);
    }),
    update: resourcesProcedure.input(z.object({
      id: z.string(),
      name: z.string().optional(),
      email: z.string().optional(),
      photoUrl: z.string().optional(),
      group: z.string().optional(),
      profile: z.string().optional(),
      front: z.string().optional(),
      fronts: z.array(z.string()).optional(),
      dailyCapacity: z.number().optional(),
      status: z.string().optional(),
      contractType: z.string().optional(),
      birthDate: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      vacationDaysEntitled: z.number().optional(),
      skipAllocationCheck: z.boolean().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      const current = await store.getResourceById(input.id);
      if (!current) badRequest("Recurso nao encontrado");
      const next = { ...current, ...input };
      if (input.name !== undefined) assertRequired(input.name, "Nome");
      if (input.profile !== undefined) assertRequired(input.profile, "Perfil");
      if (input.dailyCapacity !== undefined) assertPositiveNumber(input.dailyCapacity, "Capacidade diaria", 24);
      if (input.vacationDaysEntitled !== undefined) assertNonNegativeNumber(input.vacationDaysEntitled, "Dias de ferias/ano", 365);
      if (input.birthDate !== undefined) assertIsoDate(input.birthDate, "Data de nascimento", true);
      if (input.startDate !== undefined) assertIsoDate(input.startDate, "Inicio na consultoria", true);
      if (input.endDate !== undefined) assertIsoDate(input.endDate, "Fim na consultoria", true);
      assertDateRange(next.startDate, next.endDate, "Periodo na consultoria", true);
      if (input.name !== undefined) await assertUniqueResourceName(input.name, input.id);
      return store.updateResource(input);
    }),
    delete: resourcesProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      await assertResourceCanBeDeleted(input.id);
      return store.deleteResource(input.id);
    }),
    bulkImport: resourcesProcedure.input(z.union([z.array(z.object({
        id: z.string().optional(),
        name: z.string(),
        email: z.string().default(''),
        photoUrl: z.string().default(''),
        group: z.string().default(''),
        profile: z.string(),
        front: z.string().default(''),
        fronts: z.array(z.string()).default([]),
        dailyCapacity: z.number().default(8),
        status: z.string().default('Ativo'),
        contractType: z.string().default('CLT'),
        birthDate: z.string().default(''),
        startDate: z.string().default(''),
        endDate: z.string().default(''),
        vacationDaysEntitled: z.number().default(30),
        skipAllocationCheck: z.boolean().default(false),
        notes: z.string().default(''),
      })), z.object({ items: z.array(z.object({
        id: z.string().optional(),
        name: z.string(),
        email: z.string().default(''),
        photoUrl: z.string().default(''),
        group: z.string().default(''),
        profile: z.string(),
        front: z.string().default(''),
        fronts: z.array(z.string()).default([]),
        dailyCapacity: z.number().default(8),
        status: z.string().default('Ativo'),
        contractType: z.string().default('CLT'),
        birthDate: z.string().default(''),
        startDate: z.string().default(''),
        endDate: z.string().default(''),
        vacationDaysEntitled: z.number().default(30),
        skipAllocationCheck: z.boolean().default(false),
        notes: z.string().default(''),
    })) })])).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      const inputItems = Array.isArray(input) ? input : input.items;
      const created: Resource[] = [];
      const updated: Resource[] = [];
      const importedNames = new Set<string>();
      const importedIds = new Set<string>();
      const existingResources = await store.listResources();
      for (const item of inputItems) {
        assertRequired(item.name, "Nome");
        assertRequired(item.profile, "Perfil");
        assertPositiveNumber(item.dailyCapacity, "Capacidade diaria", 24);
        assertNonNegativeNumber(item.vacationDaysEntitled, "Dias de ferias/ano", 365);
        assertIsoDate(item.birthDate, "Data de nascimento", true);
        assertIsoDate(item.startDate, "Inicio na consultoria", true);
        assertIsoDate(item.endDate, "Fim na consultoria", true);
        assertDateRange(item.startDate, item.endDate, "Periodo na consultoria", true);
        const normalizedName = normalizeLookupText(item.name);
        if (importedNames.has(normalizedName)) badRequest(`Arquivo possui colaborador duplicado: ${item.name}`);
        const itemId = item.id?.trim() || "";
        if (itemId && importedIds.has(itemId)) badRequest(`Arquivo possui ID de colaborador duplicado: ${itemId}`);
        const existing = existingResources.find(resource => resource.id === itemId)
          || existingResources.find(resource => normalizeLookupText(resource.name) === normalizedName);
        await assertUniqueResourceName(item.name, existing?.id);
        importedNames.add(normalizedName);
        if (itemId) importedIds.add(itemId);
        const fronts = item.fronts.length > 0 ? item.fronts : [item.front].filter(Boolean);
        const resourcePayload = { ...item, front: fronts[0] || '', fronts };
        if (existing) {
          updated.push(await store.updateResource({ ...resourcePayload, id: existing.id }));
        } else {
          created.push(await store.createResource(resourcePayload as Omit<Resource, "id"> & { id?: string }));
        }
      }
      return { count: created.length + updated.length, created: created.length, updated: updated.length, items: [...created, ...updated] };
    }),
  }),

  // ===== PROJECTS =====
  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.appUser?.permissions.projects && !ctx.appUser?.permissions.planner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para acessar projetos" });
      }
      const [projects, allocations] = await Promise.all([store.listProjects(), store.listAllocations()]);
      return filterProjectsForUser(projects, allocations, ctx.appUser);
    }),
    getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
      if (!ctx.appUser?.permissions.projects && !ctx.appUser?.permissions.planner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para acessar projetos" });
      }
      const project = await store.getProjectById(input.id);
      if (!project) return null;
      const allocations = await store.listAllocations();
      const visible = await filterProjectsForUser([project], allocations, ctx.appUser);
      if (visible.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para consultar este projeto" });
      }
      return project;
    }),
    create: projectsProcedure.input(z.object({
      name: z.string(),
      client: z.string(),
      manager: z.string(),
      status: z.string().default('Planejado'),
      startDate: z.string(),
      endDate: z.string(),
      fronts: z.array(z.string()).default([]),
      notes: z.string().default(''),
    })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      assertRequired(input.name, "Nome do projeto");
      assertRequired(input.client, "Cliente");
      assertDateRange(input.startDate, input.endDate, "Periodo do projeto");
      await assertUniqueProjectName(input.name);
      return store.createProject(input as Omit<Project, "id">);
    }),
    update: projectsProcedure.input(z.object({
      id: z.string(),
      name: z.string().optional(),
      client: z.string().optional(),
      manager: z.string().optional(),
      status: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      fronts: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      const current = await store.getProjectById(input.id);
      if (!current) badRequest("Projeto nao encontrado");
      const next = { ...current, ...input };
      if (input.name !== undefined) assertRequired(input.name, "Nome do projeto");
      if (input.client !== undefined) assertRequired(input.client, "Cliente");
      if (input.startDate !== undefined) assertIsoDate(input.startDate, "Data inicial do projeto");
      if (input.endDate !== undefined) assertIsoDate(input.endDate, "Data final do projeto");
      assertDateRange(next.startDate, next.endDate, "Periodo do projeto");
      if (input.name !== undefined) await assertUniqueProjectName(input.name, input.id);
      return store.updateProject(input);
    }),
    delete: projectsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      await assertProjectCanBeDeleted(input.id);
      return store.deleteProject(input.id);
    }),
    bulkImport: projectsProcedure.input(z.union([z.array(z.object({
        name: z.string(),
        client: z.string(),
        manager: z.string().default(''),
        status: z.string().default('Planejado'),
        startDate: z.string(),
        endDate: z.string(),
        fronts: z.array(z.string()).default([]),
        notes: z.string().default(''),
      })), z.object({ items: z.array(z.object({
        name: z.string(),
        client: z.string(),
        manager: z.string().default(''),
        status: z.string().default('Planejado'),
        startDate: z.string(),
        endDate: z.string(),
        fronts: z.array(z.string()).default([]),
        notes: z.string().default(''),
    })) })])).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      const inputItems = Array.isArray(input) ? input : input.items;
      const created: Project[] = [];
      const importedNames = new Set<string>();
      for (const item of inputItems) {
        assertRequired(item.name, "Nome do projeto");
        assertRequired(item.client, "Cliente");
        assertDateRange(item.startDate, item.endDate, "Periodo do projeto");
        const normalizedName = normalizeLookupText(item.name);
        if (importedNames.has(normalizedName)) badRequest(`Arquivo possui projeto duplicado: ${item.name}`);
        await assertUniqueProjectName(item.name);
        importedNames.add(normalizedName);
        created.push(await store.createProject(item as Omit<Project, "id">));
      }
      return { count: created.length, items: created };
    }),
  }),

  // ===== PHASES =====
  phases: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.appUser?.permissions.projects && !ctx.appUser?.permissions.planner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para acessar fases" });
      }
      const { phases, projects, allocations } = await store.getPlannerSnapshot();
      const visibleProjects = await filterProjectsForUser(projects, allocations, ctx.appUser);
      const projectIds = new Set(visibleProjects.map(project => project.id));
      return phases.filter(phase => projectIds.has(phase.projectId));
    }),
    listByProject: protectedProcedure.input(z.object({ projectId: z.string() })).query(async ({ ctx, input }) => {
      if (!ctx.appUser?.permissions.projects && !ctx.appUser?.permissions.planner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para acessar fases" });
      }
      const { projects, allocations } = await store.getPlannerSnapshot();
      const visibleProjects = await filterProjectsForUser(projects, allocations, ctx.appUser);
      if (!visibleProjects.some(project => project.id === input.projectId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para consultar fases deste projeto" });
      }
      const phases = await store.listPhases();
      return phases.filter(p => p.projectId === input.projectId);
    }),
    create: projectsProcedure.input(z.object({
      projectId: z.string(),
      phase: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      responsible: z.string().default(''),
      completionPercent: z.number().default(0),
      status: z.string().default('Planejado'),
      notes: z.string().default(''),
    })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      assertRequired(input.phase, "Fase");
      assertDateRange(input.startDate, input.endDate, "Periodo da fase");
      assertPercent(input.completionPercent, "Percentual de conclusao");
      await assertPhaseReferences(input);
      return store.createPhase(input as Omit<Phase, "id">);
    }),
    update: projectsProcedure.input(z.object({
      id: z.string(),
      projectId: z.string().optional(),
      phase: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      responsible: z.string().optional(),
      completionPercent: z.number().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      if (input.phase !== undefined) assertRequired(input.phase, "Fase");
      if (input.startDate !== undefined) assertIsoDate(input.startDate, "Data inicial da fase");
      if (input.endDate !== undefined) assertIsoDate(input.endDate, "Data final da fase");
      if (input.completionPercent !== undefined) assertPercent(input.completionPercent, "Percentual de conclusao");
      if (input.projectId !== undefined) await assertPhaseReferences({ projectId: input.projectId });
      return store.updatePhase(input);
    }),
    delete: projectsProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      await assertPhaseCanBeDeleted(input.id);
      return store.deletePhase(input.id);
    }),
  }),

  // ===== ABSENCES =====
  absences: router({
    list: absencesProcedure.query(async ({ ctx }) => {
      const absences = await store.listAbsences();
      return filterAbsencesForUser(absences, ctx.appUser);
    }),
    listByResource: absencesProcedure.input(z.object({ resourceId: z.string() })).query(async ({ ctx, input }) => {
      const absences = await store.listAbsences();
      const visibleAbsences = await filterAbsencesForUser(absences, ctx.appUser);
      return visibleAbsences.filter(a => a.resourceId === input.resourceId);
    }),
    create: absencesProcedure.input(z.object({
      resourceId: z.string(),
      type: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      daysCount: z.number().optional(),
      approved: z.boolean().default(false),
      notes: z.string().default(''),
    })).mutation(async ({ ctx, input }) => {
      await assertCanManageAbsenceResource(ctx, input.resourceId);
      assertRequired(input.type, "Tipo de ausencia");
      assertDateRange(input.startDate, input.endDate, "Periodo da ausencia");
      await assertAbsenceReferences(input);
      if (isSoldVacationDays(input.type)) assertPositiveNumber(input.daysCount, "Quantidade de dias vendidos", 365);
      if (consumesVacationBalance(input.type)) {
        const { resources, absences } = await store.getPlannerSnapshot();
        const resource = resources.find(r => r.id === input.resourceId);
        if (resource) {
          assertVacationBalance(resource, absences, input);
        }
      }
      const next = isSoldVacationDays(input.type)
        ? { ...input, endDate: input.startDate }
        : { ...input, daysCount: null };
      return store.createAbsence(next as Omit<Absence, "id">);
    }),
    update: absencesProcedure.input(z.object({
      id: z.string(),
      resourceId: z.string().optional(),
      type: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      daysCount: z.number().optional(),
      approved: z.boolean().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      const current = (await store.listAbsences()).find(a => a.id === input.id);
      if (!current) badRequest("Ausencia nao encontrada");
      const next = { ...current, ...input };
      if (isSoldVacationDays(next.type)) next.endDate = next.startDate;
      await assertCanManageAbsenceResource(ctx, next.resourceId);
      assertRequired(next.type, "Tipo de ausencia");
      assertDateRange(next.startDate, next.endDate, "Periodo da ausencia");
      await assertAbsenceReferences(next);
      if (isSoldVacationDays(next.type)) assertPositiveNumber(next.daysCount, "Quantidade de dias vendidos", 365);
      if (consumesVacationBalance(next.type)) {
        const { resources, absences } = await store.getPlannerSnapshot();
        const resource = resources.find(r => r.id === next.resourceId);
        if (resource) {
          assertVacationBalance(resource, absences, next, next.id);
        }
      }
      return store.updateAbsence({ ...input, endDate: next.endDate, daysCount: isSoldVacationDays(next.type) ? next.daysCount : null } as Partial<Absence> & { id: string });
    }),
    delete: absencesProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      const current = (await store.listAbsences()).find(a => a.id === input.id);
      if (!current) badRequest("Ausencia nao encontrada");
      await assertCanManageAbsenceResource(ctx, current.resourceId);
      return store.deleteAbsence(input.id);
    }),
    bulkImport: absencesProcedure.input(z.union([z.array(z.object({
        id: z.string().optional(),
        resourceId: z.string(),
        resourceName: z.string().optional(),
        type: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        daysCount: z.number().optional(),
        approved: z.boolean().default(false),
        notes: z.string().default(''),
      })), z.object({ items: z.array(z.object({
        id: z.string().optional(),
        resourceId: z.string(),
        resourceName: z.string().optional(),
        type: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        daysCount: z.number().optional(),
        approved: z.boolean().default(false),
        notes: z.string().default(''),
    })) })])).mutation(async ({ ctx, input }) => {
      const inputItems = Array.isArray(input) ? input : input.items;
      const created: Absence[] = [];
      const updated: Absence[] = [];
      const skipped: Array<{ resourceName?: string; reason: string }> = [];
      const resources = await store.listResources();
      const existingAbsences = await store.listAbsences();
      for (const item of inputItems) {
        try {
          assertRequired(item.type, "Tipo de ausencia");
          assertDateRange(item.startDate, item.endDate, "Periodo da ausencia");
          const resourceId = resources.some(resource => resource.id === item.resourceId)
            ? item.resourceId
            : resources.find(resource => normalizeLookupText(resource.name) === normalizeLookupText(item.resourceName))?.id || "";
          if (!resourceId) {
            skipped.push({ resourceName: item.resourceName || item.resourceId, reason: "Recurso nao encontrado" });
            continue;
          }
          await assertCanManageAbsenceResource(ctx, resourceId);

          if (isSoldVacationDays(item.type)) assertPositiveNumber(item.daysCount, "Quantidade de dias vendidos", 365);
          const absence = isSoldVacationDays(item.type)
            ? { ...item, resourceId, endDate: item.startDate }
            : { ...item, resourceId, daysCount: null };
          if (consumesVacationBalance(absence.type)) {
            const resource = resources.find(resource => resource.id === resourceId);
            if (resource) assertVacationBalance(resource, existingAbsences, absence, absence.id);
          }
          if (absence.id && existingAbsences.some(existing => existing.id === absence.id)) {
            updated.push(await store.updateAbsence(absence as Absence));
          } else {
            created.push(await store.createAbsence(absence as Omit<Absence, "id"> & { id?: string }));
          }
        } catch (error: any) {
          skipped.push({ resourceName: item.resourceName || item.resourceId, reason: error?.message || "Linha invalida" });
        }
      }
      return { count: created.length + updated.length, created: created.length, updated: updated.length, skipped: skipped.length, skippedItems: skipped, items: [...created, ...updated] };
    }),
  }),

  // ===== ALLOCATIONS =====
  allocations: router({
    list: plannerProcedure.query(async ({ ctx }) => {
      const allocations = await store.listAllocations();
      return filterAllocationsForUser(allocations, ctx.appUser);
    }),
    listByDateRange: plannerProcedure.input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      resourceId: z.string().optional(),
      projectId: z.string().optional(),
      front: z.string().optional(),
    })).query(async ({ ctx, input }) => {
      assertDateRange(input.startDate, input.endDate, "Periodo de consulta");
      const allocations = await filterAllocationsForUser(await store.listAllocations(), ctx.appUser);
      return allocations.filter(a => {
        const aStart = parseISO(a.startDate);
        const aEnd = parseISO(a.endDate);
        const rangeStart = parseISO(input.startDate);
        const rangeEnd = parseISO(input.endDate);
        const overlaps = aStart <= rangeEnd && aEnd >= rangeStart;
        if (!overlaps) return false;
        if (input.resourceId && a.resourceId !== input.resourceId) return false;
        if (input.projectId && a.projectId !== input.projectId) return false;
        if (input.front && a.front !== input.front) return false;
        return true;
      });
    }),
    create: plannerProcedure.input(z.object({
      resourceId: z.string(),
      projectId: z.string(),
      phaseId: z.string().default(''),
      front: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      hoursPerDay: z.number(),
      allocationType: z.string().default('Projeto'),
      status: z.string().default('Planejado'),
      notes: z.string().default(''),
    })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      assertRequired(input.front, "Frente da alocacao");
      assertDateRange(input.startDate, input.endDate, "Periodo da alocacao");
      assertPositiveNumber(input.hoursPerDay, "Horas por dia", 24);
      await assertAllocationReferences(input);
      await assertNoSameProjectResourceOverlap(input);
      return store.createAllocation(input as Omit<Allocation, "id">);
    }),
    update: plannerProcedure.input(z.object({
      id: z.string(),
      resourceId: z.string().optional(),
      projectId: z.string().optional(),
      phaseId: z.string().optional(),
      front: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      hoursPerDay: z.number().optional(),
      allocationType: z.string().optional(),
      status: z.string().optional(),
      notes: z.string().optional(),
    })).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      const current = (await store.listAllocations()).find(a => a.id === input.id);
      if (!current) badRequest("Alocacao nao encontrada");
      const next = { ...current, ...input };
      assertRequired(next.front, "Frente da alocacao");
      assertDateRange(next.startDate, next.endDate, "Periodo da alocacao");
      assertPositiveNumber(next.hoursPerDay, "Horas por dia", 24);
      await assertAllocationReferences(next);
      await assertNoSameProjectResourceOverlap(next);
      return store.updateAllocation(input);
    }),
    delete: plannerProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
      assertCanWrite(ctx);
      return store.deleteAllocation(input.id);
    }),
    bulkImport: plannerProcedure.input(z.union([z.array(z.object({
        resourceId: z.string(),
        projectId: z.string(),
        phaseId: z.string().default(''),
        front: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        hoursPerDay: z.number(),
        allocationType: z.string().default('Projeto'),
        status: z.string().default('Planejado'),
        notes: z.string().default(''),
      })), z.object({ items: z.array(z.object({
        resourceId: z.string(),
        projectId: z.string(),
        phaseId: z.string().default(''),
        front: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        hoursPerDay: z.number(),
        allocationType: z.string().default('Projeto'),
        status: z.string().default('Planejado'),
        notes: z.string().default(''),
    })) })])).mutation(async ({ ctx, input }) => {
      assertCanWrite(ctx);
      const inputItems = Array.isArray(input) ? input : input.items;
      const created: Allocation[] = [];
      for (const item of inputItems) {
        assertRequired(item.front, "Frente da alocacao");
        assertDateRange(item.startDate, item.endDate, "Periodo da alocacao");
        assertPositiveNumber(item.hoursPerDay, "Horas por dia", 24);
        await assertAllocationReferences(item);
        const resource = await store.getResourceById(item.resourceId);
        if (!resource?.skipAllocationCheck && created.some(allocation =>
          allocation.resourceId === item.resourceId &&
          allocation.projectId === item.projectId &&
          allocation.front === item.front &&
          dateRangesOverlap(allocation.startDate, allocation.endDate, item.startDate, item.endDate)
        )) {
          badRequest("Arquivo possui alocacao duplicada para o mesmo consultor, projeto, frente e periodo");
        }
        await assertNoSameProjectResourceOverlap(item);
        created.push(await store.createAllocation(item as Omit<Allocation, "id">));
      }
      return { count: created.length, items: created };
    }),
  }),

  // ===== TECHMOVE / PROJECT FLOW =====
  techmove: router({
    get: techMoveProcedure.input(z.object({ projectId: z.string().min(1) })).query(async ({ input }) => {
      return store.getTechMoveData(input.projectId);
    }),

    save: techMoveProcedure.input(z.object({
      projectId: z.string().min(1),
      data: z.object({
        projectId: z.string().min(1),
        phase: z.enum(["prepare", "explore"]),
        scopeItems: z.array(z.object({
          id: z.string(),
          module: z.string(),
          code: z.string(),
          name: z.string(),
          processArea: z.string(),
          description: z.string().optional(),
          documentRef: z.string().optional(),
          consultantId: z.string().optional(),
          consultantName: z.string().optional(),
          active: z.boolean(),
        }).passthrough()),
        bdcqCatalog: z.array(z.object({
          id: z.string(),
          module: z.string(),
          scopeItemCodes: z.array(z.string()),
          level: z.enum(["L2 Cliente", "L3 Consultor"]),
          category: z.string(),
          text: z.string(),
          objective: z.string().optional(),
          answerType: z.enum(["Texto", "Sim/Nao", "Lista", "Data", "Numero", "Anexo"]).optional(),
          ownerRole: z.enum(["Cliente", "Consultor", "Arquiteto", "PM", "Diretor Delivery"]).optional(),
          required: z.boolean().optional(),
          gapTrigger: z.string().optional(),
          answer: z.string(),
          evidence: z.string(),
          status: z.enum(["Pendente", "Respondido", "Validado", "Gap"]),
          reusable: z.boolean(),
          global: z.boolean().optional(),
          client: z.string().optional(),
        }).passthrough()).optional(),
        questions: z.array(z.object({
          id: z.string(),
          module: z.string(),
          scopeItemCodes: z.array(z.string()),
          level: z.enum(["L2 Cliente", "L3 Consultor"]),
          category: z.string(),
          text: z.string(),
          objective: z.string().optional(),
          answerType: z.enum(["Texto", "Sim/Nao", "Lista", "Data", "Numero", "Anexo"]).optional(),
          ownerRole: z.enum(["Cliente", "Consultor", "Arquiteto", "PM", "Diretor Delivery"]).optional(),
          required: z.boolean().optional(),
          gapTrigger: z.string().optional(),
          answer: z.string(),
          evidence: z.string(),
          status: z.enum(["Pendente", "Respondido", "Validado", "Gap"]),
          reusable: z.boolean(),
          global: z.boolean().optional(),
          client: z.string().optional(),
        }).passthrough()),
        workshops: z.array(z.object({
          id: z.string(),
          module: z.string(),
          fronts: z.array(z.string()).optional(),
          scopeItemCodes: z.array(z.string()).optional(),
          title: z.string(),
          date: z.string(),
          durationMinutes: z.number().optional(),
          roles: z.array(z.string()).optional(),
          script: z.string().optional(),
          participants: z.string(),
          transcript: z.string(),
          decisions: z.string(),
          minutes: z.string().optional(),
          completed: z.boolean().optional(),
        }).passthrough()),
        gaps: z.array(z.object({
          id: z.string(),
          module: z.string(),
          scopeItemCode: z.string(),
          title: z.string(),
          description: z.string(),
          impact: z.string(),
          severity: z.enum(["Baixo", "Medio", "Alto", "Critico"]),
          status: z.enum(["Aberto", "Em analise", "Aprovado", "Rejeitado"]),
          resolutionType: z.string().optional(),
          resolution: z.string().optional(),
          effort: z.string().optional(),
          assignedTo: z.string().optional(),
          dueDate: z.string().optional(),
        }).passthrough()),
        configurations: z.array(z.object({
          id: z.string(),
          module: z.string(),
          scopeItemCode: z.string(),
          title: z.string(),
          description: z.string(),
          path: z.string(),
          owner: z.string(),
          priority: z.enum(["Baixa", "Normal", "Alta"]),
          status: z.enum(["Pendente", "Em andamento", "Concluido", "Bloqueado"]),
        })).optional(),
        dcdDraft: z.string(),
        updatedAt: z.string(),
      }),
    })).mutation(async ({ input }) => {
      if (input.projectId !== input.data.projectId) {
        badRequest("Projeto do TechMove invalido");
      }
      const project = await store.getProjectById(input.projectId);
      if (!project) badRequest("Projeto nao encontrado");
      return store.saveTechMoveData(input.projectId, input.data as TechMoveData);
    }),
  }),

  // ===== CONFIGURABLE LOOKUPS / CADASTROS =====
  settings: router({
    getLookups: protectedProcedure.query(() => store.getLookups()),

    addLookup: settingsProcedure.input(z.object({
      category: z.enum(['profiles', 'fronts', 'resourceStatuses', 'projectStatuses', 'absenceTypes', 'allocationTypes', 'allocationStatuses', 'contractTypes', 'dashboardCheckStatuses']),
      value: z.string().trim().min(1),
    })).mutation(({ input }) => {
      return store.addLookup(input.category, input.value);
    }),

    updateLookup: settingsProcedure.input(z.object({
      id: z.string(),
      value: z.string().trim().min(1),
      active: z.boolean(),
    })).mutation(({ input }) => {
      return store.updateLookup(input);
    }),

    deleteLookup: settingsProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
      return store.deleteLookup(input.id);
    }),
  }),

  // ===== DASHBOARD =====
  dashboard: router({
    stats: dashboardProcedure.query(async () => {
      const { resources, projects, phases, absences, allocations } = await store.getPlannerSnapshot();
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd }).filter(d => d.getDay() !== 0 && d.getDay() !== 6);

      const activeResources = resources.filter(r => r.status === 'Ativo');
      const activeProjects = projects.filter(p => p.status === 'Em andamento' || p.status === 'Em Andamento' || p.status === 'Em risco');

      // Calculate weekly hours
      let weeklyHours = 0;
      allocations.forEach(a => {
        const aStart = parseISO(a.startDate);
        const aEnd = parseISO(a.endDate);
        weekDays.forEach(day => {
          if (day >= aStart && day <= aEnd) {
            weeklyHours += a.hoursPerDay;
          }
        });
      });

      // Overallocated resources
      const overallocated = new Set<string>();
      const onLeave = new Set<string>();

      activeResources.forEach(resource => {
        weekDays.forEach(day => {
          let totalHours = 0;
          allocations.forEach(a => {
            if (a.resourceId === resource.id) {
              const aStart = parseISO(a.startDate);
              const aEnd = parseISO(a.endDate);
              if (day >= aStart && day <= aEnd) {
                totalHours += a.hoursPerDay;
              }
            }
          });
          if (totalHours > resource.dailyCapacity) {
            overallocated.add(resource.id);
          }
        });

        absences.forEach(abs => {
          if (!isBlockingAbsence(abs.type)) return;
          if (abs.resourceId === resource.id) {
            const absStart = parseISO(abs.startDate);
            const absEnd = parseISO(abs.endDate);
            weekDays.forEach(day => {
              if (day >= absStart && day <= absEnd) {
                onLeave.add(resource.id);
              }
            });
          }
        });
      });

      // Unallocated resources (active, not on leave, with zero hours this week)
      const unallocatedResources: { id: string; name: string }[] = [];
      activeResources.forEach(resource => {
        if (resource.skipAllocationCheck) return;
        if (onLeave.has(resource.id)) return;
        let hasAllocation = false;
        weekDays.forEach(day => {
          allocations.forEach(a => {
            if (a.resourceId === resource.id) {
              const aStart = parseISO(a.startDate);
              const aEnd = parseISO(a.endDate);
              if (day >= aStart && day <= aEnd) {
                hasAllocation = true;
              }
            }
          });
        });
        if (!hasAllocation) {
          unallocatedResources.push({ id: resource.id, name: resource.name });
        }
      });

      const projectsMissingFronts = buildProjectsMissingFronts(projects, allocations, resources);

      // Upcoming birthdays (next 30 days)
      const upcomingBirthdays: { resourceId: string; resourceName: string; date: string; daysUntil: number }[] = [];
      const todayMonth = getMonth(today);
      const todayDate = getDate(today);

      activeResources.forEach(resource => {
        if (!resource.birthDate) return;
        const bd = parseISO(resource.birthDate);
        const bdMonth = getMonth(bd);
        const bdDate = getDate(bd);

        // Calculate days until birthday this year
        const thisYearBirthday = new Date(today.getFullYear(), bdMonth, bdDate);
        let daysUntil = differenceInCalendarDays(thisYearBirthday, today);
        if (daysUntil < 0) {
          // Birthday already passed this year, calculate for next year
          const nextYearBirthday = new Date(today.getFullYear() + 1, bdMonth, bdDate);
          daysUntil = differenceInCalendarDays(nextYearBirthday, today);
        }

        if (daysUntil <= 30) {
          upcomingBirthdays.push({
            resourceId: resource.id,
            resourceName: resource.name,
            date: format(new Date(today.getFullYear(), bdMonth, bdDate), 'dd/MM'),
            daysUntil,
          });
        }
      });

      upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

      // Available resources
      const allocatedIds = new Set(allocations.map(a => a.resourceId));
      const available = activeResources.filter(r => !allocatedIds.has(r.id) && !onLeave.has(r.id));

      const resourceEndDateAlerts = buildResourceEndDateAlerts(activeResources, projects, allocations);

      // Projects by phase
      const projectsByPhase: Record<string, number> = { Prepare: 0, Explore: 0, Realize: 0, Deploy: 0, Run: 0 };
      phases.forEach(p => {
        if (projectsByPhase[p.phase] !== undefined) {
          projectsByPhase[p.phase]++;
        }
      });

      return {
        totalResources: resources.length,
        activeResources: activeResources.length,
        totalProjects: projects.length,
        activeProjects: activeProjects.length,
        weeklyAllocatedHours: weeklyHours,
        overallocatedResources: overallocated.size,
        availableResources: available.length,
        onLeaveResources: onLeave.size,
        projectsByPhase,
        unallocatedResources,
        projectsMissingFronts,
        resourceEndDateAlerts,
        upcomingBirthdays,
      };
    }),
  }),

  // ===== ACCESS MANAGEMENT =====
  access: router({
    list: adminProcedure.query(() => {
      return store.listAppUsers();
    }),

    getByEmail: protectedProcedure.input(z.object({ email: z.string() })).query(async ({ ctx, input }) => {
      if (ctx.appUser?.role !== "admin" && ctx.user.email !== input.email) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissao para consultar este usuario" });
      }
      return store.getAppUserByEmail(input.email);
    }),

    create: adminProcedure.input(z.object({
      name: z.string().trim().min(1),
      email: z.string().email(),
      role: z.enum(['admin', 'manager', 'technical_lead', 'consultant', 'viewer']),
      resourceId: z.string().default(''),
      teamFronts: z.array(z.string()).default([]),
      permissions: z.object({
        dashboard: z.boolean(),
        resources: z.boolean(),
        projects: z.boolean(),
        absences: z.boolean(),
        planner: z.boolean(),
        organogram: z.boolean(),
        techmove: z.boolean(),
        access: z.boolean(),
        settings: z.boolean(),
      }).optional(),
    })).mutation(async ({ input }) => {
      const existing = await store.getAppUserByEmail(input.email);
      if (existing) badRequest("Ja existe usuario com este e-mail");
      const permissions = input.permissions || DEFAULT_PERMISSIONS[input.role];
      return store.createAppUser({
        name: input.name,
        email: input.email,
        role: input.role as UserRole,
        permissions,
        resourceId: input.resourceId,
        teamFronts: input.teamFronts,
      });
    }),

    update: adminProcedure.input(z.object({
      id: z.string(),
      name: z.string().trim().min(1).optional(),
      email: z.string().email().optional(),
      role: z.enum(['admin', 'manager', 'technical_lead', 'consultant', 'viewer']).optional(),
      resourceId: z.string().optional(),
      teamFronts: z.array(z.string()).optional(),
      permissions: z.object({
        dashboard: z.boolean(),
        resources: z.boolean(),
        projects: z.boolean(),
        absences: z.boolean(),
        planner: z.boolean(),
        organogram: z.boolean(),
        techmove: z.boolean(),
        access: z.boolean(),
        settings: z.boolean(),
      }).optional(),
      active: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      if (input.email) {
        const existing = await store.getAppUserByEmail(input.email);
        if (existing && existing.id !== input.id) badRequest("Ja existe usuario com este e-mail");
      }
      return store.updateAppUser(input as Partial<AppUser> & { id: string });
    }),

    delete: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
      const users = await store.listAppUsers();
      const target = users.find(user => user.id === input.id);
      if (target?.email && target.email === ctx.user.email) badRequest("Nao e possivel excluir o proprio usuario");
      return store.deleteAppUser(input.id);
    }),
  }),
});
export type AppRouter = typeof appRouter;
