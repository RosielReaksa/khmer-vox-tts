import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { invalidateDashboardCountCache } from "@/lib/dashboard-count-cache";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import {
  approvePaymentOrder,
  createTelegramPaymentAction,
  findUserById,
} from "@/lib/store";
import {
  formatPaymentApprovalMessage,
  hasTelegramPaymentAdminAllowlist,
  isAllowedTelegramPaymentAdmin,
  isConfiguredPaymentApprovalChat,
  paymentApprovalTelegramToken,
  paymentApprovalWebhookSecret,
  resolvePaymentApprovalAdminUserId,
  verifyPaymentApprovalCallbackData,
} from "@/lib/telegram-payment-actions";

export const runtime = "nodejs";

type TelegramCallbackPayload = {
  callback_query?: {
    id?: string;
    from?: {
      id?: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    message?: {
      message_id?: number | string;
      chat?: {
        id?: number | string;
      };
    };
    data?: string;
  };
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function secretIsValid(request: Request): boolean {
  const expected = paymentApprovalWebhookSecret();
  if (!expected) return true;
  const telegramSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const fallbackSecret = request.headers.get("x-telegram-webhook-secret") ?? "";
  return safeEqual(telegramSecret, expected) || safeEqual(fallbackSecret, expected);
}

async function telegramApi(path: string, body: Record<string, unknown>): Promise<boolean> {
  if (process.env.PAYMENT_APPROVAL_TELEGRAM_DISABLE_SEND === "true") return true;
  const token = paymentApprovalTelegramToken();
  if (!token) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function answerCallbackQuery(callbackQueryId: string | null, text: string, alert = false) {
  if (!callbackQueryId) return;
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: alert,
  });
}

async function editApprovalMessage(input: {
  chatId: string | null;
  messageId: string | null;
  text: string;
}) {
  if (!input.chatId || !input.messageId) return;
  const commonBody = {
    chat_id: input.chatId,
    message_id: input.messageId,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  };

  const editedCaption = await telegramApi("editMessageCaption", {
    ...commonBody,
    caption: input.text,
  });
  if (editedCaption) return;

  const editedText = await telegramApi("editMessageText", {
    ...commonBody,
    text: input.text,
    disable_web_page_preview: true,
  });
  if (editedText) return;

  await telegramApi("editMessageReplyMarkup", {
    chat_id: input.chatId,
    message_id: input.messageId,
    reply_markup: { inline_keyboard: [] },
  });
}

function callbackMeta(payload: TelegramCallbackPayload) {
  const callback = payload.callback_query;
  const from = callback?.from;
  const message = callback?.message;
  return {
    callbackQueryId: callback?.id ? String(callback.id) : null,
    data: typeof callback?.data === "string" ? callback.data : "",
    telegramUserId: from?.id === undefined || from.id === null ? null : String(from.id),
    telegramUsername: from?.username ?? null,
    telegramFirstName: from?.first_name ?? null,
    telegramLastName: from?.last_name ?? null,
    messageChatId: message?.chat?.id === undefined || message.chat.id === null ? null : String(message.chat.id),
    messageId: message?.message_id === undefined || message.message_id === null ? null : String(message.message_id),
  };
}

async function audit(input: {
  orderId: string | null;
  status: Parameters<typeof createTelegramPaymentAction>[0]["status"];
  reason: string | null;
  meta: ReturnType<typeof callbackMeta>;
}) {
  await createTelegramPaymentAction({
    orderId: input.orderId,
    action: "approve",
    status: input.status,
    reason: input.reason,
    telegramUserId: input.meta.telegramUserId,
    telegramUsername: input.meta.telegramUsername,
    telegramFirstName: input.meta.telegramFirstName,
    telegramLastName: input.meta.telegramLastName,
    callbackQueryId: input.meta.callbackQueryId,
    messageChatId: input.meta.messageChatId,
    messageId: input.meta.messageId,
  });
}

export async function handleTelegramPaymentActionUpdate(payload: unknown) {
  const meta = callbackMeta(payload as TelegramCallbackPayload);
  const verified = verifyPaymentApprovalCallbackData(meta.data);
  if (!verified.ok) {
    const status = verified.reason === "EXPIRED" ? "expired" : "invalid";
    await audit({ orderId: verified.orderId, status, reason: verified.reason, meta });
    await answerCallbackQuery(meta.callbackQueryId, verified.reason === "EXPIRED" ? "Approval button expired." : "Invalid approval button.", true);
    return NextResponse.json({ ok: false, error: verified.reason }, { status: 400 });
  }

  const localDevFallback =
    process.env.NODE_ENV !== "production" &&
    !hasTelegramPaymentAdminAllowlist() &&
    !isConfiguredPaymentApprovalChat(meta.messageChatId);
  const allowedByUser = isAllowedTelegramPaymentAdmin(meta.telegramUserId) || localDevFallback;
  const allowedByChat = (!hasTelegramPaymentAdminAllowlist() && isConfiguredPaymentApprovalChat(meta.messageChatId)) || localDevFallback;

  if (!allowedByUser && !allowedByChat) {
    await audit({ orderId: verified.orderId, status: "forbidden", reason: "TELEGRAM_ADMIN_NOT_ALLOWED", meta });
    await answerCallbackQuery(meta.callbackQueryId, "You are not allowed to approve payments.", true);
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const adminUserId = await resolvePaymentApprovalAdminUserId();
  if (!adminUserId) {
    await audit({ orderId: verified.orderId, status: "failed", reason: "ADMIN_USER_NOT_FOUND", meta });
    await answerCallbackQuery(meta.callbackQueryId, "Website admin account was not found.", true);
    return NextResponse.json({ ok: false, error: "ADMIN_USER_NOT_FOUND" }, { status: 500 });
  }

  const result = await approvePaymentOrder({
    orderId: verified.orderId,
    adminUserId,
    adminNote: `Approved from Telegram by ${meta.telegramUsername ? `@${meta.telegramUsername}` : meta.telegramUserId}.`,
  });

  if (!result.ok) {
    const status = result.reason === "ORDER_EXPIRED"
      ? "expired"
      : result.reason === "ORDER_ALREADY_DECIDED"
        ? "already_decided"
        : "failed";
    await audit({ orderId: verified.orderId, status, reason: result.reason ?? "APPROVAL_FAILED", meta });
    await answerCallbackQuery(meta.callbackQueryId, result.reason === "ORDER_ALREADY_DECIDED" ? "Payment is already decided." : "Could not approve payment.", true);
    return NextResponse.json({ ok: false, error: result.reason ?? "APPROVAL_FAILED", order: result.order }, { status: 409 });
  }

  if (result.order) {
    await invalidateDashboardCountCache(result.order.userId, ["api", "billing", "history"]);
    const user = await findUserById(result.order.userId);
    await editApprovalMessage({
      chatId: meta.messageChatId,
      messageId: meta.messageId,
      text: formatPaymentApprovalMessage({
        order: result.order,
        userEmail: user?.email ?? "approved customer",
        title: "Payment approved from Telegram",
        statusLine: `Approved by ${meta.telegramUsername ? `@${meta.telegramUsername}` : meta.telegramUserId ?? "Telegram admin"}`,
      }),
    });
  }

  await audit({ orderId: verified.orderId, status: "success", reason: "APPROVED_FROM_TELEGRAM", meta });
  await answerCallbackQuery(meta.callbackQueryId, "Payment approved and tokens credited.");
  return NextResponse.json({ ok: true, order: result.order });
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

  return handleTelegramPaymentActionUpdate(payload);
}
