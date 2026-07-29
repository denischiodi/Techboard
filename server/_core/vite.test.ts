import { describe, expect, it } from "vitest";
import { getLegacyAppRedirect } from "./vite";

describe("getLegacyAppRedirect", () => {
  it("preserva query string ao redirecionar o Kanban legado", () => {
    expect(
      getLegacyAppRedirect(
        "/techtask/board",
        "/techtask/board?projectId=p12"
      )
    ).toBe("/techboard/techtask/board?projectId=p12");
  });

  it("não redireciona rotas que já usam o prefixo da aplicação", () => {
    expect(
      getLegacyAppRedirect(
        "/techboard/techtask/board",
        "/techboard/techtask/board"
      )
    ).toBeNull();
  });
});
