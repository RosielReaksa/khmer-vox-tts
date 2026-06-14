import { NextResponse } from "next/server";
import { z } from "zod";

import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { verifyPassword } from "@/lib/security";
import { findUserByEmail } from "@/lib/store";

import { validateCsrfToken } from "@/lib/csrf";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";

const signinSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function clientKey(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `auth:signin:${ip}:${email.toLowerCase()}`;
}

export async function POST(request: Request) {
  const isCsrfValid = await validateCsrfToken(request);
  if (!isCsrfValid) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;
  try {
    const body = await readJsonRequest(request);
    const parsed = signinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid login fields." }, { status: 400 });
    }
    const usageLimit = await acquireUsageLimit(clientKey(request, parsed.data.email), getUsagePolicy("authSignin"));
    if (!usageLimit.ok) {
      return NextResponse.json(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const user = await findUserByEmail(parsed.data.email);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "This account uses Google sign-in. Please continue with Google." },
        { status: 409 },
      );
    }

    const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const token = await createSessionToken({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    return NextResponse.json(
      {
        ok: true,
        user: { email: user.email },
      },
      { headers: limit.headers },
    );
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status });
    }
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  } finally {
    await limit?.release();
  }
}
