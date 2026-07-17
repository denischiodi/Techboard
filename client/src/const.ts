export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const APP_BASE_PATH = "/techboard";
export const appPath = (path = "") => `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
export const assetPath = (path: string) => appPath(path);

const isNonEmptyUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const isOAuthLoginConfigured = () =>
  isNonEmptyUrl(import.meta.env.VITE_OAUTH_PORTAL_URL) &&
  typeof import.meta.env.VITE_APP_ID === "string" &&
  import.meta.env.VITE_APP_ID.length > 0;

export const isLoginConfigured = () => import.meta.env.PROD || isOAuthLoginConfigured();

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;

  if (!isOAuthLoginConfigured()) {
    return APP_BASE_PATH;
  }

  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
