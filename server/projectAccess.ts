import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { AppUser, ProjectCapabilities, ProjectMemberProfile, ProjectMembership } from "../shared/types";
import { getPgPool } from "./db";
import * as plannerStore from "./plannerStore";

const memoryMemberships: ProjectMembership[] = [];

export const PROJECT_PROFILE_CAPABILITIES: Record<ProjectMemberProfile, ProjectCapabilities> = {
  gp_internal: {
    viewProject: true, viewKanban: true, createActivity: true, editAssignedActivity: true,
    fillAssignedBdcq: true, executeAssignedTests: true, submitForApproval: true,
    approveAssigned: true, viewWorkflowArtifacts: true, configureGovernance: true,
    manageMembers: true, reopenApproved: true,
  },
  internal_team: {
    viewProject: true, viewKanban: true, createActivity: true, editAssignedActivity: true,
    fillAssignedBdcq: true, executeAssignedTests: true, submitForApproval: true,
    approveAssigned: false, viewWorkflowArtifacts: true, configureGovernance: false,
    manageMembers: false, reopenApproved: false,
  },
  key_user: {
    viewProject: true, viewKanban: true, createActivity: false, editAssignedActivity: true,
    fillAssignedBdcq: true, executeAssignedTests: true, submitForApproval: false,
    approveAssigned: false, viewWorkflowArtifacts: false, configureGovernance: false,
    manageMembers: false, reopenApproved: false,
  },
  approver: {
    viewProject: true, viewKanban: true, createActivity: false, editAssignedActivity: true,
    fillAssignedBdcq: false, executeAssignedTests: false, submitForApproval: false,
    approveAssigned: true, viewWorkflowArtifacts: true, configureGovernance: false,
    manageMembers: false, reopenApproved: false,
  },
  reader: {
    viewProject: true, viewKanban: false, createActivity: false, editAssignedActivity: false,
    fillAssignedBdcq: false, executeAssignedTests: false, submitForApproval: false,
    approveAssigned: false, viewWorkflowArtifacts: true, configureGovernance: false,
    manageMembers: false, reopenApproved: false,
  },
};

