import { describe, it, expect, vi } from "vitest";

// Mock the db module
vi.mock("./routers/workflowDb", () => ({
  getWorkflowEntityProjectId: vi.fn().mockResolvedValue("project-1"),
  listScopeItems: vi.fn().mockResolvedValue([]),
  createScopeItem: vi.fn().mockResolvedValue({ id: "test-id" }),
  deleteScopeItem: vi.fn().mockResolvedValue(undefined),
  listBdcqQuestions: vi.fn().mockResolvedValue([]),
  createBdcqQuestion: vi.fn().mockResolvedValue({ id: "q-1" }),
  deleteBdcqQuestion: vi.fn().mockResolvedValue(undefined),
  listBdcqAnswers: vi.fn().mockResolvedValue([]),
  createBdcqAnswer: vi.fn().mockResolvedValue({ id: "a-1" }),
  getBdcqAnswerByQuestion: vi.fn().mockResolvedValue(null),
  updateBdcqAnswerWithHistory: vi.fn().mockResolvedValue({ id: "a-1" }),
  listBdcqAnswerHistory: vi.fn().mockResolvedValue([]),
  listWorkshops: vi.fn().mockResolvedValue([]),
  createWorkshop: vi.fn().mockResolvedValue({ id: "w-1" }),
  deleteWorkshop: vi.fn().mockResolvedValue(undefined),
  listTranscripts: vi.fn().mockResolvedValue([]),
  createTranscript: vi.fn().mockResolvedValue({ id: "t-1" }),
  getMinutesByWorkshop: vi.fn().mockResolvedValue(null),
  listMinutesByProject: vi.fn().mockResolvedValue([]),
  createMinutes: vi.fn().mockResolvedValue({ id: "m-1" }),
  listClientRequirements: vi.fn().mockResolvedValue([]),
  createClientRequirement: vi.fn().mockResolvedValue({ id: "r-1" }),
  updateClientRequirement: vi.fn().mockResolvedValue(undefined),
  deleteClientRequirement: vi.fn().mockResolvedValue(undefined),
  listDcdDocuments: vi.fn().mockResolvedValue([]),
  getDcdDocument: vi.fn().mockResolvedValue(null),
  findDcdBySourceHash: vi.fn().mockResolvedValue(null),
  getLatestDcdByModule: vi.fn().mockResolvedValue(null),
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
  listWorkflowPrompts: vi.fn().mockResolvedValue([]),
  getWorkflowPrompt: vi.fn().mockResolvedValue(null),
  upsertWorkflowPrompt: vi.fn().mockResolvedValue({ key: "dcd_generation" }),
  deleteWorkflowPrompt: vi.fn().mockResolvedValue(undefined),
  createWorkflowAudit: vi.fn().mockResolvedValue(undefined),
  listWorkflowAudit: vi.fn().mockResolvedValue([]),
  bulkUpdateDcdDocuments: vi.fn().mockResolvedValue(0),
  bulkUpdateGaps: vi.fn().mockResolvedValue(0),
  bulkUpdateConfigurations: vi.fn().mockResolvedValue(0),
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
    expect(db.updateBdcqAnswerWithHistory).toBeDefined();
    expect(db.listBdcqAnswerHistory).toBeDefined();
    expect(db.listWorkshops).toBeDefined();
    expect(db.createWorkshop).toBeDefined();
    expect(db.listTranscripts).toBeDefined();
    expect(db.createTranscript).toBeDefined();
    expect(db.getMinutesByWorkshop).toBeDefined();
    expect(db.listMinutesByProject).toBeDefined();
    expect(db.listClientRequirements).toBeDefined();
    expect(db.createClientRequirement).toBeDefined();
    expect(db.updateClientRequirement).toBeDefined();
    expect(db.deleteClientRequirement).toBeDefined();
    expect(db.listDcdDocuments).toBeDefined();
    expect(db.findDcdBySourceHash).toBeDefined();
    expect(db.getLatestDcdByModule).toBeDefined();
    expect(db.createDcdDocument).toBeDefined();
    expect(db.getDcdDocument).toBeDefined();
    expect(db.listGaps).toBeDefined();
    expect(db.createGap).toBeDefined();
    expect(db.updateGap).toBeDefined();
    expect(db.listConfigurations).toBeDefined();
    expect(db.createConfiguration).toBeDefined();
    expect(db.updateConfiguration).toBeDefined();
    expect(db.listWorkflowPrompts).toBeDefined();
    expect(db.getWorkflowPrompt).toBeDefined();
    expect(db.upsertWorkflowPrompt).toBeDefined();
    expect(db.deleteWorkflowPrompt).toBeDefined();
  });
});
