import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { GOOGLE_AUTH_ENDPOINT, getGoogleOAuthConfig } from "@/lib/google-oauth";

export const runtime = "nodejs";

const STATE_COOKIE = "g_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 minutes to complete the flow

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

// Build an absolute URL on the public origin. request.url carries the internal
// pod hostname (0.0.0.0:3000) behind the proxy, so we must prefer APP_PUBLIC_URL.
function publicUrl(path: string, request: Request): string {
  const base = (process.env.APP_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  if (base) return `${base}${path}`;
  return new URL(path, request.url).toString();
}

export async function GET(request: Request) {
  const config = getGoogleOAuthConfig();
  if (!config) {
    // Feature not configured: send the user back to sign-in with a notice
    // rather than throwing a 500.
    return NextResponse.redirect(publicUrl("/app/signin?error=google_unavailable", request));
  }

  // CSRF protection for the OAuth round-trip: random state stored in an
  // httpOnly cookie and echoed back by Google on the callback.
  const state = randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
}
