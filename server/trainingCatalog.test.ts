import { describe, expect, it } from "vitest";
import { TRAINING_CATALOG, TRAINING_COVERAGE } from "./trainingCatalog";

describe("training catalog", () => {
  it("covers the planned training areas and the functional consultant manual", () => {
    expect(TRAINING_CATALOG).toHaveLength(10);
    expect(TRAINING_CATALOG.map(course => course.category)).toEqual(
      expect.arrayContaining([
        "Portal Tech",
        "TechBoard",
        "TechLead",
        "TechMove",
        "TechTask",
        "Administração",
        "Fluxos",
        "Ajuda",
        "Educação",
      ])
    );
  });

  it("uses unique stable identifiers and complete lesson metadata", () => {
    const courseIds = TRAINING_CATALOG.map(course => course.id);
    const moduleIds = TRAINING_CATALOG.flatMap(course =>
      course.modules.map(module => module.id)
    );
    const lessons = TRAINING_CATALOG.flatMap(course =>
      course.modules.flatMap(module => module.lessons)
    );
    expect(new Set(courseIds).size).toBe(courseIds.length);
    expect(new Set(moduleIds).size).toBe(moduleIds.length);
    expect(new Set(lessons.map(item => item.id)).size).toBe(lessons.length);
    expect(lessons.length).toBeGreaterThanOrEqual(35);
    for (const item of lessons.filter(item => !item.id.startsWith("consultor-"))) {
      expect(item.route).toMatch(/^\//);
      expect(item.keywords.length).toBeGreaterThan(0);
      expect(item.audiences.length).toBeGreaterThan(0);
      expect(item.content).toContain("## Objetivo");
      expect(item.content).toContain("## Passo a passo");
      expect(item.content).toContain("## Validações realizadas pelo sistema");
      expect(item.content).toContain("## O que o sistema faz automaticamente");
      expect(item.content).toContain("## Como confirmar a automação");
      expect(item.content).toContain("## Quando a etapa é bloqueada");
      expect(item.content).toContain("## Resultado esperado");
      expect(item.content).toContain("## Em caso de erro");
    }
  });

  it("offers a separate educational consultant track without operational links", () => {
    const course = TRAINING_CATALOG.find(c => c.id === "consultor-educacao");
    expect(course?.category).toBe("Educação");
    expect(course?.modules[0].lessons.length).toBeGreaterThan(0);
    for (const lesson of course!.modules.flatMap(m => m.lessons)) {
      expect(lesson.route).toBe("");
      expect(lesson.audiences).toEqual(["Consultor"]);
    }
  });

  it("keeps the coverage matrix aligned with every seeded lesson", () => {
    const lessonCount = TRAINING_CATALOG.reduce(
      (courseTotal, course) =>
        courseTotal +
        course.modules.reduce(
          (moduleTotal, module) => moduleTotal + module.lessons.length,
          0
        ),
      0
    );
    expect(TRAINING_COVERAGE).toHaveLength(lessonCount);
    expect(
      TRAINING_COVERAGE.some(item => item.route === "/techmove/raid")
    ).toBe(true);
    expect(
      TRAINING_COVERAGE.some(item => item.route === "/admin/standards")
    ).toBe(true);
  });
});
