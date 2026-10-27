import { describe, expect, it } from "vitest";
import { summarizeSchedule, type ScheduleTask } from "./scheduleImport";

const task = (
  uid: number,
  name: string,
  start: string,
  finish: string,
  extra: Partial<ScheduleTask> = {}
): ScheduleTask => ({
  uid,
  name,
  start: new Date(start),
  finish: new Date(finish),
  ...extra,
});

describe("importação do cronograma", () => {
  it("preserva fases paralelas, progresso, encerramento e datas sem deslocamento de fuso", () => {
    const result = summarizeSchedule(
      [
        task(1, "Projeto", "2026-05-04T08:00:00Z", "2026-12-14T18:00:00Z"),
        task(2, "PREPARE", "2026-05-04T00:00:00Z", "2026-06-08T10:00:00Z", {
          percentComplete: 99,
        }),
        task(3, "EXPLORE", "2026-05-26T14:00:00Z", "2026-08-27T08:51:00Z", {
          percentComplete: 100,
        }),
        task(
          4,
          "ENCERRAMENTO DO PROJETO",
          "2026-12-04T08:00:00Z",
          "2026-12-14T18:00:00Z"
        ),
      ],
      "Gestora"
    );
    expect(result.startDate).toBe("2026-05-04");
    expect(result.endDate).toBe("2026-12-14");
    expect(result.rows.map(row => row.phase)).toEqual([
      "Prepare",
      "Explore",
      "ENCERRAMENTO DO PROJETO",
    ]);
    expect(result.rows[0]).toMatchObject({
      responsible: "Gestora",
      completionPercent: 99,
      status: "Em andamento",
    });
    expect(result.rows[1].status).toBe("Concluído");
  });
  it("atravessa resumos únicos para encontrar fases personalizadas", () => {
    const result = summarizeSchedule([
      task(1, "Projeto", "2026-01-01", "2026-03-01", { outlineLevel: 1 }),
      task(2, "Onda 1", "2026-01-01", "2026-03-01", {
        outlineLevel: 2,
        parentUid: 1,
      }),
      task(3, "Análise", "2026-01-01", "2026-02-01", {
        outlineLevel: 3,
        parentUid: 2,
      }),
      task(4, "Entrega", "2026-02-02", "2026-03-01", {
        outlineLevel: 3,
        parentUid: 2,
      }),
    ]);
    expect(result.rows.map(row => row.phase)).toEqual(["Análise", "Entrega"]);
  });
  it("inclui subdivisões com a fase pai e preserva marcos de um dia", () => {
    const result = summarizeSchedule(
      [
        task(1, "DEPLOY", "2026-10-16", "2026-12-03"),
        task(2, "GO / NO GO", "2026-10-16", "2026-10-16", {
          parentUid: 1,
          percentComplete: 100,
        }),
        task(3, "HYPERCARE", "2026-11-04", "2026-12-03", { parentUid: 1 }),
        task(4, "Atividade interna", "2026-11-05", "2026-11-06", {
          parentUid: 3,
        }),
      ],
      "Gestora"
    );
    expect(result.phaseCount).toBe(1);
    expect(result.subdivisionCount).toBe(2);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[1]).toMatchObject({
      phase: "Deploy",
      notes: "GO / NO GO",
      startDate: "2026-10-16",
      endDate: "2026-10-16",
      completionPercent: 100,
      responsible: "Gestora",
    });
    expect(result.rows[2]).toMatchObject({
      phase: "Deploy",
      notes: "HYPERCARE",
    });
  });

  it("rejeita arquivos sem datas e fases com período invertido", () => {
    expect(() => summarizeSchedule([])).toThrow("datas válidas");
    expect(() =>
      summarizeSchedule([task(1, "Prepare", "2026-02-01", "2026-01-01")])
    ).toThrow("posterior");
  });
});
