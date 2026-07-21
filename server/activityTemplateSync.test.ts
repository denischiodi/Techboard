import { describe, expect, it } from "vitest";
import type { ActivityTemplate, Project } from "../shared/types";
import { occurrenceForTemplate } from "./activityTemplateSync";

const project: Project = { id: "p1", name: "Projeto", client: "Cliente", manager: "GP", status: "Em andamento", startDate: "2026-01-01", endDate: "2026-12-31", fronts: [], notes: "" };
const template: ActivityTemplate = {
  id: "t1", title: "Status report", description: "", priority: "Média", recurrence: "weekly", weekday: 5,
  monthDay: 1, dueOffsetDays: 0, ownerRole: "manager", appliesToAllProjects: true, active: true, projects: [],
  createdByUserId: "u1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("activity template scheduling", () => {
  it("creates a weekly occurrence due on the configured weekday", () => {
    expect(occurrenceForTemplate(template, project, "2026-07-15")).toEqual({ key: "week-2026-07-13", dueDate: "2026-07-17" });
  });

  it("uses the last available day in short months", () => {
    expect(occurrenceForTemplate({ ...template, recurrence: "monthly", monthDay: 31 }, project, "2026-02-10")).toEqual({ key: "month-2026-02", dueDate: "2026-02-28" });
  });

  it("calculates one-time deadlines from the project start", () => {
    expect(occurrenceForTemplate({ ...template, recurrence: "none", dueOffsetDays: 10 }, project, "2026-07-15")).toEqual({ key: "once", dueDate: "2026-01-11" });
  });

  it("does not create a recurrence whose due date predates the project", () => {
    expect(occurrenceForTemplate(template, { ...project, startDate: "2026-07-18" }, "2026-07-15")).toBeNull();
  });
});
