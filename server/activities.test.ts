import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

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
    expect((await caller.activities.list()).some(item => item.id === created.id)).toBe(true);
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
