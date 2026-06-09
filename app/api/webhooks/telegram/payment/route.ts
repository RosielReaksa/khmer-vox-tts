import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import {
  processTelegramPaymentUpdate,
  type TelegramPaymentUpdate,
} from "@/lib/telegram-payment-monitor";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { handleTelegramPaymentActionUpdate } from "@/app/api/webhooks/telegram/payment-actions/route";

export const runtime = "nodejs";

function cleanEnv(input: string | undefined): string {
  return input?.trim().replace(/^"|"$/g, "") ?? "";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function secretIsValid(request: Request): boolean {
  const expected = cleanEnv(process.env.TELEGRAM_WEBHOOK_SECRET);
  if (!expected) return true;
  const telegramSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const fallbackSecret = request.headers.get("x-telegram-webhook-secret") ?? "";
  return safeEqual(telegramSecret, expected) || safeEqual(fallbackSecret, expected);
}

export async function POST(request: Request) {
  if (!secretIsValid(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED_WEBHOOK" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await readJsonRequest(request);
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json({ ok: false, ...jsonRequestErrorBody(error) }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const callbackData = (payload as { callback_query?: { data?: unknown } })?.callback_query?.data;
  if (typeof callbackData === "string" && callbackData.startsWith("pa:")) {
    return handleTelegramPaymentActionUpdate(payload);
  }

  try {
    const result = await processTelegramPaymentUpdate(payload as TelegramPaymentUpdate);
    return NextResponse.json({
      ok: result.ok,
      decision: result.decision,
      reason: result.reason,
      eventId: result.event?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "TELEGRAM_PAYMENT_PROCESS_FAILED",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
