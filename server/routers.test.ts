import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as store from "./plannerStore";

function createMockContext(role: "admin" | "user" = "admin", email = "defechi@gmail.com"): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email,
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("security", () => {
  it("blocks business routes when unauthenticated", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.resources.list()).rejects.toThrow();
  });

  it("blocks access management for non-admin users", async () => {
    const caller = appRouter.createCaller(createMockContext("user", "pedro.silva@consultoria.com"));
    await expect(caller.access.list()).rejects.toThrow();
  });

  it("blocks protected routes when the app user is inactive", async () => {
    const email = "inactive.security@example.com";
    const user = await store.createAppUser({
      name: "Inactive Security",
      email,
      role: "viewer",
    });
    await store.updateAppUser({ id: user.id, active: false });

    const caller = appRouter.createCaller(createMockContext("user", email));
    await expect(caller.dashboard.stats()).rejects.toThrow(/acesso ativo/i);
  });

  it("uses current app permissions instead of the JWT role", async () => {
    const caller = appRouter.createCaller(createMockContext("admin", "pedro.silva@consultoria.com"));
    await expect(caller.dashboard.stats()).rejects.toThrow(/sem permissao/i);
  });

  it("scopes consultant access to their own records and blocks writes", async () => {
    const caller = appRouter.createCaller(createMockContext("user", "pedro.silva@consultoria.com"));

    const resources = await caller.resources.list();
    expect(resources.map(resource => resource.id)).toEqual(["r1"]);

    const allocations = await caller.allocations.list();
    expect(allocations.length).toBeGreaterThan(0);
    expect(allocations.every(allocation => allocation.resourceId === "r1")).toBe(true);

    await expect(caller.allocations.create({
      resourceId: "r1",
      projectId: "p1",
      phaseId: "ph1",
      front: "MM",
      startDate: "2033-01-01",
      endDate: "2033-01-05",
      hoursPerDay: 4,
      allocationType: "Projeto",
      status: "Planejado",
      notes: "",
    })).rejects.toThrow(/consulta/i);
  });

  it("allows a technical lead to manage absences only for their team", async () => {
    const caller = appRouter.createCaller(createMockContext("user", "joao.oliveira@consultoria.com"));

    const resources = await caller.resources.list();
    const resourceIds = resources.map(resource => resource.id);
    expect(resourceIds).toContain("r3");
    expect(resourceIds).toContain("r7");
    expect(resourceIds).not.toContain("r1");

    const absence = await caller.absences.create({
      resourceId: "r7",
      type: "Treinamento",
      startDate: "2033-02-01",
      endDate: "2033-02-02",
      approved: true,
      notes: "Treinamento do time",
    });
    expect(absence.resourceId).toBe("r7");

    await expect(caller.absences.create({
      resourceId: "r1",
      type: "Treinamento",
      startDate: "2033-02-01",
      endDate: "2033-02-02",
      approved: true,
      notes: "Fora do time",
    })).rejects.toThrow(/Lider tecnico/i);
  });
});

describe("resources router", () => {
  it("lists resources with mock data", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const resources = await caller.resources.list();
    expect(resources.length).toBeGreaterThan(0);
    expect(resources[0]).toHaveProperty("name");
    expect(resources[0]).toHaveProperty("profile");
    expect(resources[0]).toHaveProperty("front");
  });

  it("creates a new resource", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const newResource = await caller.resources.create({
      name: "Teste Recurso",
      profile: "Funcional",
      front: "FI",
      dailyCapacity: 8,
      costPerHour: 100,
      status: "Ativo",
      notes: "Test",
    });
    expect(newResource.name).toBe("Teste Recurso");
    expect(newResource.id).toBeTruthy();
  });

  it("rejects duplicate resource names", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await caller.resources.create({
      name: "Duplicado Recurso Teste",
      profile: "Funcional",
      front: "FI",
      dailyCapacity: 8,
      status: "Ativo",
      notes: "",
    });

    await expect(caller.resources.create({
      name: "duplicado recurso teste",
      profile: "Funcional",
      front: "MM",
      dailyCapacity: 8,
      status: "Ativo",
      notes: "",
    })).rejects.toThrow(/colaborador/i);
  });

  it("does not delete a resource with allocations", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.resources.delete({ id: "r1" })).rejects.toThrow(/alocacoes/i);
  });
});

