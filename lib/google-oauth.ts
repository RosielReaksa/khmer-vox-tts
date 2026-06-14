import "server-only";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

/**
 * Returns the Google OAuth config, or null if it isn't configured.
 * Routes use the null result to cleanly disable the feature instead of crashing.
 */
export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = cleanEnv("GOOGLE_CLIENT_ID");
  const clientSecret = cleanEnv("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const explicitRedirect = cleanEnv("GOOGLE_REDIRECT_URI");
  const appUrl = cleanEnv("APP_PUBLIC_URL");
  const redirectUri =
    explicitRedirect ||
    (appUrl ? `${appUrl.replace(/\/$/, "")}/api/auth/google/callback` : "");
  if (!redirectUri) return null;

  return { clientId, clientSecret, redirectUri };
}

export function isGoogleOAuthEnabled(): boolean {
  return getGoogleOAuthConfig() !== null;
}

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
