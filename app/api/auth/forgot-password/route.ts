import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { validateCsrfToken } from "@/lib/csrf";
import {
  passwordResetEmailConfigured,
  passwordResetTokenTtlMinutes,
  sendPasswordResetEmail,
} from "@/lib/password-reset-email";
import { acquireUsageLimit, type UsageLimitResult } from "@/lib/rate-limit";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { generatePasswordResetToken } from "@/lib/security";
import { getUsagePolicy } from "@/lib/server-usage-policy";
import {
  createPasswordResetToken,
  deletePasswordResetToken,
  findUserByEmail,
} from "@/lib/store";

const requestSchema = z.object({
  email: z.string().trim().email().max(200),
});

const genericMessage = "If an account exists for that email, a recovery link has been sent.";

function clientKey(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const emailHash = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);
  return `auth:forgot-password:${ip}:${emailHash}`;
}

function deliveryErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "unknown";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.slice(0, 40) : "unknown";
}

export async function POST(request: Request) {
  if (!(await validateCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  let limit: Extract<UsageLimitResult, { ok: true }> | null = null;
  try {
    const body = await readJsonRequest(request);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const usageLimit = await acquireUsageLimit(
      clientKey(request, parsed.data.email),
      getUsagePolicy("authPasswordReset"),
    );
    if (!usageLimit.ok) {
      return NextResponse.json(
        { error: usageLimit.message, code: usageLimit.code },
        { status: usageLimit.status, headers: usageLimit.headers },
      );
    }
    limit = usageLimit;

    if (!passwordResetEmailConfigured()) {
      return NextResponse.json(
        { error: "Recovery email is temporarily unavailable. Contact support." },
        { status: 503, headers: limit.headers },
      );
    }

    const user = await findUserByEmail(parsed.data.email);
    if (!user) {
      await delay(250);
      return NextResponse.json({ ok: true, message: genericMessage }, { headers: limit.headers });
    }

    const { rawToken, tokenHash } = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + passwordResetTokenTtlMinutes() * 60_000).toISOString();
    await createPasswordResetToken({ userId: user.id, tokenHash, expiresAt });

    try {
      await sendPasswordResetEmail({ email: user.email, rawToken });
    } catch (error) {
      await deletePasswordResetToken(tokenHash).catch(() => undefined);
      console.error(`[password-reset] SMTP delivery failed (${deliveryErrorCode(error)}).`);
      return NextResponse.json(
        { error: "Recovery email is temporarily unavailable. Contact support." },
        { status: 503, headers: limit.headers },
      );
    }

    return NextResponse.json({ ok: true, message: genericMessage }, { headers: limit.headers });
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status });
    }
    return NextResponse.json({ error: "Could not process the recovery request." }, { status: 500 });
  } finally {
    await limit?.release();
  }
}
