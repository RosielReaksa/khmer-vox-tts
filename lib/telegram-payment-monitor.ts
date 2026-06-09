import "server-only";

import { parseTelegramPaymentText } from "@/lib/telegram-payment-parser";
import {
  confirmPaymentOrderPaid,
  createTelegramPaymentEvent,
  findTelegramPaymentEventByTransactionId,
  getSystemSetting,
  listPaymentOrdersForAdmin,
  setSystemSetting,
  updateTelegramPaymentEventDecision,
} from "@/lib/store";
import type {
  PaymentOrderRecord,
  TelegramPaymentEventDecision,
  TelegramPaymentEventRecord,
} from "@/lib/types";

type TelegramUser = {
  id?: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id?: number | string;
  title?: string;
  username?: string;
  type?: string;
};

type TelegramMessage = {
  message_id?: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  chat?: TelegramChat;
  date?: number;
  text?: string;
  caption?: string;
};

export type TelegramPaymentUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
};

export type TelegramPaymentProcessResult = {
  ok: boolean;
  decision: TelegramPaymentEventDecision | "ignored_no_event";
  reason: string;
  event: TelegramPaymentEventRecord | null;
};

const TELEGRAM_PAYMENT_BOT_CHAT_SETTING_KEY = "telegram_payment_bot_chat_id";

function cleanEnv(input: string | undefined): string {
  return input?.trim().replace(/^"|"$/g, "") ?? "";
}

function normalizeName(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase().replace(/^@/, "");
}

