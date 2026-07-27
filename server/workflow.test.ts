import { describe, it, expect, vi } from "vitest";

// Mock the db module
vi.mock("./routers/workflowDb", () => ({
  getWorkflowEntityProjectId: vi.fn().mockResolvedValue("project-1"),
  listScopeItems: vi.fn().mockResolvedValue([]),
  createScopeItem: vi.fn().mockResolvedValue({ id: "test-id" }),
  updateScopeItem: vi.fn().mockResolvedValue(undefined),
  deleteScopeItem: vi.fn().mockResolvedValue(undefined),
  listBdcqQuestions: vi.fn().mockResolvedValue([]),
  createBdcqQuestion: vi.fn().mockResolvedValue({ id: "q-1" }),
  updateBdcqQuestion: vi.fn().mockResolvedValue(undefined),
  listBdcqTemplateLibrary: vi.fn().mockResolvedValue([]),
  createBdcqTemplate: vi.fn().mockResolvedValue({ id: "template-1" }),
  updateBdcqTemplate: vi.fn().mockResolvedValue(undefined),
  deleteBdcqTemplate: vi.fn().mockResolvedValue(undefined),
  deleteBdcqQuestion: vi.fn().mockResolvedValue(undefined),
  listBdcqAnswers: vi.fn().mockResolvedValue([]),
  createBdcqAnswer: vi.fn().mockResolvedValue({ id: "a-1" }),
  getBdcqAnswerByQuestion: vi.fn().mockResolvedValue(null),
  updateBdcqAnswerWithHistory: vi.fn().mockResolvedValue({ id: "a-1" }),
  listBdcqAnswerHistory: vi.fn().mockResolvedValue([]),
  listWorkshops: vi.fn().mockResolvedValue([]),
  createWorkshop: vi.fn().mockResolvedValue({ id: "w-1" }),
  updateWorkshop: vi.fn().mockResolvedValue(undefined),
  deleteWorkshop: vi.fn().mockResolvedValue(undefined),
  listWorkshopTemplates: vi.fn().mockResolvedValue([]),
  createWorkshopTemplate: vi.fn().mockResolvedValue({ id: "wt-1" }),
  updateWorkshopTemplate: vi.fn().mockResolvedValue(undefined),
  deleteWorkshopTemplate: vi.fn().mockResolvedValue(undefined),
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
  listConfigurationTemplates: vi.fn().mockResolvedValue([]),
  createConfigurationTemplate: vi.fn().mockResolvedValue({ id: "ct-1" }),
  updateConfigurationTemplate: vi.fn().mockResolvedValue(undefined),
  deleteConfigurationTemplate: vi.fn().mockResolvedValue(undefined),
  listWorkflowPrompts: vi.fn().mockResolvedValue([]),
  getWorkflowPrompt: vi.fn().mockResolvedValue(null),
  upsertWorkflowPrompt: vi.fn().mockResolvedValue({ key: "dcd_generation" }),
  deleteWorkflowPrompt: vi.fn().mockResolvedValue(undefined),
  createWorkflowAudit: vi.fn().mockResolvedValue(undefined),
  listWorkflowAudit: vi.fn().mockResolvedValue([]),
  bulkUpdateDcdDocuments: vi.fn().mockResolvedValue(0),
  bulkUpdateGaps: vi.fn().mockResolvedValue(0),
  bulkUpdateConfigurations: vi.fn().mockResolvedValue(0),
  listWorkflowTestCases: vi.fn().mockResolvedValue([]),
  getWorkflowTestCaseById: vi.fn().mockResolvedValue({
    id: "test-case-1",
    projectId: "project-1",
    responsible: "Ana Costa",
  }),
  createWorkflowTestCase: vi.fn().mockResolvedValue({ id: "test-1" }),
  updateWorkflowTestCase: vi.fn().mockResolvedValue(undefined),
  deleteWorkflowTestCase: vi.fn().mockResolvedValue(undefined),
  bulkUpdateWorkflowTestCases: vi.fn().mockResolvedValue(0),
  listWorkflowTestSteps: vi.fn().mockResolvedValue([]),
  createWorkflowTestStep: vi.fn().mockResolvedValue({ id: "step-1" }),
}));