describe("projects router", () => {
  it("lists projects with mock data", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const projects = await caller.projects.list();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]).toHaveProperty("name");
    expect(projects[0]).toHaveProperty("client");
  });

  it("rejects duplicate project names", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await caller.projects.create({
      name: "Projeto Duplicado Teste",
      client: "Cliente Teste",
      manager: "Gerente Teste",
      status: "Planejado",
      startDate: "2031-01-01",
      endDate: "2031-01-31",
      fronts: ["FI"],
      notes: "",
    });

    await expect(caller.projects.create({
      name: "projeto duplicado teste",
      client: "Cliente Teste",
      manager: "Gerente Teste",
      status: "Planejado",
      startDate: "2031-02-01",
      endDate: "2031-02-28",
      fronts: ["MM"],
      notes: "",
    })).rejects.toThrow(/projeto/i);
  });

  it("rejects invalid project date ranges", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.projects.create({
      name: "Projeto Data Invalida Teste",
      client: "Cliente Teste",
      manager: "Gerente Teste",
      status: "Planejado",
      startDate: "2031-03-10",
      endDate: "2031-03-01",
      fronts: ["FI"],
      notes: "",
    })).rejects.toThrow(/data inicial/i);
  });
});

describe("phases router", () => {
  it("creates project milestones with valid completion", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const project = await caller.projects.create({
      name: "Projeto Marcos Teste",
      client: "Cliente Marcos",
      manager: "Gerente Marcos",
      status: "Planejado",
      startDate: "2034-01-01",
      endDate: "2034-03-31",
      fronts: ["FI"],
      notes: "",
    });

    const phase = await caller.phases.create({
      projectId: project.id,
      phase: "Explore",
      startDate: "2034-01-10",
      endDate: "2034-01-20",
      responsible: "Gerente Marcos",
      completionPercent: 50,
      status: "Em Andamento",
      notes: "Sprint 1",
    });

    expect(phase.projectId).toBe(project.id);
    expect(phase.phase).toBe("Explore");
    expect(phase.completionPercent).toBe(50);
  });

  it("rejects milestone completion outside 0 to 100", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.phases.create({
      projectId: "p1",
      phase: "Explore",
      startDate: "2034-02-01",
      endDate: "2034-02-10",
      responsible: "",
      completionPercent: 101,
      status: "Planejado",
      notes: "",
    })).rejects.toThrow(/entre 0 e 100/i);
  });

  it("does not delete a milestone linked to an allocation", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.phases.delete({ id: "ph1" })).rejects.toThrow(/alocacoes/i);
  });
});

