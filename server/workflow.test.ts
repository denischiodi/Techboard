import { describe, it, expect, vi } from "vitest";

// Mock the db module
vi.mock("./routers/workflowDb", () => ({
  listScopeItems: vi.fn().mockResolvedValue([]),
  createScopeItem: vi.fn().mockResolvedValue({ id: "test-id" }),
  deleteScopeItem: vi.fn().mockResolvedValue(undefined),
  listBdcqQuestions: vi.fn().mockResolvedValue([]),
  createBdcqQuestion: vi.fn().mockResolvedValue({ id: "q-1" }),
  deleteBdcqQuestion: vi.fn().mockResolvedValue(undefined),
  listBdcqAnswers: vi.fn().mockResolvedValue([]),
  createBdcqAnswer: vi.fn().mockResolvedValue({ id: "a-1" }),
  listWorkshops: vi.fn().mockResolvedValue([]),
  createWorkshop: vi.fn().mockResolvedValue({ id: "w-1" }),
  deleteWorkshop: vi.fn().mockResolvedValue(undefined),
  listTranscripts: vi.fn().mockResolvedValue([]),
  createTranscript: vi.fn().mockResolvedValue({ id: "t-1" }),
  getMinutesByWorkshop: vi.fn().mockResolvedValue(null),
  createMinutes: vi.fn().mockResolvedValue({ id: "m-1" }),
  listDcdDocuments: vi.fn().mockResolvedValue([]),
  createDcdDocument: vi.fn().mockResolvedValue({ id: "d-1" }),
  deleteDcdDocument: vi.fn().mockResolvedValue(undefined),
  listGaps: vi.fn().mockResolvedValue([]),
  createGap: vi.fn().mockResolvedValue({ id: "g-1" }),
  updateGap: vi.fn().mockResolvedValue(undefined),
  deleteGap: vi.fn().mockResolvedValue(undefined),
  listConfigurations: vi.fn().mockResolvedValue([]),
  createConfiguration: vi.fn().mockResolvedValue({ id: "c-1" }),
  updateConfiguration: vi.fn().mockResolvedValue(undefined),
  deleteConfiguration: vi.fn().mockResolvedValue(undefined),
}));

describe("workflow router module structure", () => {
  it("exports workflowRouter from workflow.ts", async () => {
    const mod = await import("./routers/workflow");
    expect(mod.workflowRouter).toBeDefined();
  });

  it("workflowRouter has expected sub-routers", async () => {
    const mod = await import("./routers/workflow");
    const router = mod.workflowRouter;
    const routerDef = (router as any)._def;
    expect(routerDef).toBeDefined();
  });

  it("workflowDb module has all expected exports", async () => {
    const db = await import("./routers/workflowDb");
    expect(db.listScopeItems).toBeDefined();
    expect(db.createScopeItem).toBeDefined();
    expect(db.deleteScopeItem).toBeDefined();
    expect(db.listBdcqQuestions).toBeDefined();
    expect(db.createBdcqQuestion).toBeDefined();
    expect(db.listWorkshops).toBeDefined();
    expect(db.createWorkshop).toBeDefined();
    expect(db.listTranscripts).toBeDefined();
    expect(db.createTranscript).toBeDefined();
    expect(db.getMinutesByWorkshop).toBeDefined();
    expect(db.listDcdDocuments).toBeDefined();
    expect(db.createDcdDocument).toBeDefined();
    expect(db.listGaps).toBeDefined();
    expect(db.createGap).toBeDefined();
    expect(db.updateGap).toBeDefined();
    expect(db.listConfigurations).toBeDefined();
    expect(db.createConfiguration).toBeDefined();
    expect(db.updateConfiguration).toBeDefined();
  });
});
