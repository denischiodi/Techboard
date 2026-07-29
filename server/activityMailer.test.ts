import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";

const { query, listAppUsers, getActivityEmailNotificationsEnabled } =
  vi.hoisted(() => ({
    query: vi.fn(),
    listAppUsers: vi.fn(),
    getActivityEmailNotificationsEnabled: vi.fn(),
  }));

vi.mock("./db", () => ({
  getPgPool: () => ({ query }),
}));

vi.mock("./plannerStore", () => ({
  listAppUsers,
  getResourceById: vi.fn(),
}));

vi.mock("./systemSettings", () => ({
  getActivityEmailNotificationsEnabled,
}));

import { flushActivityEmailOutbox } from "./activityMailer";

const originalActivityEmailNotificationsEnabled =
  ENV.activityEmailNotificationsEnabled;
const originalEmailDeliveryMode = ENV.emailDeliveryMode;

describe("activity email outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ENV.activityEmailNotificationsEnabled = true;
    ENV.emailDeliveryMode = "log";
    getActivityEmailNotificationsEnabled.mockResolvedValue(true);
  });

  afterEach(() => {
    ENV.activityEmailNotificationsEnabled =
      originalActivityEmailNotificationsEnabled;
    ENV.emailDeliveryMode = originalEmailDeliveryMode;
  });

  it("marks pending and failed emails as skipped when notifications are disabled", async () => {
    getActivityEmailNotificationsEnabled.mockResolvedValue(false);
    query.mockResolvedValueOnce({ rowCount: 2, rows: [] });

    await flushActivityEmailOutbox();

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`WHERE "emailStatus" IN ('pending','failed')`)
    );
    expect(query.mock.calls[0][0]).toContain(`"emailStatus" = 'skipped'`);
    expect(query.mock.calls[0][0]).not.toContain(`"emailAttempts"`);
    expect(listAppUsers).not.toHaveBeenCalled();
  });

  it("does not revisit skipped emails after notifications are re-enabled", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await flushActivityEmailOutbox();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(`WHERE "emailStatus" IN ('pending','failed')`),
      [25]
    );
    expect(query.mock.calls[0][0]).not.toContain(`'skipped'`);
    expect(listAppUsers).not.toHaveBeenCalled();
  });
});
