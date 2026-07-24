import { describe, expect, it } from "vitest";
import { applicableOccurrences } from "./deliveryMasterStore";

const template = (patch: Record<string, unknown> = {}) => ({
  id: "template-1",
  active: true,
  projectIds: [],
  modules: [],
  scopeItemKeys: [],
  ...patch,
});
const scopeItems = [
  { id: "scope-fi", key: "J01", module: "FI" },
  { id: "scope-mm", key: "J45", module: "MM" },
  { id: "scope-mm-2", key: "J46", module: "MM" },
];

describe("delivery master applicability", () => {
  it("creates one occurrence for a general pattern", () => {
    expect(applicableOccurrences(template(), "project-1", ["FI", "MM"], scopeItems))
      .toHaveLength(1);
  });

  it("creates one occurrence for each matching module", () => {
    const result = applicableOccurrences(
      template({ modules: ["FI", "MM"] }),
      "project-1",
      ["FI", "MM", "SD"],
      scopeItems,
    );
    expect(result.map(item => item.module)).toEqual(["FI", "MM"]);
  });

  it("creates one occurrence for each matching scope item", () => {
    const result = applicableOccurrences(
      template({ scopeItemKeys: ["J45", "J46"] }),
      "project-1",
      ["FI", "MM"],
      scopeItems,
    );
    expect(result.map(item => item.scopeItemIds[0])).toEqual(["scope-mm", "scope-mm-2"]);
  });

  it("requires module and scope item when both are configured", () => {
    const result = applicableOccurrences(
      template({ modules: ["FI"], scopeItemKeys: ["J01", "J45"] }),
      "project-1",
      ["FI", "MM"],
      scopeItems,
    );
    expect(result).toHaveLength(1);
    expect(result[0].scopeItemIds).toEqual(["scope-fi"]);
  });
});
