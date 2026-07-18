import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { AppUser } from "../../shared/types";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  appUser?: AppUser | null;
};

type DemoRequest = {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
  connection?: { remoteAddress?: string | null };
};

function normalizeAddress(address: string | null | undefined) {
  if (!address) return "";
  return address.replace(/^::ffff:/, "");
}

export function isSafeLocalDemoRequest(req: DemoRequest) {
  if (ENV.isProduction) return false;

  const remoteAddress = normalizeAddress(req.socket?.remoteAddress ?? req.connection?.remoteAddress);
  const isLoopbackAddress = ["", "::1", "127.0.0.1"].includes(remoteAddress) || remoteAddress.startsWith("127.");
  if (!isLoopbackAddress) return false;

  const hostHeader = req.headers?.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return true;

  const hostname = (host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.split(":")[0]
  )?.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function shouldUseDemoAuth(req: DemoRequest) {
  const demoConfigured = ENV.demoAuthEnabled || (process.env.NODE_ENV !== "production" && !process.env.VITE_OAUTH_PORTAL_URL);
  return demoConfigured && isSafeLocalDemoRequest(req);
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (
    !user &&
    shouldUseDemoAuth(opts.req)
  ) {
    const now = new Date();
    user = {
      id: 0,
      openId: "local-demo-admin",
      name: "Demo Admin",
      email: "defechi@gmail.com",
      loginMethod: "local-demo",
      role: "admin",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    };
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
