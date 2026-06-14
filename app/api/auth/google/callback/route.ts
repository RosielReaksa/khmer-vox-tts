import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
  getGoogleOAuthConfig,
} from "@/lib/google-oauth";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import {
  createGoogleUserWithSignupBonus,
  findUserByEmail,
  findUserByGoogleId,
  linkGoogleAccount,
} from "@/lib/store";

export const runtime = "nodejs";

const STATE_COOKIE = "g_oauth_state";

// Build an absolute URL on the public origin. request.url carries the internal
// pod hostname (0.0.0.0:3000) behind the proxy, so we must prefer APP_PUBLIC_URL.
function publicUrl(path: string, request: Request): string {
  const base = (process.env.APP_PUBLIC_URL ?? "").trim().replace(/\/$/, "");
  if (base) return `${base}${path}`;
  return new URL(path, request.url).toString();
}

function redirectWithError(request: Request, code: string): NextResponse {
  return NextResponse.redirect(publicUrl(`/app/signin?error=${code}`, request));
}

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

export async function GET(request: Request) {
  const config = getGoogleOAuthConfig();
  if (!config) {
    return redirectWithError(request, "google_unavailable");
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const googleError = url.searchParams.get("error");

  if (googleError) {
    // User cancelled or Google denied (e.g. access_denied)
    return redirectWithError(request, "google_cancelled");
  }
  if (!code || !returnedState) {
    return redirectWithError(request, "google_failed");
  }

  // Validate state against the httpOnly cookie set in /start (CSRF guard).
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
  if (!expectedState || expectedState !== returnedState) {
    return redirectWithError(request, "google_state");
  }

  try {
    // 1) Exchange the authorization code for tokens.
    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) {
      console.error("[google-oauth] token exchange failed", tokenResponse.status);
      return redirectWithError(request, "google_failed");
    }
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) {
      return redirectWithError(request, "google_failed");
    }

    // 2) Fetch the verified profile.
    const userinfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoResponse.ok) {
      console.error("[google-oauth] userinfo failed", userinfoResponse.status);
      return redirectWithError(request, "google_failed");
    }
    const profile = (await userinfoResponse.json()) as GoogleUserInfo;
    const googleId = profile.sub;
    const email = profile.email?.trim().toLowerCase();
    if (!googleId || !email) {
      return redirectWithError(request, "google_failed");
    }
    // Only trust Google-verified emails for account matching/creation.
    if (profile.email_verified === false) {
      return redirectWithError(request, "google_unverified");
    }

    const displayName = profile.name?.trim() || null;
    const avatarUrl = profile.picture?.trim() || null;

    // 3) Resolve the account: existing Google user -> existing email (link) -> create.
    let user = await findUserByGoogleId(googleId);

    if (!user) {
      const byEmail = await findUserByEmail(email);
      if (byEmail) {
        // Same email already registered (by password or otherwise): link Google
        // to that account instead of creating a duplicate.
        user = await linkGoogleAccount({ userId: byEmail.id, googleId, displayName, avatarUrl });
      } else {
        user = await createGoogleUserWithSignupBonus({ email, googleId, displayName, avatarUrl });
      }
    }

    if (!user) {
      return redirectWithError(request, "google_failed");
    }

    if (user.suspendedAt) {
      return redirectWithError(request, "account_suspended");
    }

    // 4) Establish the session (same cookie/JWT as password login).
    const token = await createSessionToken({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    return NextResponse.redirect(publicUrl("/app/dashboard", request));
  } catch (error) {
    if (error instanceof Error && error.message === "GOOGLE_ID_LINKED") {
      return redirectWithError(request, "google_already_linked");
    }
    console.error("[google-oauth] callback error", error);
    return redirectWithError(request, "google_failed");
  }
}
