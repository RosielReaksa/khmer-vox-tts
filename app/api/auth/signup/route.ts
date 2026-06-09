import { NextResponse } from "next/server";
import { z } from "zod";

import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { createSessionToken, setSessionCookie } from "@/lib/session";
import { hashPassword } from "@/lib/security";
import { createUserWithSignupBonus } from "@/lib/store";

import { validateCsrfToken } from "@/lib/csrf";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

function clientKey(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `auth:signup:${ip}:${email.toLowerCase()}`;
}

export async function POST(request: Request) {
  const isCsrfValid = await validateCsrfToken(request);
  if (!isCsrfValid) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;
  try {
    const body = await readJsonRequest(request);
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid signup fields." }, { status: 400 });
    }
    const usageLimit = await acquireUsageLimit(clientKey(request, parsed.data.email), getUsagePolicy("authSignup"));
    if (!usageLimit.ok) {
      return NextResponse.json(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const passwordHash = await hashPassword(parsed.data.password);
    let user;
    try {
      user = await createUserWithSignupBonus(parsed.data.email, passwordHash);
    } catch (error) {
      if (error instanceof Error && error.message === "EMAIL_EXISTS") {
        return NextResponse.json({ error: "Account already exists. Please sign in." }, { status: 409 });
      }
      throw error;
    }

    const token = await createSessionToken({ userId: user.id, email: user.email });
    await setSessionCookie(token);

    return NextResponse.json(
      {
        ok: true,
        user: { email: user.email },
        message: "Account created. 100 free tokens added.",
      },
      { headers: limit.headers },
    );
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status });
    }
    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  } finally {
    await limit?.release();
  }
}