describe("allocations router", () => {
  it("lists allocations with mock data", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const allocations = await caller.allocations.list();
    expect(allocations.length).toBeGreaterThan(0);
    expect(allocations[0]).toHaveProperty("resourceId");
    expect(allocations[0]).toHaveProperty("hoursPerDay");
  });

  it("creates a new allocation", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const newAllocation = await caller.allocations.create({
      resourceId: "r1",
      projectId: "p1",
      phaseId: "ph1",
      front: "MM",
      startDate: "2026-06-23",
      endDate: "2026-06-27",
      hoursPerDay: 4,
      allocationType: "Projeto",
      status: "Planejado",
      notes: "Test allocation",
    });
    expect(newAllocation.resourceId).toBe("r1");
    expect(newAllocation.hoursPerDay).toBe(4);
  });

  it("rejects invalid allocation date ranges", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.allocations.create({
      resourceId: "r1",
      projectId: "p1",
      phaseId: "ph1",
      front: "MM",
      startDate: "2026-06-27",
      endDate: "2026-06-23",
      hoursPerDay: 4,
      allocationType: "Projeto",
      status: "Planejado",
      notes: "Invalid allocation",
    })).rejects.toThrow(/data inicial/i);
  });

  it("rejects overlapping allocation for the same resource and project", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const resource = await caller.resources.create({
      name: "Recurso Alocacao Duplicada",
      profile: "Funcional",
      front: "FI",
      dailyCapacity: 8,
      status: "Ativo",
      notes: "",
    });
    const project = await caller.projects.create({
      name: "Projeto Alocacao Duplicada",
      client: "Cliente Teste",
      manager: "Gerente Teste",
      status: "Planejado",
      startDate: "2032-01-01",
      endDate: "2032-01-31",
      fronts: ["FI"],
      notes: "",
    });

    await caller.allocations.create({
      resourceId: resource.id,
      projectId: project.id,
      phaseId: "",
      front: "FI",
      startDate: "2032-01-10",
      endDate: "2032-01-20",
      hoursPerDay: 4,
      allocationType: "Projeto",
      status: "Planejado",
      notes: "",
    });

    await expect(caller.allocations.create({
      resourceId: resource.id,
      projectId: project.id,
      phaseId: "",
      front: "FI",
      startDate: "2032-01-15",
      endDate: "2032-01-25",
      hoursPerDay: 4,
      allocationType: "Projeto",
      status: "Planejado",
      notes: "",
    })).rejects.toThrow(/alocacao/i);
  });

  it("allows the same consultant on the same project when periods do not overlap", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const resource = await caller.resources.create({
      name: "Recurso Periodo Livre Teste",
      profile: "Funcional",
      front: "CO",
      fronts: ["CO"],
      dailyCapacity: 8,
      status: "Ativo",
      notes: "",
    });
    const project = await caller.projects.create({
      name: "Projeto Periodo Livre Teste",
      client: "Cliente Teste",
      manager: "Gerente Teste",
      status: "Planejado",
      startDate: "2035-01-01",
      endDate: "2035-03-31",
      fronts: ["CO"],
      notes: "",
    });

    await caller.allocations.create({
      resourceId: resource.id,
      projectId: project.id,
      phaseId: "",
      front: "CO",
      startDate: "2035-01-01",
      endDate: "2035-01-31",
      hoursPerDay: 8,
      allocationType: "Projeto",
      status: "Planejado",
      notes: "",
    });

    const secondAllocation = await caller.allocations.create({
      resourceId: resource.id,
      projectId: project.id,
      phaseId: "",
      front: "CO",
      startDate: "2035-02-01",
      endDate: "2035-02-28",
      hoursPerDay: 8,
      allocationType: "Projeto",
      status: "Planejado",
      notes: "",
    });

    expect(secondAllocation.startDate).toBe("2035-02-01");
  });

  it("allows allocation above daily capacity because overcapacity is only an alert", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const allocation = await caller.allocations.create({
      resourceId: "r1",
      projectId: "p1",
      phaseId: "",
      front: "MM",
      startDate: "2036-04-01",
      endDate: "2036-04-03",
      hoursPerDay: 10,
      allocationType: "Projeto",
      status: "Planejado",
      notes: "Hora extra autorizada",
    });

    expect(allocation.hoursPerDay).toBe(10);
  });
});

describe("dashboard router", () => {
  it("returns stats with correct structure", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.dashboard.stats();
    expect(stats).toHaveProperty("totalResources");
    expect(stats).toHaveProperty("activeResources");
    expect(stats).toHaveProperty("overallocatedResources");
    expect(stats).toHaveProperty("weeklyAllocatedHours");
    expect(stats).toHaveProperty("projectsByPhase");
    expect(stats.totalResources).toBeGreaterThan(0);
  });

  it("reports a project front gap when allocation ends before project end", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const resource = await caller.resources.create({
      name: "Gap Tester Allocation",
      profile: "Funcional",
      fronts: ["QA-GAP"],
      dailyCapacity: 8,
      status: "Ativo",
    });
    const project = await caller.projects.create({
      name: "Projeto Gap Allocation",
      client: "Cliente Gap",
      manager: "Gerente Gap",
      status: "Em andamento",
      startDate: "2030-01-01",
      endDate: "2030-01-31",
      fronts: ["QA-GAP"],
    });
    await caller.allocations.create({
      resourceId: resource.id,
      projectId: project.id,
      phaseId: "",
      front: "QA-GAP",
      startDate: "2030-01-01",
      endDate: "2030-01-10",
      hoursPerDay: 8,
      allocationType: "Projeto",
      status: "Confirmado",
      notes: "",
    });

    const stats = await caller.dashboard.stats();
    const alert = stats.projectsMissingFronts.find(item => item.projectId === project.id);
    expect(alert?.missingFronts).toContain("QA-GAP");
    expect(alert?.gaps).toContainEqual(expect.objectContaining({
      front: "QA-GAP",
      gapStart: "2030-01-11",
      gapEnd: "2030-01-31",
    }));
    expect(alert?.gaps[0]?.reason).toMatch(/Alocação termina/);
  });

  it("reports consultant end date impact on allocation and project front", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const resource = await caller.resources.create({
      name: "Gap Tester End Date",
      profile: "Funcional",
      fronts: ["QA-END"],
      dailyCapacity: 8,
      status: "Ativo",
      startDate: "2029-01-01",
      endDate: "2030-02-10",
    });
    const project = await caller.projects.create({
      name: "Projeto Gap End Date",
      client: "Cliente Gap",
      manager: "Gerente Gap",
      status: "Em andamento",
      startDate: "2030-02-01",
      endDate: "2030-02-28",
      fronts: ["QA-END"],
    });
    await caller.allocations.create({
      resourceId: resource.id,
      projectId: project.id,
      phaseId: "",
      front: "QA-END",
      startDate: "2030-02-01",
      endDate: "2030-02-28",
      hoursPerDay: 8,
      allocationType: "Projeto",
      status: "Confirmado",
      notes: "",
    });

    const stats = await caller.dashboard.stats();
    const projectAlert = stats.projectsMissingFronts.find(item => item.projectId === project.id);
    expect(projectAlert?.gaps).toContainEqual(expect.objectContaining({
      front: "QA-END",
      gapStart: "2030-02-11",
      gapEnd: "2030-02-28",
    }));
    expect(projectAlert?.gaps[0]?.reason).toMatch(/sai da consultoria/);

    const resourceAlert = stats.resourceEndDateAlerts.find(item => item.resourceId === resource.id);
    expect(resourceAlert?.affectedProjects).toContainEqual(expect.objectContaining({
      projectId: project.id,
      front: "QA-END",
      impactStart: "2030-02-11",
      impactEnd: "2030-02-28",
    }));
  });
});

