import { describe, expect, it } from "vitest";
import type { Project } from "../shared/types";
import { FIT_TO_STANDARD_STEPS, GP_CHECKLIST_CATALOG } from "./gpChecklistCatalog";
import {
  calculateChecklistProgress,
  createFitToStandardCycle,
  listFitToStandardCycles,
  listProjectChecklist,
  updateChecklistItem,
  updateFitToStandardStep,
} from "./gpChecklistStore";

function testProject(id: string): Project {
  return {
    id,
    name: "Projeto de teste",
    client: "Cliente",
    manager: "Gerente GP",
    status: "Planejado",
    startDate: "2035-01-01",
    endDate: "2035-12-31",
    fronts: ["FI"],
    notes: "",
  };
}

describe("Trilha do GP", () => {
  it("materializa o catálogo uma única vez por projeto", async () => {
    const project = testProject("gp-checklist-idempotent");
    const first = await listProjectChecklist(project);
    const second = await listProjectChecklist(project);

    expect(first).toHaveLength(GP_CHECKLIST_CATALOG.length);
    expect(second).toHaveLength(GP_CHECKLIST_CATALOG.length);
    expect(new Set(second.map(item => item.itemKey)).size).toBe(GP_CHECKLIST_CATALOG.length);
    expect(second.find(item => item.itemKey === "prepare-onboarding")?.responsible).toBe("Gerente GP");
  });

  it("calcula progresso sem considerar itens não aplicáveis", async () => {
    const project = testProject("gp-checklist-progress");
    const items = await listProjectChecklist(project);
    await updateChecklistItem(project.id, items[0].id, { status: "Concluído" });
    await updateChecklistItem(project.id, items[1].id, { status: "Não aplicável" });
    const updated = await listProjectChecklist(project);
    const progress = calculateChecklistProgress(updated);

    expect(progress.overall.total).toBe(GP_CHECKLIST_CATALOG.length - 1);
    expect(progress.overall.completed).toBe(1);
  });

  it("cria os seis passos e conclui um ciclo Fit-to-Standard", async () => {
    const projectId = "gp-fit-cycle";
    const cycle = await createFitToStandardCycle(projectId, "Order-to-Cash", "SD");
    expect(cycle.steps).toHaveLength(FIT_TO_STANDARD_STEPS.length);

    for (const step of cycle.steps) {
      await updateFitToStandardStep(projectId, step.id, { status: "Concluído" });
    }
    const cycles = await listFitToStandardCycles(projectId);
    expect(cycles[0].status).toBe("Concluído");
    expect(cycles[0].steps.every(step => step.status === "Concluído")).toBe(true);
  });
});
