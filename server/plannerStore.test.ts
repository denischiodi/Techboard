import { describe, expect, it } from "vitest";
import { isCanonicalMigrationFile } from "./plannerStore";

describe("migration file selection", () => {
  it("accepts canonical migrations and rejects iCloud conflict copies", () => {
    expect(isCanonicalMigrationFile("0018_activities_kanban.sql")).toBe(true);
    expect(isCanonicalMigrationFile("0018_workflow_query_indexes.sql")).toBe(true);
    expect(isCanonicalMigrationFile("0016_project_logo 2.sql")).toBe(false);
    expect(isCanonicalMigrationFile("notes.sql")).toBe(false);
  });
});