function id() {
  return `pm_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function asMembership(row: any): ProjectMembership {
  const profile = row.profile as ProjectMemberProfile;
  const overrides = (row.capabilityOverrides || {}) as Partial<ProjectCapabilities>;
  const capabilities = { ...PROJECT_PROFILE_CAPABILITIES[profile], ...overrides };
  return {
    id: row.id, projectId: row.projectId, appUserId: row.appUserId, profile,
    jobTitle: row.jobTitle || "", capabilityOverrides: overrides, active: Boolean(row.active),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
    user: row.userId ? { id: row.userId, name: row.userName, email: row.userEmail, active: Boolean(row.userActive) } : undefined,
    project: row.joinedProjectId ? { id: row.joinedProjectId, name: row.projectName, client: row.projectClient, status: row.projectStatus } : undefined,
    capabilities,
  };
}

export async function listProjectMemberships(projectId?: string, appUserId?: string) {
  const db = getPgPool();
  if (!db) return memoryMemberships.filter(item => (!projectId || item.projectId === projectId) && (!appUserId || item.appUserId === appUserId));
  const where: string[] = [];
  const params: string[] = [];
  if (projectId) { params.push(projectId); where.push(`m."projectId" = $${params.length}`); }
  if (appUserId) { params.push(appUserId); where.push(`m."appUserId" = $${params.length}`); }
  const result = await db.query(`SELECT m.*, u."id" AS "userId", u."name" AS "userName", u."email" AS "userEmail", u."active" AS "userActive",
    p."id" AS "joinedProjectId", p."name" AS "projectName", p."client" AS "projectClient", p."status" AS "projectStatus"
    FROM "project_memberships" m JOIN "app_users" u ON u."id" = m."appUserId" JOIN "projects" p ON p."id" = m."projectId"
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY p."name", u."name"`, params);
  return result.rows.map(asMembership);
}

export async function getProjectMembership(projectId: string, appUserId: string) {
  return (await listProjectMemberships(projectId, appUserId))[0] || null;
}

export async function upsertProjectMembership(input: {
  projectId: string; appUserId: string; profile: ProjectMemberProfile; jobTitle?: string;
  capabilityOverrides?: Partial<ProjectCapabilities>; active?: boolean;
}) {
  const [project, users] = await Promise.all([plannerStore.getProjectById(input.projectId), plannerStore.listAppUsers()]);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
  if (!users.some(user => user.id === input.appUserId)) throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário não encontrado" });
  const db = getPgPool();
  if (!db) {
    const existing = memoryMemberships.find(item => item.projectId === input.projectId && item.appUserId === input.appUserId);
    const now = new Date().toISOString();
    if (existing) Object.assign(existing, input, { active: input.active ?? true, updatedAt: now, capabilities: { ...PROJECT_PROFILE_CAPABILITIES[input.profile], ...(input.capabilityOverrides || {}) } });
    else memoryMemberships.push({ id: id(), ...input, jobTitle: input.jobTitle || "", capabilityOverrides: input.capabilityOverrides || {}, active: input.active ?? true, createdAt: now, updatedAt: now, capabilities: { ...PROJECT_PROFILE_CAPABILITIES[input.profile], ...(input.capabilityOverrides || {}) } });
    return getProjectMembership(input.projectId, input.appUserId);
  }
  const result = await db.query(`INSERT INTO "project_memberships" ("id","projectId","appUserId","profile","jobTitle","capabilityOverrides","active")
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT ("projectId","appUserId") DO UPDATE SET
    "profile"=EXCLUDED."profile", "jobTitle"=EXCLUDED."jobTitle", "capabilityOverrides"=EXCLUDED."capabilityOverrides", "active"=EXCLUDED."active", "updatedAt"=now() RETURNING *`,
    [id(), input.projectId, input.appUserId, input.profile, input.jobTitle || "", JSON.stringify(input.capabilityOverrides || {}), input.active ?? true]);
  return asMembership(result.rows[0]);
}

export async function deactivateProjectMembership(idValue: string) {
  const db = getPgPool();
  if (!db) {
    const current = memoryMemberships.find(item => item.id === idValue);
    if (current) current.active = false;
    return Boolean(current);
  }
  const result = await db.query('UPDATE "project_memberships" SET "active"=false, "updatedAt"=now() WHERE "id"=$1', [idValue]);
  return Boolean(result.rowCount);
}

export function hasCapability(membership: ProjectMembership | null | undefined, capability: keyof ProjectCapabilities) {
  return Boolean(membership?.active && membership.capabilities?.[capability]);
}

export async function assertProjectCapability(appUser: AppUser, projectId: string, capability: keyof ProjectCapabilities) {
  const project = await plannerStore.getProjectById(projectId);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
  if (appUser.role === "admin") return { project, membership: null };
  const membership = await getProjectMembership(projectId, appUser.id);
  if (hasCapability(membership, capability)) return { project, membership };

  // Compatibility during rollout: existing internal users keep legacy access until the project receives its first explicit member.
  const projectMemberships = await listProjectMemberships(projectId);
  if (projectMemberships.length === 0 && (appUser.role === "manager" || appUser.role === "technical_lead" || appUser.role === "consultant")) {
    return { project, membership: null };
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para esta ação neste projeto" });
}

export async function filterProjectsByMembership<T extends { id: string }>(projects: T[], appUser: AppUser) {
  if (appUser.role === "admin") return projects;
  const memberships = (await listProjectMemberships(undefined, appUser.id)).filter(item => item.active && item.capabilities?.viewProject);
  if (!memberships.length) return projects;
  const allowed = new Set(memberships.map(item => item.projectId));
  return projects.filter(project => allowed.has(project.id));
}