vi.mock("./workflowAccess", () => ({
  assertWorkflowProjectAccess: vi.fn().mockResolvedValue({ id: "project-1" }),
  listWorkflowProjects: vi.fn().mockResolvedValue([]),
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
    expect(db.listBdcqTemplateLibrary).toBeDefined();
    expect(db.updateBdcqAnswerWithHistory).toBeDefined();
    expect(db.listBdcqAnswerHistory).toBeDefined();
    expect(db.listWorkshops).toBeDefined();
    expect(db.createWorkshop).toBeDefined();
    expect(db.listWorkshopTemplates).toBeDefined();
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
    expect(db.listConfigurationTemplates).toBeDefined();
    expect(db.listWorkflowTestCases).toBeDefined();
    expect(db.createWorkflowTestCase).toBeDefined();
    expect(db.updateWorkflowTestCase).toBeDefined();
    expect(db.listWorkflowPrompts).toBeDefined();
    expect(db.getWorkflowPrompt).toBeDefined();
    expect(db.upsertWorkflowPrompt).toBeDefined();
    expect(db.deleteWorkflowPrompt).toBeDefined();
  });

  it("resolves an E2E step through testCaseId when listing and creating", async () => {
    const db = await import("./routers/workflowDb");
    const { workflowRouter } = await import("./routers/workflow");
    const caller = workflowRouter.createCaller({
      user: {
        id: 1,
        openId: "test-user",
        name: "Ana Costa",
        email: "ana.costa@consultoria.com",
      },
    } as any);

    await caller.tests.steps.list({ testCaseId: "test-case-1" });
    await caller.tests.steps.create({
      testCaseId: "test-case-1",
      position: 1,
      title: "Criar pedido",
    });

    expect(db.getWorkflowEntityProjectId).toHaveBeenCalledWith(
      "workflow_test_cases",
      "test-case-1"
    );
    expect(db.listWorkflowTestSteps).toHaveBeenCalledWith("test-case-1");
    expect(db.createWorkflowTestStep).toHaveBeenCalledWith(
      expect.objectContaining({
        testCaseId: "test-case-1",
        title: "Criar pedido",
      })
    );
  });

  it("applies a custom BDCQ template to matching scope items", async () => {
    const db = await import("./routers/workflowDb");
    vi.mocked(db.listBdcqQuestions).mockResolvedValueOnce([]);
    vi.mocked(db.listScopeItems).mockResolvedValueOnce([
      {
        id: "scope-mm",
        projectId: "project-1",
        code: "J45",
        name: "Compras",
        module: "MM",
      } as any,
    ]);
    vi.mocked(db.listBdcqTemplateLibrary).mockResolvedValueOnce([
      {
        id: "template-1",
        question: "Como aprovar compras?",
        category: "Aprovação",
        modules: ["MM"],
        scopeItemKeys: ["J45"],
        active: 1,
      } as any,
    ]);
    const create = vi.mocked(db.createBdcqQuestion);
    create.mockClear();
    const { ensureBdcqTemplates } = await import("./routers/workflow");

    await ensureBdcqTemplates("project-1", ["MM"]);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        templateId: "template-1",
        module: "MM",
        scopeItemIds: ["scope-mm"],
        question: "Como aprovar compras?",
      })
    );
  });

  it("does not apply scoped BDCQ templates without a matching active scope item", async () => {
    const db = await import("./routers/workflowDb");
    vi.mocked(db.listBdcqQuestions).mockResolvedValueOnce([]);
    vi.mocked(db.listScopeItems).mockResolvedValueOnce([
      {
        id: "scope-match",
        projectId: "project-1",
        code: "SCOPE-MATCH",
        name: "Escopo correspondente",
        module: "ZZ",
        active: 1,
      } as any,
      {
        id: "scope-inactive",
        projectId: "project-1",
        code: "SCOPE-INACTIVE",
        name: "Escopo inativo",
        module: "ZZ",
        active: 0,
      } as any,
    ]);
    vi.mocked(db.listBdcqTemplateLibrary).mockResolvedValueOnce([
      {
        id: "template-match",
        question: "Pergunta correspondente",
        category: "Escopo",
        modules: ["ZZ"],
        scopeItemKeys: ["SCOPE-MATCH"],
        active: 1,
      } as any,
      {
        id: "template-other",
        question: "Pergunta de outro escopo",
        category: "Escopo",
        modules: ["ZZ"],
        scopeItemKeys: ["SCOPE-OTHER"],
        active: 1,
      } as any,
      {
        id: "template-inactive-scope",
        question: "Pergunta de escopo inativo",
        category: "Escopo",
        modules: ["ZZ"],
        scopeItemKeys: ["SCOPE-INACTIVE"],
        active: 1,
      } as any,
    ]);
    const create = vi.mocked(db.createBdcqQuestion);
    create.mockClear();
    const { ensureBdcqTemplates } = await import("./routers/workflow");

    const result = await ensureBdcqTemplates("project-1", ["ZZ"]);

    expect(result.added).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "template-match",
        module: "ZZ",
        scopeItemIds: ["scope-match"],
      })
    );
  });

  it("applies an unscoped BDCQ template once for an imported module", async () => {
    const db = await import("./routers/workflowDb");
    vi.mocked(db.listBdcqQuestions).mockResolvedValueOnce([]);
    vi.mocked(db.listScopeItems).mockResolvedValueOnce([
      {
        id: "scope-zz",
        projectId: "project-1",
        code: "ZZ1",
        name: "Escopo ZZ",
        module: "ZZ",
        active: 1,
      } as any,
    ]);
    vi.mocked(db.listBdcqTemplateLibrary).mockResolvedValueOnce([
      {
        id: "template-general-zz",
        question: "Pergunta geral do módulo ZZ",
        category: "Geral",
        modules: ["ZZ"],
        scopeItemKeys: [],
        active: 1,
      } as any,
    ]);
    const create = vi.mocked(db.createBdcqQuestion);
    create.mockClear();
    const { ensureBdcqTemplates } = await import("./routers/workflow");

    const result = await ensureBdcqTemplates("project-1", ["ZZ"]);

    expect(result).toEqual({ added: 1, updated: 0 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "template-general-zz",
        module: "ZZ",
        scopeItemIds: [],
      })
    );
  });

  it("uses the edited catalog version for a Standard SAP BDCQ template", async () => {
    const db = await import("./routers/workflowDb");
    const { BDCQ_TEMPLATES } = await import("./workflowBdcqTemplates");
    const standard = BDCQ_TEMPLATES.find(
      template => template.scopeItemKeys.length && template.modules.length
    )!;
    vi.mocked(db.listBdcqQuestions).mockResolvedValueOnce([]);
    vi.mocked(db.listScopeItems).mockResolvedValueOnce([
      {
        id: "scope-standard",
        projectId: "project-1",
        code: standard.scopeItemKeys[0],
        name: "Escopo SAP",
        module: standard.modules[0],
        active: 1,
      } as any,
    ]);
    vi.mocked(db.listBdcqTemplateLibrary).mockResolvedValueOnce([
      {
        ...standard,
        question: "Pergunta Standard SAP ajustada pelo líder",
        questionOriginal: "Original question",
        sapId: "SAP-TEST",
        level: "L2",
        process: "Compras",
        sscuiReference: "SSCUI-100",
        area: "Suprimentos",
        topic: "Aprovação",
        topicDefinition: "Definição ajustada",
        solution: "Solução ajustada",
        source: "Standard SAP",
        sourceFile: "BDCQ.xlsx",
        sourceRelease: "2508",
        active: 1,
      } as any,
    ]);
    const create = vi.mocked(db.createBdcqQuestion);
    create.mockClear();
    const { ensureBdcqTemplates } = await import("./routers/workflow");

    await ensureBdcqTemplates("project-1", [standard.modules[0]]);

    const calls = create.mock.calls
      .map(([item]) => item)
      .filter(item => item.templateId === standard.id);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.objectContaining({
        question: "Pergunta Standard SAP ajustada pelo líder",
        questionOriginal: "Original question",
        sapId: "SAP-TEST",
        level: "L2",
        process: "Compras",
        sscuiReference: "SSCUI-100",
        area: "Suprimentos",
        topic: "Aprovação",
        topicDefinition: "Definição ajustada",
        solution: "Solução ajustada",
        source: "Standard SAP",
        sourceFile: "BDCQ.xlsx",
        sourceRelease: "2508",
        metadataInitialized: 1,
        scopeItemIds: ["scope-standard"],
      })
    );
  });

  it("updates scope links instead of duplicating an automatic BDCQ question", async () => {
    const db = await import("./routers/workflowDb");
    vi.mocked(db.listBdcqQuestions).mockResolvedValueOnce([
      {
        id: "question-existing",
        projectId: "project-1",
        templateId: "template-sync",
        module: "ZZ",
        question: "Pergunta sincronizada",
        scopeItemIds: ["scope-old"],
        isDefault: 1,
      } as any,
    ]);
    vi.mocked(db.listScopeItems).mockResolvedValueOnce([
      {
        id: "scope-old",
        projectId: "project-1",
        code: "SYNC-OLD",
        name: "Escopo antigo",
        module: "ZZ",
        active: 1,
      } as any,
      {
        id: "scope-new",
        projectId: "project-1",
        code: "SYNC-NEW",
        name: "Escopo novo",
        module: "ZZ",
        active: 1,
      } as any,
    ]);
    vi.mocked(db.listBdcqTemplateLibrary).mockResolvedValueOnce([
      {
        id: "template-sync",
        question: "Pergunta sincronizada",
        category: "Escopo",
        modules: ["ZZ"],
        scopeItemKeys: ["SYNC-OLD", "SYNC-NEW"],
        active: 1,
      } as any,
    ]);
    const create = vi.mocked(db.createBdcqQuestion);
    const update = vi.mocked(db.updateBdcqQuestion);
    create.mockClear();
    update.mockClear();
    const { ensureBdcqTemplates } = await import("./routers/workflow");

    const result = await ensureBdcqTemplates("project-1", ["ZZ"]);

    expect(result).toEqual({ added: 0, updated: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith("question-existing", {
      templateId: "template-sync",
      scopeItemIds: ["scope-old", "scope-new"],
    });
  });

  it("applies an admin configuration model to its project scope item", async () => {
    const db = await import("./routers/workflowDb");
    const plannerStore = await import("./plannerStore");
    vi.spyOn(plannerStore, "getProjectById").mockResolvedValueOnce({
      id: "project-1",
      fronts: ["MM"],
    } as any);
    vi.mocked(db.listScopeItems).mockResolvedValueOnce([
      {
        id: "scope-mm",
        projectId: "project-1",
        code: "J45",
        name: "Compras",
        module: "MM",
        active: 1,
      } as any,
    ]);
    vi.mocked(db.listConfigurationTemplates).mockResolvedValueOnce([
      {
        id: "ct-1",
        description: "Configurar estratégia de liberação",
        category: "Customizing",
        modules: ["MM"],
        scopeItemKeys: ["J45"],
        active: true,
      } as any,
    ]);
    vi.mocked(db.listConfigurations).mockResolvedValueOnce([]);
    const create = vi.mocked(db.createConfiguration);
    create.mockClear();
    const { applyConfigurationTemplates } = await import("./routers/workflow");

    const result = await applyConfigurationTemplates("project-1");

    expect(result.added).toBe(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        templateId: "ct-1",
        module: "MM",
        scopeItemIds: ["scope-mm"],
        source: "template",
      })
    );
  });

  it("applies an applicable workshop model once and resolves its scope items", async () => {
    const db = await import("./routers/workflowDb");
    const plannerStore = await import("./plannerStore");
    vi.spyOn(plannerStore, "getProjectById").mockResolvedValueOnce({
      id: "project-1",
      fronts: ["MM"],
    } as any);
    vi.mocked(db.listScopeItems).mockResolvedValueOnce([
      {
        id: "scope-mm",
        projectId: "project-1",
        code: "J45",
        name: "Compras",
        module: "MM",
        active: 1,
      } as any,
    ]);
    vi.mocked(db.listWorkshopTemplates).mockResolvedValueOnce([
      {
        id: "wt-1",
        title: "Fit-to-Standard de Compras",
        modules: ["MM"],
        projectIds: [],
        scopeItemKeys: ["J45"],
        agenda: ["Demonstrar processo"],
        requiredRoles: ["Key user de Compras"],
        active: true,
      } as any,
    ]);
    vi.mocked(db.listWorkshops).mockResolvedValueOnce([]);
    const create = vi.mocked(db.createWorkshop);
    create.mockClear();
    const { applyWorkshopTemplates } = await import("./routers/workflow");

    const result = await applyWorkshopTemplates("project-1", ["wt-1"]);

    expect(result.added).toBe(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        templateId: "wt-1",
        modules: ["MM"],
        scopeItemIds: ["scope-mm"],
        source: "template",
      })
    );
  });
});
