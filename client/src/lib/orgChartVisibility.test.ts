import { describe, expect, it } from "vitest";
import { isResourceVisibleInPlanningViews } from "./orgChartVisibility";

describe("visibilidade de recursos nas visões de planejamento", () => {
  it.each(["Inativo", "INATIVO", "Desligado", "DESLIGADO", " desligado "])(
    "oculta o status %s",
    status => {
      expect(isResourceVisibleInPlanningViews(status)).toBe(false);
    }
  );

  it.each(["Ativo", "Em Férias", "A contratar"])(
    "mantém o status %s visível",
    status => {
      expect(isResourceVisibleInPlanningViews(status)).toBe(true);
    }
  );
});
