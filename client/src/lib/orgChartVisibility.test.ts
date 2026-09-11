import { describe, expect, it } from "vitest";
import { isResourceVisibleInOrgChart } from "./orgChartVisibility";

describe("visibilidade de recursos na hierarquia", () => {
  it.each(["Inativo", "INATIVO", "Desligado", "DESLIGADO", " desligado "])(
    "oculta o status %s",
    status => {
      expect(isResourceVisibleInOrgChart(status)).toBe(false);
    }
  );

  it.each(["Ativo", "Em Férias", "A contratar"])(
    "mantém o status %s visível",
    status => {
      expect(isResourceVisibleInOrgChart(status)).toBe(true);
    }
  );
});
