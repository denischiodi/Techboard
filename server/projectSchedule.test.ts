import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as schedules from "./projectScheduleStore";
import type { ProjectScheduleView } from "../shared/projectSchedule";

function context(email: string | null): TrpcContext {
  const now = new Date();
  return {
    user: email
      ? {
          id: 1,
          openId: "schedule-test",
          email,
          name: "Teste",
          loginMethod: "test",
          role: "user",
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("visualização de cronogramas por projeto", () => {
  it("exige autenticação para ler e gravar", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(
      caller.projects.schedule.get({ projectId: "p1" })
    ).rejects.toThrow();
    await expect(
      caller.projects.schedule.save({
        projectId: "p1",
        fileName: "a.mpp",
        fileData: "eA==",
      })
    ).rejects.toThrow();
  });

  it("bloqueia gravações de perfis de consulta", async () => {
    const caller = appRouter.createCaller(
      context("pedro.silva@consultoria.com")
    );
    await expect(
      caller.projects.schedule.save({
        projectId: "p1",
        fileName: "a.mpp",
        fileData: "eA==",
      })
    ).rejects.toThrow();
  });

  it("retorna ausência de arquivo antigo sem inventar percentuais e rejeita MPP inválido", async () => {
    const caller = appRouter.createCaller(context("defechi@gmail.com"));
    await expect(
      caller.projects.schedule.get({ projectId: "p1" })
    ).resolves.toBeNull();
    await expect(
      caller.projects.schedule.get({ projectId: "schedule-missing-project" })
    ).rejects.toThrow(/encontrado/i);
    await expect(
      caller.projects.schedule.save({
        projectId: "p1",
        fileName: "a.mpp",
        fileData: "eA==",
      })
    ).rejects.toThrow(/MPP válido/i);
    await expect(
      caller.projects.schedule.get({ projectId: "p1" })
    ).resolves.toBeNull();
  });

  it("mantém cronogramas e indicadores isolados por projeto", async () => {
    const snapshot: ProjectScheduleView = {
      fileName: "teste.mpp",
      statusDate: null,
      summary: null,
      tasks: [],
    };
    await schedules.saveProjectSchedule(
      "schedule-test-a",
      snapshot,
      Buffer.from("a"),
      "u1"
    );
    await schedules.saveProjectSchedule(
      "schedule-test-b",
      { ...snapshot, fileName: "outro.mpp", statusDate: "2026-11-17" },
      Buffer.from("b"),
      "u1"
    );
    expect(
      (await schedules.getProjectSchedule("schedule-test-a"))?.statusDate
    ).toBeNull();
    expect(
      (await schedules.getProjectSchedule("schedule-test-b"))?.fileName
    ).toBe("outro.mpp");
    expect(
      await schedules.getProjectSchedule("schedule-test-absent")
    ).toBeNull();
  });
});
