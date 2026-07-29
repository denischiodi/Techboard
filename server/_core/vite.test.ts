import { describe, expect, it } from "vitest";
import { getLegacyAppRedirect } from "./vite";

describe("getLegacyAppRedirect", () => {
  it("preserves the TechTask route and query parameters", () => {
    expect(
      getLegacyAppRedirect("/techtask/board", "/techtask/board?projectId=p12")
    ).toBe("/techboard/techtask/board?projectId=p12");
  });

  it("does not redirect unrelated or already canonical routes", () => {
    expect(getLegacyAppRedirect("/api/trpc", "/api/trpc")).toBeNull();
    expect(
      getLegacyAppRedirect(
        "/techboard/techtask/board",
        "/techboard/techtask/board"
      )
    ).toBeNull();
  });
});
