import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser, ProjectMembership } from "../shared/types";

const activities: any[] = [];
const memberships: ProjectMembership[] = [
  { id: "m-requester", projectId: "p1", appUserId: "requester", profile: "internal_team", jobTitle: "", capabilityOverrides: {}, active: true, createdAt: "", updatedAt: "", capabilities: { viewProject: true, viewKanban: true, createActivity: true, editAssignedActivity: true, fillAssignedBdcq: true, executeAssignedTests: true, submitForApproval: true, approveAssigned: false, viewWorkflowArtifacts: true, configureGovernance: false, manageMembers: false, reopenApproved: false }, user: { id: "requester", name: "Consultor", email: "c@x.com", active: true } },
  { id: "m-approver", projectId: "p1", appUserId: "approver", profile: "approver", jobTitle: "", capabilityOverrides: {}, active: true, createdAt: "", updatedAt: "", capabilities: { viewProject: true, viewKanban: true, createActivity: false, editAssignedActivity: true, fillAssignedBdcq: false, executeAssignedTests: false, submitForApproval: false, approveAssigned: true, viewWorkflowArtifacts: true, configureGovernance: false, manageMembers: false, reopenApproved: false }, user: { id: "approver", name: "Aprovador", email: "a@x.com", active: true } },
];

vi.mock("./db", () => ({ getPgPool: () => null }));
vi.mock("./projectAccess", () => ({
  listProjectMemberships: vi.fn(async () => memberships),
  getProjectMembership: vi.fn(async (_projectId: string, userId: string) => memberships.find(item => item.appUserId === userId) || null),
  assertProjectCapability: vi.fn(async () => ({})),
}));
vi.mock("./activityStore", () => ({
  getActivity: vi.fn(async (id: string) => ({ id, projectId: "p1", title: "Validar desenho", status: "Em validação", sourceType: "manual" })),
  upsertSourceActivity: vi.fn(async (input: any) => { const current = { id: `activity-${input.sourceKey}`, ...input, participantUserIds: input.participantUserIds || [], checklist: [] }; activities.push(current); return current; }),
  listActivities: vi.fn(async () => activities),
  updateActivity: vi.fn(async (id: string, data: any) => { const item = activities.find(current => current.id === id); if (item) Object.assign(item, data); return item; }),
  addHistory: vi.fn(async () => undefined),
  findBySource: vi.fn(async (_sourceType: string, sourceKey: string) => activities.find(item => item.sourceKey === sourceKey) || null),
  createNotifications: vi.fn(async () => []),
}));
vi.mock("./activityMailer", () => ({ flushActivityEmailOutbox: vi.fn(async () => undefined) }));

import {
  decide,
  getGovernanceReadiness,
  isEntityLocked,
  reopen,
  setGovernanceConfirmation,
  submitForApproval,
  upsertPolicy,
} from "./approvalStore";

const requester = { id: "requester", name: "Consultor", email: "c@x.com", role: "consultant", active: true, permissions: {} } as AppUser;
const approver = { id: "approver", name: "Aprovador", email: "a@x.com", role: "viewer", active: true, permissions: {} } as AppUser;

describe("approval workflow", () => {
  beforeEach(() => { activities.splice(0); vi.clearAllMocks(); });

  it("cria pendência e aprova por qualquer um", async () => {
    const round = await submitForApproval({ projectId: "p1", entityType: "activity", entityId: `act-${Date.now()}`, requestedBy: requester, approverMembershipIds: ["m-approver"], quorum: "any" });
    expect(round?.status).toBe("pending");
    const completed = await decide(round!.id, approver, "approved", "De acordo");
    expect(completed?.status).toBe("approved");
    expect(await isEntityLocked("activity", round!.entityId)).toBe(true);
  });

  it("exige comentário para reprovar", async () => {
    const round = await submitForApproval({ projectId: "p1", entityType: "activity", entityId: `reject-${Date.now()}`, requestedBy: requester, approverMembershipIds: ["m-approver"] });
    await expect(decide(round!.id, approver, "rejected", "")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await decide(round!.id, approver, "rejected", "Corrigir evidência"))?.status).toBe("rejected");
  });

  it("reabre versão aprovada somente com justificativa", async () => {
    const round = await submitForApproval({ projectId: "p1", entityType: "activity", entityId: `reopen-${Date.now()}`, requestedBy: requester, approverMembershipIds: ["m-approver"] });
    await decide(round!.id, approver, "approved", "Ok");
    await expect(reopen(round!.id, requester, "")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(reopen(round!.id, requester, "Mudança de escopo")).resolves.toMatchObject({ nextVersion: 2 });
  });
});

describe("governance readiness", () => {
  it("exige confirmação explícita e permite reabertura", async () => {
    const projectId = "project-governance-ready";
    expect((await getGovernanceReadiness(projectId)).percent).toBe(0);
    expect(await setGovernanceConfirmation(projectId, requester, true)).toMatchObject({ confirmed: true, percent: 100 });
    expect(await setGovernanceConfirmation(projectId, requester, false)).toMatchObject({ confirmed: false, percent: 0 });
  });

  it("bloqueia confirmação quando uma política habilitada não possui aprovador", async () => {
    const projectId = "project-governance-invalid";
    await upsertPolicy({ projectId, entityType: "dcd", enabled: true, quorum: "any", minimumApprovals: 1, approverMembershipIds: [] });
    const readiness = await getGovernanceReadiness(projectId);
    expect(readiness.readyToConfirm).toBe(false);
    expect(readiness.pending).toHaveLength(1);
    await expect(setGovernanceConfirmation(projectId, requester, true)).rejects.toThrow("sem aprovadores ou quórum válido");
  });
});
