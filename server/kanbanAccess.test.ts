import { describe, expect, it } from "vitest";
import { DEFAULT_PERMISSIONS } from "../shared/types";
import type { TrpcContext } from "./_core/context";
import * as store from "./plannerStore";
import { appRouter } from "./routers";

function context(email: string): TrpcContext {
  return { user: { id: 991, openId: `kanban-access:${email}`, email, name: email, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => {} } as unknown as TrpcContext["res"] };
}

describe("acesso ao Kanban no TechBoard", () => {
  it("preserva o acesso concedido pelas permissões antigas", async () => {
    const email = `legacy-kanban-${Date.now()}@example.com`;
    await store.createAppUser({ name: "Legacy Kanban", email, role: "viewer", permissions: { ...DEFAULT_PERMISSIONS.viewer, activities: true, products: { techboard: false, techtask: true, techmove: false }, actions: { "techtask.board": { view: true, create: false, modify: true }, "techtask.myWork": { view: true, create: false, modify: true } } } });
    const caller = appRouter.createCaller(context(email));
    await expect(caller.activities.list()).resolves.toBeDefined();
    const user = await caller.access.getByEmail({ email });
    expect(user?.permissions.products?.techboard).toBe(true);
    expect(user?.permissions.actions?.["techboard.kanban"]?.view).toBe(true);
  });

  it("permite somente o Kanban sem liberar os demais módulos do TechBoard", async () => {
    const email = `kanban-only-${Date.now()}@example.com`;
    await store.createAppUser({ name: "Kanban Only", email, role: "viewer", permissions: { ...DEFAULT_PERMISSIONS.viewer, dashboard: false, planner: false, organogram: false, activities: true, products: { techboard: true, techmove: false, techtask: false }, actions: { "techboard.kanban": { view: true, create: false, modify: false }, "techboard.myWork": { view: true, create: false, modify: false } } } });
    const caller = appRouter.createCaller(context(email));
    await expect(caller.activities.list()).resolves.toBeDefined();
    await expect(caller.dashboard.stats()).rejects.toThrow(/sem permissao/i);
  });

  it("bloqueia atividades quando as novas permissões negam acesso", async () => {
    const email = `kanban-blocked-${Date.now()}@example.com`;
    await store.createAppUser({ name: "Kanban Blocked", email, role: "viewer", permissions: { ...DEFAULT_PERMISSIONS.viewer, activities: true, products: { techboard: true, techmove: true, techtask: true }, actions: { "techboard.kanban": { view: false, create: false, modify: false }, "techboard.myWork": { view: false, create: false, modify: false } } } });
    const caller = appRouter.createCaller(context(email));
    await expect(caller.activities.list()).rejects.toThrow(/sem permissão/i);
  });
});