describe("absences router", () => {
  it("lists absences with mock data", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const absences = await caller.absences.list();
    expect(absences.length).toBeGreaterThan(0);
    expect(absences[0]).toHaveProperty("resourceId");
    expect(absences[0]).toHaveProperty("type");
  });

  it("allows vacation before one year as an operational exception", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const resource = await caller.resources.create({
      name: "Recurso Ferias Nao Liberadas Teste",
      profile: "Funcional",
      front: "FI",
      dailyCapacity: 8,
      status: "Ativo",
      contractType: "CLT",
      startDate: "2026-01-01",
      vacationDaysEntitled: 30,
      notes: "",
    });

    const absence = await caller.absences.create({
      resourceId: resource.id,
      type: "Férias",
      startDate: "2026-07-10",
      endDate: "2026-07-15",
      approved: true,
      notes: "",
    });

    expect(absence.resourceId).toBe(resource.id);
    expect(absence.startDate).toBe("2026-07-10");
  });

  it("stores sold vacation days as a one-day balance adjustment", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const resource = await caller.resources.create({
      name: "Recurso Dias Vendidos Teste",
      profile: "Funcional",
      front: "FI",
      dailyCapacity: 8,
      status: "Ativo",
      contractType: "CLT",
      startDate: "2024-07-01",
      vacationDaysEntitled: 30,
      notes: "",
    });

    const absence = await caller.absences.create({
      resourceId: resource.id,
      type: "Dias vendidos",
      startDate: "2026-07-10",
      endDate: "2026-07-20",
      daysCount: 10,
      approved: true,
      notes: "Venda de 10 dias",
    });

    expect(absence.startDate).toBe("2026-07-10");
    expect(absence.endDate).toBe("2026-07-10");
    expect(absence.daysCount).toBe(10);

    const [updatedResource] = (await caller.resources.list()).filter(item => item.id === resource.id);
    expect(updatedResource.vacationBalance).toBe(20);
  });

  it("allows sold vacation days above balance as an operational exception", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const resource = await caller.resources.create({
      name: "Recurso Dias Vendidos Sem Saldo Teste",
      profile: "Funcional",
      front: "FI",
      dailyCapacity: 8,
      status: "Ativo",
      contractType: "CLT",
      startDate: "2024-07-01",
      vacationDaysEntitled: 5,
      notes: "",
    });

    const absence = await caller.absences.create({
      resourceId: resource.id,
      type: "Dias vendidos",
      startDate: "2026-07-10",
      endDate: "2026-07-10",
      daysCount: 6,
      approved: true,
      notes: "",
    });

    expect(absence.daysCount).toBe(6);
    const [updatedResource] = (await caller.resources.list()).filter(item => item.id === resource.id);
    expect(updatedResource.vacationBalance).toBe(-1);
  });
});
