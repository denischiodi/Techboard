import { describe, expect, it } from "vitest";
import { getLegacyAppRedirect } from "./vite";

describe("getLegacyAppRedirect", () => {
  it("preserves the TechTask route and query parameters", () => {
    expect(
      getLegacyAppRedirect("/techtask/board", "/techtask/board?projectId=p12")
    ).toBe("/techboard/kanban?projectId=p12");
  });

  it("redirects legacy product routes before the client access guard", () => {
    expect(getLegacyAppRedirect("/techlead", "/techlead")).toBe("/techmove");
    expect(
      getLegacyAppRedirect(
        "/techlead/gp-track",
        "/techlead/gp-track?projectId=p12"
      )
    ).toBe("/techmove/trail?projectId=p12");
    expect(getLegacyAppRedirect("/gp-checklist", "/gp-checklist")).toBe(
      "/techmove/trail"
    );
    expect(getLegacyAppRedirect("/cadastros", "/cadastros")).toBe(
      "/admin/registrations"
    );
  });

  it("does not redirect unrelated or already canonical routes", () => {
    expect(getLegacyAppRedirect("/api/trpc", "/api/trpc")).toBeNull();
    expect(
      getLegacyAppRedirect("/techboard/kanban", "/techboard/kanban")
    ).toBeNull();
  });
});
