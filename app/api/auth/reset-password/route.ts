import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { validateCsrfToken } from "@/lib/csrf";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { hashPassword, hashPasswordResetToken } from "@/lib/security";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import { consumePasswordResetToken } from "@/lib/store";

const resetSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(8).max(200),
});

function clientKey(request: Request, token: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const tokenPrefix = createHash("sha256").update(token).digest("hex").slice(0, 16);
  return `auth:reset-password:${ip}:${tokenPrefix}`;
}

export async function POST(request: Request) {
  if (!(await validateCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;
  try {
    const body = await readJsonRequest(request);
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "The reset link is invalid, or the password is shorter than 8 characters." },
        { status: 400 },
      );
    }

    const usageLimit = await acquireUsageLimit(
      clientKey(request, parsed.data.token),
      getUsagePolicy("authPasswordReset"),
    );
    if (!usageLimit.ok) {
      return NextResponse.json(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    const passwordHash = await hashPassword(parsed.data.password);
    const tokenHash = hashPasswordResetToken(parsed.data.token);
    const consumed = await consumePasswordResetToken(tokenHash, passwordHash);
    if (!consumed) {
      return NextResponse.json(
        { error: "This recovery link is invalid, expired, or already used." },
        { status: 400, headers: limit.headers },
      );
    }

    return NextResponse.json(
      { ok: true, message: "Password updated. You can now sign in." },
      { headers: limit.headers },
    );
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status });
    }
    return NextResponse.json({ error: "Could not reset the password." }, { status: 500 });
  } finally {
    await limit?.release();
  }
}
