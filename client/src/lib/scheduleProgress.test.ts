import { describe, expect, it } from "vitest";
import {
  expectedProgress,
  withExpectedProgress,
} from "@shared/scheduleProgress";
import type {
  ProjectScheduleView,
  ScheduleViewTask,
} from "@shared/projectSchedule";

describe("previsto em campos personalizados do Project", () => {
  it.each([
    ["% Esperado Previsto", " 80%", "80%"],
    ["% Esperado Previsto EMPRESA (Texto 1)", " 2.5", "2,5%"],
    ["% Esperado Previsto (Texto1)", "4,32", "4,32%"],
    ["% esperado previsto empresa (texto 1)", "0", "0%"],
    ["% Esperado Previsto EMPRESA (Texto 1)", "0.5", "0,5%"],
    ["% Esperado Previsto", "100%", "100%"],
  ])("reconhece %s com valor %s", (alias, value, expected) => {
    expect(expectedProgress({ [alias]: value })).toBe(expected);
  });

  it("não confunde linha de base, SPI, números sem unidade ou campos ausentes", () => {
    expect(
      expectedProgress({
        "% Esperado Linha Base (Texto 13)": "5.11",
        "% SPI Previsto (Número 18)": "0.7",
        "% Esperado Previsto (Número 5)": "2.5",
      })
    ).toBeNull();
    for (const value of ["", "N/A", "101", "-1", "1.000,5", "texto"])
      expect(expectedProgress({ "% Esperado Previsto": value })).toBeNull();
    expect(expectedProgress({})).toBeNull();
  });

  it("recupera resumo e tarefas de uma importação antiga sem alterar a fonte", () => {
    const task: ScheduleViewTask = {
      uid: 0,
      name: "Projeto",
      start: "2026-11-09",
      finish: "2027-05-31",
      level: 0,
      summary: true,
      complete: 3,
      workComplete: 1,
      expected: null,
      custom: { "% Esperado Previsto EMPRESA (Texto 1)": " 2.5" },
    };
    const old: ProjectScheduleView = {
      fileName: "teste.mpp",
      statusDate: "2026-11-16",
      summary: task,
      tasks: [{ ...task, uid: 1 }],
    };
    const recovered = withExpectedProgress(old);
    expect(recovered.summary?.expected).toBe("2,5%");
    expect(recovered.tasks[0].expected).toBe("2,5%");
    expect(old.summary?.expected).toBeNull();
    expect(recovered.statusDate).toBe("2026-11-16");
  });
});
