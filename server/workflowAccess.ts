import { TRPCError } from "@trpc/server";
import type { AppUser } from "../shared/types";
import * as store from "./plannerStore";

async function allowedResourceIds(appUser: AppUser) {
  const resources = await store.listResources();
  const ownId = appUser.resourceId || resources.find(resource => resource.email?.toLowerCase() === appUser.email.toLowerCase())?.id || "";
  if (appUser.role === "consultant") return new Set(ownId ? [ownId] : []);
  if (appUser.role === "technical_lead") {
    const fronts = new Set(appUser.teamFronts || []);
    return new Set(resources.filter(resource => resource.id === ownId || (resource.fronts || [resource.front]).some(front => fronts.has(front))).map(resource => resource.id));
  }
  return new Set<string>();
}

export async function assertWorkflowProjectAccess(appUser: AppUser | null | undefined, projectId: string, write = false) {
  const allocationScopedRole =
    appUser && ["consultant", "technical_lead"].includes(appUser.role);
  if (!appUser || (!appUser.permissions.projects && !allocationScopedRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar o Workflow" });
  }
  const project = await store.getProjectById(projectId);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
  if (write && ["consultant", "technical_lead", "viewer"].includes(appUser.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil permite apenas consulta" });
  }
  if (appUser.role === "admin" || appUser.role === "manager") return project;
  const resourceIds = await allowedResourceIds(appUser);
  const allocations = await store.listAllocations();
  if (!allocations.some(allocation => allocation.projectId === projectId && resourceIds.has(allocation.resourceId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar este projeto" });
  }
  return project;
}

export async function listWorkflowProjects(appUser: AppUser | null | undefined) {
  const allocationScopedRole = appUser && ["consultant", "technical_lead"].includes(appUser.role);
  if (!appUser || (!appUser.permissions.projects && !allocationScopedRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para acessar o Workflow" });
  }
  const projects = await store.listProjects();
  if (appUser.role === "admin" || appUser.role === "manager") return projects;
  const resourceIds = await allowedResourceIds(appUser);
  const allocations = await store.listAllocations();
  const projectIds = new Set(allocations.filter(allocation => resourceIds.has(allocation.resourceId)).map(allocation => allocation.projectId));
  return projects.filter(project => projectIds.has(project.id));
}
