import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../shared/types";

vi.mock("./db", () => ({ getPgPool: () => null }));
vi.mock("./plannerStore", () => ({
  getProjectById: vi.fn(async (id: string) => id === "p1" ? { id, name: "Projeto", client: "Cliente", status: "Em andamento" } : null),
  listAppUsers: vi.fn(async () => [{ id: "u1", name: "Key User", email: "key@cliente.com", role: "viewer", active: true }]),
}));

import { assertProjectCapability, getProjectMembership, hasCapability, PROJECT_PROFILE_CAPABILITIES, upsertProjectMembership } from "./projectAccess";

const user = { id: "u1", name: "Key User", email: "key@cliente.com", role: "viewer", active: true, permissions: {} } as AppUser;

describe("project access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aplica perfil e ajustes individuais", async () => {
    const membership = await upsertProjectMembership({ projectId: "p1", appUserId: "u1", profile: "key_user", capabilityOverrides: { approveAssigned: true } });
    expect(membership?.capabilities?.fillAssignedBdcq).toBe(true);
    expect(membership?.capabilities?.approveAssigned).toBe(true);
    expect(hasCapability(membership, "manageMembers")).toBe(false);
  });

  it("nega capacidade não concedida no projeto", async () => {
    await upsertProjectMembership({ projectId: "p1", appUserId: "u1", profile: "key_user" });
    await expect(assertProjectCapability(user, "p1", "configureGovernance")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("mantém os padrões do GP interno", () => {
    expect(PROJECT_PROFILE_CAPABILITIES.gp_internal.reopenApproved).toBe(true);
    expect(PROJECT_PROFILE_CAPABILITIES.gp_internal.manageMembers).toBe(true);
  });
});
