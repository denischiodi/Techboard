import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import * as activityStore from "./activityStore";

function context(email: string): TrpcContext {
  return {
    user: {
      id: 99, openId: `test:${email}`, email, name: email, loginMethod: "test", role: "user",
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("kanban de atividades", () => {
  it("permite ao membro do projeto criar e acompanhar uma atividade", async () => {
    const caller = appRouter.createCaller(context("pedro.silva@consultoria.com"));
    const created = await caller.activities.create({
      scope: "project", projectId: "p1", title: "Validar cenário de integração", description: "Teste do kanban",
      priority: "Alta", assigneeUserId: "u3", participantUserIds: [], dueDate: "2035-06-15",
    });
    expect(created.creatorUserId).toBe("u3");
    expect(created.participantUserIds).toContain("u3");
    expect(created.stage).toBe("GERAL");
    expect(created.displayTitle).toBe(`${created.projectName} - GERAL - ${String(created.sequenceNumber).padStart(3, "0")} - Validar cenário de integração`);
    expect((await caller.activities.list()).some(item => item.id === created.id)).toBe(true);
  });

  it("numera de forma independente por projeto e etapa e preserva o número no upsert", async () => {
    const projectId = `tracking-${Date.now()}-${Math.random()}`;
    const base = { scope: "project" as const, projectId, description: "", priority: "Média" as const, creatorUserId: "u1" };
    const [first, second] = await Promise.all([
      activityStore.createActivity({ ...base, stage: "DCD", title: "Primeiro DCD" }),
      activityStore.createActivity({ ...base, stage: "DCD", title: "Segundo DCD" }),
    ]);
    const bdcq = await activityStore.createActivity({ ...base, stage: "BDCQ", title: "Primeiro BDCQ" });

    expect([first!.sequenceNumber, second!.sequenceNumber].sort((a, b) => a - b)).toEqual([1, 2]);
    expect(bdcq!.sequenceNumber).toBe(1);
    expect(bdcq!.trackingCode).toBe("Projeto - BDCQ - 001");

    const sourceKey = `${projectId}:test-case`;
    await activityStore.upsertSourceActivity({ ...base, title: "Teste automático", sourceType: "workflow_test", sourceKey });
    const automatic = await activityStore.findBySource("workflow_test", sourceKey);
    expect(automatic).toMatchObject({ stage: "TESTE", sequenceNumber: 1 });
    await activityStore.upsertSourceActivity({ ...base, title: "Teste automático atualizado", sourceType: "workflow_test", sourceKey });
    expect(await activityStore.findBySource("workflow_test", sourceKey)).toMatchObject({ stage: "TESTE", sequenceNumber: 1, title: "Teste automático atualizado" });
  });

  it("força cartões internos para GERAL e usa Operação interna no acompanhamento", async () => {
    const activity = await activityStore.createActivity({ scope: "internal", projectId: "ignorado", stage: "DCD", title: "Revisar capacidade", creatorUserId: "u1" });
    expect(activity).toMatchObject({ projectId: "", projectName: "Operação interna", stage: "GERAL" });
    expect(activity!.displayTitle).toContain("Operação interna - GERAL - ");
  });

  it("mostra para o admin uma atividade criada por outro usuário", async () => {
    const creator = appRouter.createCaller(context("pedro.silva@consultoria.com"));
    const created = await creator.activities.create({
      scope: "project", projectId: "p1", title: "Atividade visível para admin", description: "",
      priority: "Média", assigneeUserId: "u3", participantUserIds: [], dueDate: "",
    });
    const admin = appRouter.createCaller(context("defechi@gmail.com"));
    expect((await admin.activities.list()).some(item => item.id === created.id)).toBe(true);
  });

  it("importa novas atividades e atualiza atividades manuais pelo Excel", async () => {
    const caller = appRouter.createCaller(context("pedro.silva@consultoria.com"));
    const imported = await caller.activities.importExcel({ rows: [{
      rowNumber: 2, id: "", scope: "project", projectId: "p1", title: "Importada do Excel", description: "Carga inicial",
      status: "A fazer", priority: "Média", assigneeUserId: "u3", participantUserIds: ["u3"], dueDate: "2035-07-01",
    }] });
    expect(imported).toMatchObject({ created: 1, updated: 0, errors: [] });
    const activity = (await caller.activities.list()).find(item => item.title === "Importada do Excel");
    expect(activity).toBeTruthy();
    const updated = await caller.activities.importExcel({ rows: [{
      rowNumber: 2, id: activity!.id, scope: "project", projectId: "p1", title: "Importada e atualizada", description: "Carga revisada",
      status: "Em andamento", priority: "Alta", assigneeUserId: "u3", participantUserIds: ["u3"], dueDate: "2035-07-02",
    }] });
    expect(updated).toMatchObject({ created: 0, updated: 1, errors: [] });
    expect((await caller.activities.get({ id: activity!.id })).title).toBe("Importada e atualizada");
    const immutableStage = await caller.activities.importExcel({ rows: [{
      rowNumber: 2, id: activity!.id, scope: "project", projectId: "p1", stage: "DCD", title: "Tentativa de alterar etapa", description: "",
      status: "Em andamento", priority: "Alta", assigneeUserId: "u3", participantUserIds: ["u3"], dueDate: "2035-07-02",
    }] });
    expect(immutableStage).toMatchObject({ created: 0, updated: 0 });
    expect(immutableStage.errors[0]?.message).toMatch(/etapa não pode ser alterada/i);
  });

  it("bloqueia conclusão enquanto houver checklist obrigatório pendente", async () => {
    const caller = appRouter.createCaller(context("pedro.silva@consultoria.com"));
    const activity = await caller.activities.create({
      scope: "project", projectId: "p1", title: "Preparar evidências", description: "", priority: "Média",
      assigneeUserId: "u3", participantUserIds: [], dueDate: "",
    });
    const item = await caller.activities.checklistCreate({
      activityId: activity.id, description: "Anexar evidência", assigneeUserId: "u3", dueDate: "", required: true,
    });
    await expect(caller.activities.update({ id: activity.id, data: { status: "Concluída" } })).rejects.toThrow(/itens obrigatórios/i);
    await caller.activities.checklistUpdate({ activityId: activity.id, itemId: item.id, data: { completed: true } });
    const completed = await caller.activities.update({ id: activity.id, data: { status: "Concluída" } });
    expect(completed.status).toBe("Concluída");
  });

  it("desfaz a última alteração quando o item não sofreu mudança concorrente", async () => {
    const caller = appRouter.createCaller(context("pedro.silva@consultoria.com"));
    const activity = await caller.activities.create({
      scope: "project", projectId: "p1", title: "Revisar desenho", description: "", priority: "Média",
      assigneeUserId: "u3", participantUserIds: [], dueDate: "",
    });
    const changed = await caller.activities.update({
      id: activity.id,
      expectedUpdatedAt: activity.updatedAt,
      data: { status: "Em andamento", priority: "Alta" },
    });
    expect(changed).toMatchObject({ status: "Em andamento", priority: "Alta" });

    const restored = await caller.activities.undoLastUpdate({ id: activity.id });
    expect(restored).toMatchObject({ status: "A fazer", priority: "Média" });
    expect(restored?.history[0]).toMatchObject({ action: "UPDATE_UNDONE" });
  });

  it("dá ao líder técnico visão de tarefas de outros projetos sem edição automática", async () => {
    const admin = appRouter.createCaller(context("defechi@gmail.com"));
    const task = await admin.activities.create({
      scope: "project", projectId: "p1", title: "Atividade visível ao líder", description: "", priority: "Baixa",
      assigneeUserId: "u3", participantUserIds: [], dueDate: "",
    });
    const lead = appRouter.createCaller(context("joao.oliveira@consultoria.com"));
    expect((await lead.activities.list()).some(item => item.id === task.id)).toBe(true);
    await expect(lead.activities.update({ id: task.id, data: { priority: "Alta" } })).rejects.toThrow(/permissão/i);
    await lead.activities.join({ id: task.id });
    const updated = await lead.activities.update({ id: task.id, data: { priority: "Alta" } });
    expect(updated.priority).toBe("Alta");
  });
});
