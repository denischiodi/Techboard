export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  demoAuthEnabled: process.env.DEMO_AUTH_ENABLED === "true",
  emailAuthEnabled: process.env.EMAIL_AUTH_ENABLED !== "false",
  emailFrom: process.env.EMAIL_FROM ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailDeliveryMode: process.env.EMAIL_DELIVERY_MODE ?? "provider",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};

export function validateRuntimeEnv() {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  const requireValue = (key: string, value: string | undefined) => {
    if (!value || value.trim().length === 0) missing.push(key);
  };

  requireValue("DATABASE_URL", process.env.DATABASE_URL);
  requireValue("JWT_SECRET", process.env.JWT_SECRET);
  if (
    process.env.DEMO_AUTH_ENABLED !== "true" &&
    process.env.EMAIL_AUTH_ENABLED === "false"
  ) {
    requireValue("VITE_APP_ID", process.env.VITE_APP_ID);
    requireValue("VITE_OAUTH_PORTAL_URL", process.env.VITE_OAUTH_PORTAL_URL);
    requireValue("OAUTH_SERVER_URL", process.env.OAUTH_SERVER_URL);
    requireValue("OWNER_OPEN_ID", process.env.OWNER_OPEN_ID);
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 16) {
    missing.push("JWT_SECRET >= 16 caracteres");
  }

  if (missing.length > 0) {
    throw new Error(`Variaveis obrigatorias de producao ausentes ou invalidas: ${missing.join(", ")}`);
  }
}
