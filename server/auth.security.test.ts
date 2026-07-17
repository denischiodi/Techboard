import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { isSafeLocalDemoRequest } from "./_core/context";
import { LoginCodeRateLimitError, consumeLoginCode, issueLoginCode, resetEmailAuthStateForTests } from "./_core/emailAuth";

const originalEmailDeliveryMode = ENV.emailDeliveryMode;

function requestFrom(ip: string, host = "localhost:3030") {
  return {
    headers: { host },
    socket: { remoteAddress: ip },
  };
}

describe("auth security", () => {
  beforeEach(() => {
    resetEmailAuthStateForTests();
    ENV.emailDeliveryMode = "log";
  });

  afterEach(() => {
    ENV.emailDeliveryMode = originalEmailDeliveryMode;
  });

  it("allows demo fallback only for safe local requests", () => {
    expect(isSafeLocalDemoRequest(requestFrom("127.0.0.1"))).toBe(true);
    expect(isSafeLocalDemoRequest(requestFrom("::1", "[::1]:3030"))).toBe(true);
    expect(isSafeLocalDemoRequest(requestFrom("10.0.0.20", "localhost:3030"))).toBe(false);
    expect(isSafeLocalDemoRequest(requestFrom("127.0.0.1", "planner.example.com"))).toBe(false);
  });

  it("blocks rapid login code resend for the same email", async () => {
    await issueLoginCode("security@example.com", requestFrom("127.0.0.1"));

    await expect(
      issueLoginCode("security@example.com", requestFrom("127.0.0.1")),
    ).rejects.toBeInstanceOf(LoginCodeRateLimitError);
  });

  it("rate limits repeated login code verification attempts", async () => {
    for (let i = 0; i < 15; i += 1) {
      await expect(
        consumeLoginCode("security@example.com", "000000", requestFrom("127.0.0.1")),
      ).resolves.toBe(false);
    }

    await expect(
      consumeLoginCode("security@example.com", "000000", requestFrom("127.0.0.1")),
    ).rejects.toBeInstanceOf(LoginCodeRateLimitError);
  });
});
