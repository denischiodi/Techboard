import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import { z } from "zod";
import type { Response } from "express";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";
import * as db from "../db";
import type { AppUser } from "../../shared/types";

type LoginCode = {
  codeHash: string;
  email: string;
  createdAt: number;
  lastSentAt: number;
  expiresAt: number;
  attempts: number;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string | null };
};

const loginCodes = new Map<string, LoginCode>();
const requestRateByEmail = new Map<string, RateBucket>();
const requestRateByIp = new Map<string, RateBucket>();
const verifyRateByEmail = new Map<string, RateBucket>();
const verifyRateByIp = new Map<string, RateBucket>();
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_EMAIL = 5;
const MAX_REQUESTS_PER_IP = 20;
const MAX_VERIFY_PER_EMAIL = 15;
const MAX_VERIFY_PER_IP = 50;
const RESEND_COOLDOWN_MS = 60 * 1000;

const emailSchema = z.string().trim().toLowerCase().email();

export class LoginCodeRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginCodeRateLimitError";
  }
}

export function normalizeLoginEmail(email: string) {
  return emailSchema.parse(email);
}

function makeCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}:${ENV.cookieSecret}`).digest("hex");
}

function codesMatch(expectedHash: string, email: string, code: string) {
  const actualHash = hashCode(email, code.trim());
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getRequestIp(req?: RequestLike) {
  const forwardedFor = req?.headers?.["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return (firstForwarded?.split(",")[0]?.trim() || req?.ip || req?.socket?.remoteAddress || "unknown").replace(/^::ffff:/, "");
}

function assertRateLimit(bucketMap: Map<string, RateBucket>, key: string, max: number, message: string) {
  const now = Date.now();
  const bucket = bucketMap.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucketMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }

  if (bucket.count >= max) {
    throw new LoginCodeRateLimitError(message);
  }

  bucket.count += 1;
}

async function sendWithResend(to: string, code: string) {
  if (!ENV.resendApiKey || !ENV.emailFrom) {
    throw new Error("Envio de e-mail nao configurado. Defina RESEND_API_KEY e EMAIL_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ENV.emailFrom,
      to,
      subject: "Seu codigo de acesso ao TechBoard+",
      text: `Seu codigo de acesso ao TechBoard+ e ${code}. Ele expira em 10 minutos.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5">
          <h2>Seu codigo de acesso ao TechBoard+</h2>
          <p>Use o codigo abaixo para entrar no sistema:</p>
          <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px">${code}</p>
          <p>Este codigo expira em 10 minutos.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao enviar e-mail (${response.status}): ${body}`);
  }
}

export async function issueLoginCode(email: string, req?: RequestLike) {
  const normalizedEmail = normalizeLoginEmail(email);
  const ip = getRequestIp(req);
  const now = Date.now();
  const existing = loginCodes.get(normalizedEmail);

  assertRateLimit(
    requestRateByEmail,
    normalizedEmail,
    MAX_REQUESTS_PER_EMAIL,
    "Muitas solicitacoes de codigo para este e-mail. Tente novamente mais tarde.",
  );
  assertRateLimit(
    requestRateByIp,
    ip,
    MAX_REQUESTS_PER_IP,
    "Muitas solicitacoes de codigo neste endereco. Tente novamente mais tarde.",
  );

  if (existing && existing.expiresAt > now && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    throw new LoginCodeRateLimitError("Aguarde antes de solicitar outro codigo.");
  }

  const code = makeCode();
  loginCodes.set(normalizedEmail, {
    codeHash: hashCode(normalizedEmail, code),
    email: normalizedEmail,
    createdAt: now,
    lastSentAt: now,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
  });

  if (ENV.emailDeliveryMode === "log") {
    console.log(`[Email auth] Codigo para ${normalizedEmail}: ${code}`);
    return { delivery: "log" as const, code };
  }

  await sendWithResend(normalizedEmail, code);
  return { delivery: "email" as const };
}

export async function consumeLoginCode(email: string, code: string, req?: RequestLike) {
  const normalizedEmail = normalizeLoginEmail(email);
  const ip = getRequestIp(req);

  assertRateLimit(
    verifyRateByEmail,
    normalizedEmail,
    MAX_VERIFY_PER_EMAIL,
    "Muitas tentativas de validacao para este e-mail. Solicite um novo codigo mais tarde.",
  );
  assertRateLimit(
    verifyRateByIp,
    ip,
    MAX_VERIFY_PER_IP,
    "Muitas tentativas de validacao neste endereco. Tente novamente mais tarde.",
  );

  const record = loginCodes.get(normalizedEmail);
  if (!record) return false;

  if (Date.now() > record.expiresAt) {
    loginCodes.delete(normalizedEmail);
    return false;
  }

  record.attempts += 1;
  if (record.attempts > MAX_ATTEMPTS) {
    loginCodes.delete(normalizedEmail);
    return false;
  }

  if (!codesMatch(record.codeHash, normalizedEmail, code)) return false;

  loginCodes.delete(normalizedEmail);
  return true;
}

export function resetEmailAuthStateForTests() {
  loginCodes.clear();
  requestRateByEmail.clear();
  requestRateByIp.clear();
  verifyRateByEmail.clear();
  verifyRateByIp.clear();
}

export async function establishEmailSession(appUser: AppUser, res: Response, req: Parameters<typeof getSessionCookieOptions>[0]) {
  const openId = `email:${appUser.email.toLowerCase()}`;
  await db.upsertUser({
    openId,
    name: appUser.name,
    email: appUser.email,
    loginMethod: "email-code",
    role: appUser.role === "admin" ? "admin" : "user",
    lastSignedIn: new Date(),
  });

  const token = await sdk.signSession({
    openId,
    appId: "techboard-email-auth",
    name: appUser.name,
  });

  res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(req),
    maxAge: ONE_YEAR_MS,
  });

  return {
    openId,
    name: appUser.name,
    email: appUser.email,
    role: appUser.role === "admin" ? "admin" as const : "user" as const,
    loginMethod: "email-code",
  };
}
