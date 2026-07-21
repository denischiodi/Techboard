import { describe, expect, it } from "vitest";
import { canAccessPath, canViewMenuItem, PRODUCT_CATALOG } from "./productCatalog";
import { DEFAULT_PERMISSIONS } from "../../../shared/types";

describe("permissões por tela", () => {
  it("mantém a permissão antiga como fallback", () => {
    const bdcq = PRODUCT_CATALOG.techmove.menus.find(item => item.accessKey === "techmove.bdcq")!;
    expect(canViewMenuItem(bdcq, DEFAULT_PERMISSIONS.manager)).toBe(true);
  });

  it("prioriza a permissão específica da tela", () => {
    const permissions = {
      ...DEFAULT_PERMISSIONS.manager,
      actions: {
        ...DEFAULT_PERMISSIONS.manager.actions,
        "techmove.bdcq": { view: false, modify: false, create: false },
        "techmove.tests": { view: true, modify: false, create: false },
      },
    };

    expect(canAccessPath("/techmove/bdcq", permissions)).toBe(false);
    expect(canAccessPath("/techmove/bdcq?projectId=123", permissions)).toBe(false);
    expect(canAccessPath("/techmove/tests", permissions)).toBe(true);
  });
});