function telegramAdminUsername(): string {
  const raw = cleanEnv(process.env.TELEGRAM_ADMIN_HANDLE);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return normalizeName(parsed.pathname.split("/").filter(Boolean).pop());
  } catch {
    return normalizeName(raw.replace(/^https?:\/\/t\.me\//i, ""));
  }
}

function splitEnvList(input: string | undefined): string[] {
  return cleanEnv(input)
    .split(",")
    .map((item) => normalizeName(item))
    .filter(Boolean);
}

function senderFullName(user: TelegramUser | undefined): string | null {
  if (!user) return null;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || null;
}

function getMessage(update: TelegramPaymentUpdate): TelegramMessage | null {
  return update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post ?? null;
}

async function rememberPrivateBotChat(message: TelegramMessage, chatId: string | null): Promise<boolean> {
  if (!chatId || message.chat?.type !== "private") return false;
  if (message.from?.is_bot) return false;

  const configuredAdmin = telegramAdminUsername();
  if (!configuredAdmin) return false;

  const senderUsername = normalizeName(message.from?.username);
  if (senderUsername !== configuredAdmin) return false;

  const existing = await getSystemSetting(TELEGRAM_PAYMENT_BOT_CHAT_SETTING_KEY, "");
  if (existing !== chatId) {
    await setSystemSetting(TELEGRAM_PAYMENT_BOT_CHAT_SETTING_KEY, chatId);
  }
  return true;
}

function isConfiguredGroup(chatId: string | null): boolean {
  const configured = cleanEnv(process.env.TELEGRAM_PAYMENT_GROUP_ID);
  if (!configured) return true;
  return chatId === configured;
}

function isAllowedSender(message: TelegramMessage): boolean {
  const allowed = splitEnvList(process.env.TELEGRAM_PAYMENT_ALLOWED_SENDERS);
  if (allowed.length === 0) return false;

  const user = message.from;
  const senderChat = message.sender_chat;
  const allowHumanSenders = cleanEnv(process.env.TELEGRAM_PAYMENT_ALLOW_HUMAN_SENDERS) === "true";
  const senderIsBot = Boolean(user?.is_bot) || Boolean(senderChat);
  if (!senderIsBot && !allowHumanSenders) return false;

  const values = [
    normalizeName(user?.username),
    normalizeName(senderFullName(user)),
    normalizeName(senderChat?.username),
    normalizeName(senderChat?.title),
  ].filter(Boolean);

  return allowed.some((allowedName) =>
    values.some((value) => value === allowedName || value.includes(allowedName) || allowedName.includes(value)),
  );
}

function amountMatches(order: PaymentOrderRecord, amount: number, currency: "USD" | "KHR"): boolean {
  if (order.khqrCurrency && order.khqrCurrency !== currency) return false;
  if (order.khqrAmount === null) return false;
  const tolerance = currency === "USD" ? 0.01 : 1;
  return Math.abs(order.khqrAmount - amount) <= tolerance;
}

async function matchPendingOrder(input: {
  rawText: string;
  amount: number | null;
  currency: "USD" | "KHR" | null;
}): Promise<{
  order: PaymentOrderRecord | null;
  reason: string | null;
}> {
  const pendingOrders = await listPaymentOrdersForAdmin("pending");
  const text = input.rawText.toLowerCase();

  const idMatches = pendingOrders.filter((order) => text.includes(order.id.toLowerCase()));
  if (idMatches.length === 1) return { order: idMatches[0], reason: null };
  if (idMatches.length > 1) return { order: null, reason: "MULTIPLE_ORDER_ID_MATCHES" };

  if (input.amount === null || input.currency === null) {
    return { order: null, reason: "MISSING_AMOUNT_OR_CURRENCY" };
  }

  const amountMatchesList = pendingOrders.filter((order) =>
    amountMatches(order, input.amount as number, input.currency as "USD" | "KHR"),
  );
  if (amountMatchesList.length === 1) return { order: amountMatchesList[0], reason: null };
  if (amountMatchesList.length > 1) return { order: null, reason: "MULTIPLE_PENDING_ORDER_MATCHES" };
  return { order: null, reason: "NO_PENDING_ORDER_MATCH" };
}

function buildRawPayload(update: TelegramPaymentUpdate): string {
  try {
    return JSON.stringify(update);
  } catch {
    return "{\"error\":\"unable_to_stringify_update\"}";
  }
}

export async function processTelegramPaymentUpdate(
  update: TelegramPaymentUpdate,
): Promise<TelegramPaymentProcessResult> {
  const message = getMessage(update);
  if (!message) {
    return { ok: true, decision: "ignored_no_event", reason: "NO_MESSAGE", event: null };
  }

  const rawText = (message.text ?? message.caption ?? "").trim();
  if (!rawText) {
    return { ok: true, decision: "ignored_no_event", reason: "NO_TEXT", event: null };
  }

  const chatId = message.chat?.id === undefined ? null : String(message.chat.id);
  if (await rememberPrivateBotChat(message, chatId)) {
    return { ok: true, decision: "ignored_no_event", reason: "PRIVATE_BOT_CHAT_SAVED", event: null };
  }

  if (!isConfiguredGroup(chatId)) {
    return { ok: true, decision: "ignored_no_event", reason: "CHAT_NOT_CONFIGURED", event: null };
  }

  const parsed = parseTelegramPaymentText(rawText);
  const senderAllowed = isAllowedSender(message);
  let decisionStatus: TelegramPaymentEventDecision = "needs_review";
  let decisionReason: string | null = null;
  let matchedOrder: PaymentOrderRecord | null = null;

  if (parsed.transactionId) {
    const duplicate = await findTelegramPaymentEventByTransactionId(parsed.transactionId);
    if (duplicate) {
      decisionStatus = "duplicate";
      decisionReason = "DUPLICATE_TRANSACTION";
      matchedOrder = duplicate.matchedOrderId
        ? ({ id: duplicate.matchedOrderId } as PaymentOrderRecord)
        : null;
    }
  }

  if (decisionStatus !== "duplicate") {
    const match = await matchPendingOrder({
      rawText,
      amount: parsed.amount,
      currency: parsed.currency,
    });
    matchedOrder = match.order;

    if (!senderAllowed) {
      decisionStatus = "needs_review";
      decisionReason = "SENDER_NOT_ALLOWED";
    } else if (parsed.status === "failed") {
      decisionStatus = "ignored";
      decisionReason = "PAYMENT_STATUS_FAILED";
    } else if (parsed.status !== "success") {
      decisionStatus = "needs_review";
      decisionReason = "PAYMENT_STATUS_UNKNOWN";
    } else if (!parsed.transactionId) {
      decisionStatus = "needs_review";
      decisionReason = "MISSING_TRANSACTION_ID";
    } else if (!matchedOrder) {
      decisionStatus = "needs_review";
      decisionReason = match.reason;
    } else {
      decisionStatus = "ready_to_approve";
      decisionReason = "MATCHED_PENDING_ORDER";
    }
  }

  const event = await createTelegramPaymentEvent({
    telegramUpdateId: update.update_id ?? null,
    telegramMessageId: message.message_id ?? null,
    chatId,
    chatTitle: message.chat?.title ?? null,
    senderId: message.from?.id === undefined ? null : String(message.from.id),
    senderUsername: message.from?.username ?? message.sender_chat?.username ?? null,
    senderName: senderFullName(message.from) ?? message.sender_chat?.title ?? null,
    senderIsBot: Boolean(message.from?.is_bot) || Boolean(message.sender_chat),
    rawText,
    rawPayload: buildRawPayload(update),
    parsedStatus: parsed.status,
    parsedAmount: parsed.amount,
    parsedCurrency: parsed.currency,
    parsedTransactionId: parsed.transactionId,
    parsedReference: parsed.reference,
    matchedOrderId: matchedOrder?.id ?? null,
    decisionStatus,
    decisionReason,
    autoApproveAttempted: false,
  });

  const autoApproveConfig = cleanEnv(process.env.TELEGRAM_PAYMENT_AUTO_APPROVE);
  const isAutoApproveTrue = autoApproveConfig === "true";
  let isBetaUser = false;
  if (autoApproveConfig === "beta" && matchedOrder) {
    const matchedEmail = (matchedOrder as { userEmail?: string }).userEmail?.trim().toLowerCase() || "";
    if (matchedEmail) {
      const betaEmails = splitEnvList(process.env.TELEGRAM_PAYMENT_BETA_EMAILS);
      isBetaUser = betaEmails.includes(matchedEmail);
    }
  }
  const shouldAutoApprove = isAutoApproveTrue || isBetaUser;

  if (decisionStatus === "ready_to_approve" && matchedOrder && parsed.amount !== null && parsed.currency && shouldAutoApprove) {
    const result = await confirmPaymentOrderPaid({
      orderId: matchedOrder.id,
      provider: "telegram_payway",
      providerTransactionId: parsed.transactionId,
      providerReference: parsed.reference,
      providerApprovalCode: null,
      providerStatusCode: "telegram_success",
      providerStatus: "success",
      providerAmount: parsed.amount,
      providerCurrency: parsed.currency,
      providerPayload: event.rawPayload,
      paidAt: message.date ? new Date(message.date * 1000).toISOString() : null,
    });

    const updated = await updateTelegramPaymentEventDecision({
      eventId: event.id,
      decisionStatus: result.ok ? "auto_approved" : "error",
      decisionReason: result.ok ? result.reason ?? "AUTO_APPROVED" : result.reason ?? "AUTO_APPROVE_FAILED",
      autoApproveAttempted: true,
    });

    return {
      ok: result.ok,
      decision: updated?.decisionStatus ?? "error",
      reason: updated?.decisionReason ?? "AUTO_APPROVE_FAILED",
      event: updated ?? event,
    };
  }

  return {
    ok: true,
    decision: event.decisionStatus,
    reason: event.decisionReason ?? "OK",
    event,
  };
}
