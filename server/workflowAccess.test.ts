import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PERMISSIONS, type AppUser } from "../shared/types";

const getProjectById = vi.fn();
const listResources = vi.fn();
const listAllocations = vi.fn();

vi.mock("./plannerStore", () => ({ getProjectById, listResources, listAllocations }));

const user = (role: AppUser["role"], overrides: Partial<AppUser> = {}): AppUser => ({
  id: `user-${role}`, name: role, email: `${role}@example.com`, role,
  permissions: DEFAULT_PERMISSIONS[role], active: true, resourceId: "resource-1", teamFronts: [],
  ...overrides,
});

describe("workflow project authorization", () => {
  beforeEach(() => {
    getProjectById.mockResolvedValue({ id: "project-1" });
    listResources.mockResolvedValue([{ id: "resource-1", email: "consultant@example.com", front: "SD", fronts: ["SD"] }]);
    listAllocations.mockResolvedValue([{ projectId: "project-1", resourceId: "resource-1" }]);
  });

  it("allows managers to access any existing project", async () => {
    const { assertWorkflowProjectAccess } = await import("./workflowAccess");
    await expect(assertWorkflowProjectAccess(user("manager"), "project-1", true)).resolves.toMatchObject({ id: "project-1" });
  });

  it("allows allocated consultants to read the project", async () => {
    const { assertWorkflowProjectAccess } = await import("./workflowAccess");
    await expect(assertWorkflowProjectAccess(user("consultant"), "project-1")).resolves.toMatchObject({ id: "project-1" });
  });

  it("blocks write operations for read-only roles", async () => {
    const { assertWorkflowProjectAccess } = await import("./workflowAccess");
    await expect(assertWorkflowProjectAccess(user("consultant"), "project-1", true)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks users without a project allocation", async () => {
    listAllocations.mockResolvedValue([]);
    const { assertWorkflowProjectAccess } = await import("./workflowAccess");
    await expect(assertWorkflowProjectAccess(user("consultant"), "project-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
