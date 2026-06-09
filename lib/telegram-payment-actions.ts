import { createHmac, timingSafeEqual } from "node:crypto";
import "server-only";

import { formatUsd } from "@/lib/plans";
import { paymentMethodLabel } from "@/lib/payment-method-label";
import {
  findUserByEmail,
  getSystemSetting,
  listCustomersForAdmin,
  type PaymentOrderWithUser,
} from "@/lib/store";
import type { PaymentOrderRecord } from "@/lib/types";

const CALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_PAYMENT_BOT_CHAT_SETTING_KEY = "telegram_payment_bot_chat_id";

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function secret(): string {
  const configured = cleanEnv("TELEGRAM_ACTION_SECRET") || cleanEnv("SESSION_SECRET");
  if (!configured || configured === "dev_only_change_me" || configured.length < 24) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("TELEGRAM_ACTION_SECRET or SESSION_SECRET must be configured for Telegram payment actions.");
    }
    return "dev_only_telegram_action_secret";
  }
  return configured;
}

function signature(input: string): string {
  return createHmac("sha256", secret()).update(input).digest("base64url").slice(0, 16);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createPaymentApprovalCallbackData(orderId: string): string {
  const ts = Math.floor(Date.now() / 1000).toString(36);
  const body = `approve:${orderId}:${ts}`;
  return `pa:${orderId}:${ts}:${signature(body)}`;
}

export function verifyPaymentApprovalCallbackData(input: string): {
  ok: true;
  orderId: string;
} | {
  ok: false;
  reason: "INVALID_ACTION" | "INVALID_TOKEN" | "EXPIRED";
  orderId: string | null;
} {
  const parts = input.split(":");
  if (parts.length !== 4 || parts[0] !== "pa") {
    return { ok: false, reason: "INVALID_ACTION", orderId: null };
  }
  const [, orderId, ts, sig] = parts;
  if (!orderId || !ts || !sig) return { ok: false, reason: "INVALID_TOKEN", orderId: orderId || null };

  const unixSeconds = Number.parseInt(ts, 36);
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return { ok: false, reason: "INVALID_TOKEN", orderId };
  }
  if (Date.now() - unixSeconds * 1000 > CALLBACK_MAX_AGE_MS) {
    return { ok: false, reason: "EXPIRED", orderId };
  }

  const expected = signature(`approve:${orderId}:${ts}`);
  if (!safeEqual(sig, expected)) return { ok: false, reason: "INVALID_TOKEN", orderId };
  return { ok: true, orderId };
}

export function paymentApprovalTelegramToken(): string {
  return cleanEnv("PAYMENT_APPROVAL_TELEGRAM_BOT_TOKEN") || cleanEnv("TELEGRAM_BOT_TOKEN");
}

export function paymentApprovalTelegramChatId(): string {
  return cleanEnv("PAYMENT_APPROVAL_TELEGRAM_CHAT_ID") || cleanEnv("TELEGRAM_PAYMENT_GROUP_ID") || cleanEnv("TELEGRAM_CHAT_ID");
}

export function paymentNotificationTelegramChatId(): string {
  return cleanEnv("TELEGRAM_PAYMENT_BOT_CHAT_ID");
}

export async function resolvePaymentNotificationTelegramChatId(): Promise<string> {
  const configured = paymentNotificationTelegramChatId();
  if (configured) return configured;

  const stored = await getSystemSetting(TELEGRAM_PAYMENT_BOT_CHAT_SETTING_KEY, "");
  if (stored) return stored;

  const fallback = cleanEnv("TELEGRAM_CHAT_ID");
  const paymentGroup = cleanEnv("TELEGRAM_PAYMENT_GROUP_ID");
  if (fallback && fallback !== paymentGroup) return fallback;

  return "";
}

export function paymentApprovalWebhookSecret(): string {
  return cleanEnv("PAYMENT_APPROVAL_TELEGRAM_WEBHOOK_SECRET") || cleanEnv("TELEGRAM_WEBHOOK_SECRET");
}

function paymentApprovalAdminIds(): string[] {
  return cleanEnv("PAYMENT_APPROVAL_TELEGRAM_ADMIN_IDS")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasTelegramPaymentAdminAllowlist(): boolean {
  return paymentApprovalAdminIds().length > 0;
}

export function isAllowedTelegramPaymentAdmin(userId: string | null | undefined): boolean {
  const allowed = paymentApprovalAdminIds();
  if (allowed.length === 0 || !userId) return false;
  return allowed.includes(userId);
}

export function isConfiguredPaymentApprovalChat(chatId: string | null | undefined): boolean {
  if (!chatId) return false;
  const configured = [
    cleanEnv("PAYMENT_APPROVAL_TELEGRAM_CHAT_ID"),
    cleanEnv("TELEGRAM_PAYMENT_GROUP_ID"),
    cleanEnv("TELEGRAM_CHAT_ID"),
  ]
    .flatMap((value) => value.split(/[,\s]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(chatId);
}

export async function resolvePaymentApprovalAdminUserId(): Promise<string | null> {
  const emails = cleanEnv("ADMIN_EMAILS")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    const user = await findUserByEmail(email);
    if (user) return user.id;
  }
  if (process.env.NODE_ENV !== "production") {
    const customers = await listCustomersForAdmin();
    return customers[0]?.user.id ?? null;
  }
  return null;
}

export function paymentApprovalReplyMarkup(orderId: string) {
  const adminUrl = buildAdminUrl(orderId);
  return {
    inline_keyboard: [
      [
        { text: "Approve", callback_data: createPaymentApprovalCallbackData(orderId) },
        { text: "Open Admin", url: adminUrl },
      ],
    ],
  };
}

export function buildAdminUrl(orderId: string): string {
  const baseUrl = cleanEnv("APP_PUBLIC_URL");
  if (!baseUrl) return `/app/admin/payments#${encodeURIComponent(orderId)}`;
  return `${baseUrl.replace(/\/$/, "")}/app/admin/payments#${encodeURIComponent(orderId)}`;
}

export function formatPaymentApprovalMessage(input: {
  order: PaymentOrderRecord | PaymentOrderWithUser;
  userEmail: string;
  title: string;
  statusLine?: string;
}): string {
  const { order, userEmail } = input;
  const lines = [
    `<b>${escapeHtml(input.title)}</b>`,
    `Order ID: <code>${escapeHtml(order.id)}</code>`,
    `User: ${escapeHtml(userEmail)}`,
    `Plan: ${escapeHtml(order.planName)} x ${order.quantity}`,
    `Total: ${escapeHtml(formatUsd(order.totalPriceCents))}`,
    `Tokens: ${order.tokens.toLocaleString()}`,
    `Payment method: ${escapeHtml(paymentMethodLabel(order))}`,
    `KHQR amount: ${escapeHtml(order.khqrAmount ? `${order.khqrAmount} ${order.khqrCurrency ?? ""}` : "-")}`,
    `KHQR hash: ${escapeHtml(order.khqrMd5 || order.paymentReference || "-")}`,
    `Status: ${escapeHtml(order.status)}`,
  ];
  if (input.statusLine) lines.push(escapeHtml(input.statusLine));
  lines.push(`Admin: ${escapeHtml(buildAdminUrl(order.id))}`);
  return lines.join("\n");
}
