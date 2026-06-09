import "server-only";

import { formatUsd } from "@/lib/plans";
import { paymentMethodLabel } from "@/lib/payment-method-label";
import {
  paymentApprovalReplyMarkup,
  paymentApprovalTelegramToken,
  resolvePaymentNotificationTelegramChatId,
} from "@/lib/telegram-payment-actions";
import type { PaymentOrderRecord, PaymentSupportTicketRecord } from "@/lib/types";

type TelegramNotifyResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "failed" };

function cleanEnv(input: string | undefined): string {
  return input?.trim().replace(/^"|"$/g, "") ?? "";
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildAdminUrl(orderId: string): string {
  const baseUrl = cleanEnv(process.env.APP_PUBLIC_URL);
  if (!baseUrl) return "/app/admin/payments";
  return `${baseUrl.replace(/\/$/, "")}/app/admin/payments#${encodeURIComponent(orderId)}`;
}

function buildSupportAdminUrl(ticketId: string): string {
  const baseUrl = cleanEnv(process.env.APP_PUBLIC_URL);
  if (!baseUrl) return "/app/admin/payment-support";
  return `${baseUrl.replace(/\/$/, "")}/app/admin/payment-support#${encodeURIComponent(ticketId)}`;
}

function paymentOrderCreatedReplyMarkup(orderId: string) {
  return {
    inline_keyboard: [
      [
        { text: "Open Admin", url: buildAdminUrl(orderId) },
      ],
    ],
  };
}

function formatKhqrAmount(order: PaymentOrderRecord): string {
  if (order.khqrAmount === null || !order.khqrCurrency) return "-";
  return order.khqrCurrency === "USD"
    ? `$${order.khqrAmount.toFixed(2)}`
    : `${Math.round(order.khqrAmount).toLocaleString()} KHR`;
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; extension: string } | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const bytes = Buffer.from(match[2], "base64");
  return {
    blob: new Blob([bytes], { type: mimeType }),
    extension,
  };
}

async function telegramRequest(path: string, init: RequestInit, tokenOverride?: string): Promise<boolean> {
  const token = tokenOverride?.trim() || cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  if (!token) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${path}`, {
      ...init,
      signal: AbortSignal.timeout(12000),
    });
    return response.ok;
  } catch (err) {
    console.error(`[Telegram Request Error] ${path} failed/timed out:`, err);
    return false;
  }
}

export async function notifyPaymentOrderToTelegram(input: {
  order: PaymentOrderRecord;
  userEmail: string;
}): Promise<TelegramNotifyResult> {
  const chatId = await resolvePaymentNotificationTelegramChatId();
  const token = paymentApprovalTelegramToken();
  if (!chatId || !token) {
    return { sent: false, reason: "not_configured" };
  }

  const { order, userEmail } = input;
  const lines = [
    "<b>New KHQR payment order</b>",
    `Order ID: <code>${escapeHtml(order.id)}</code>`,
    `User: ${escapeHtml(userEmail)}`,
    `Plan: ${escapeHtml(order.planName)} x ${order.quantity}`,
    `Total: ${escapeHtml(formatUsd(order.totalPriceCents))}`,
    `Tokens: ${order.tokens.toLocaleString()}`,
    `Payment method: ${escapeHtml(paymentMethodLabel(order))}`,
    `KHQR amount: ${escapeHtml(order.khqrAmount ? `${order.khqrAmount} ${order.khqrCurrency ?? ""}` : "-")}`,
    `KHQR hash: ${escapeHtml(order.khqrMd5 || order.paymentReference || "-")}`,
    `Expires: ${escapeHtml(order.khqrExpiresAt ? new Date(order.khqrExpiresAt).toLocaleString() : "-")}`,
    `Note: ${escapeHtml(order.userNote || "-")}`,
    `Proof image: ${order.proofImageDataUrl ? "uploaded" : "not uploaded"}`,
    `Admin: ${escapeHtml(buildAdminUrl(order.id))}`,
  ];

  try {
    const textSent = await telegramRequest("sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: paymentOrderCreatedReplyMarkup(order.id),
      }),
    }, token);

    if (order.proofImageDataUrl) {
      const image = dataUrlToBlob(order.proofImageDataUrl);
      if (image) {
        const formData = new FormData();
        formData.set("chat_id", chatId);
        formData.set("caption", `Payment proof for ${order.id}`);
        formData.set("photo", image.blob, `payment-proof-${order.id}.${image.extension}`);
        await telegramRequest("sendPhoto", {
          method: "POST",
          body: formData,
        }, token);
      }
    }

    return textSent ? { sent: true } : { sent: false, reason: "failed" };
  } catch {
    return { sent: false, reason: "failed" };
  }
}

export async function notifyPaymentProofToTelegram(input: {
  order: PaymentOrderRecord;
  userEmail: string;
}): Promise<TelegramNotifyResult> {
  const chatId = await resolvePaymentNotificationTelegramChatId();
  const token = paymentApprovalTelegramToken();
  if (!chatId || !token) {
    return { sent: false, reason: "not_configured" };
  }

  const { order, userEmail } = input;
  const rawNote = order.userNote || "-";
  const userNote = rawNote.length > 200 ? `${rawNote.slice(0, 197)}...` : rawNote;

  const lines = [
    "<b>User marked payment as paid</b>",
    `Order ID: <code>${escapeHtml(order.id)}</code>`,
    `User: ${escapeHtml(userEmail)}`,
    `Plan: ${escapeHtml(order.planName)} x ${order.quantity}`,
    `Total: ${escapeHtml(formatUsd(order.totalPriceCents))}`,
    `Tokens: ${order.tokens.toLocaleString()}`,
    `Payment method: ${escapeHtml(paymentMethodLabel(order))}`,
    `Payment reference: ${escapeHtml(order.paymentReference || order.providerReference || "-")}`,
    `Provider: ${escapeHtml(order.paymentProvider || "-")}`,
    `Status: ${escapeHtml(order.providerStatus || order.status)}`,
    `Note: ${escapeHtml(userNote)}`,
    `Admin: ${escapeHtml(buildAdminUrl(order.id))}`,
  ];

  try {
    const textContent = lines.join("\n");

    if (order.proofImageDataUrl) {
      const image = dataUrlToBlob(order.proofImageDataUrl);
      if (image) {
        const formData = new FormData();
        formData.set("chat_id", chatId);
        formData.set("caption", textContent);
        formData.set("photo", image.blob, `payment-proof-${order.id}.${image.extension}`);
        formData.set("parse_mode", "HTML");
        formData.set("reply_markup", JSON.stringify(paymentApprovalReplyMarkup(order.id)));
        const sentPhoto = await telegramRequest("sendPhoto", {
          method: "POST",
          body: formData,
        }, token);
        if (sentPhoto) {
          return { sent: true };
        }
      }
    }

    // Fallback or send text-only if there's no proof image
    const sentText = await telegramRequest("sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: textContent,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: paymentApprovalReplyMarkup(order.id),
      }),
    }, token);

    return sentText ? { sent: true } : { sent: false, reason: "failed" };
  } catch {
    return { sent: false, reason: "failed" };
  }
}

export async function notifyPaymentSupportTicketToTelegram(input: {
  ticket: PaymentSupportTicketRecord;
  order: PaymentOrderRecord;
  userEmail: string;
}): Promise<TelegramNotifyResult> {
  const chatId = await resolvePaymentNotificationTelegramChatId();
  const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  if (!chatId || !token) {
    return { sent: false, reason: "not_configured" };
  }

  const { ticket, order, userEmail } = input;
  const lines = [
    "<b>New payment support ticket</b>",
    `Ticket ID: <code>${escapeHtml(ticket.id)}</code>`,
    `Order ID: <code>${escapeHtml(order.id)}</code>`,
    `User: ${escapeHtml(userEmail)}`,
    `Order status: ${escapeHtml(order.status)}`,
    `Plan: ${escapeHtml(order.planName)} x ${order.quantity}`,
    `Total: ${escapeHtml(formatUsd(order.totalPriceCents))}`,
    `Tokens: ${order.tokens.toLocaleString()}`,
    `Payment method: ${escapeHtml(paymentMethodLabel(order))}`,
    `KHQR amount: ${escapeHtml(formatKhqrAmount(order))}`,
    `KHQR hash: ${escapeHtml(order.khqrMd5 || order.paymentReference || "-")}`,
    `Provider transaction: ${escapeHtml(order.providerTransactionId || order.providerReference || "-")}`,
    `User note: ${escapeHtml(order.userNote || "-")}`,
    `Support message: ${escapeHtml(ticket.userMessage)}`,
    `Support admin: ${escapeHtml(buildSupportAdminUrl(ticket.id))}`,
    `Payment admin: ${escapeHtml(buildAdminUrl(order.id))}`,
  ];

  try {
    const sent = await telegramRequest("sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    return sent ? { sent: true } : { sent: false, reason: "failed" };
  } catch {
    return { sent: false, reason: "failed" };
  }
}

export async function sendTelegramAdminTestMessage(): Promise<TelegramNotifyResult> {
  const chatId = await resolvePaymentNotificationTelegramChatId();
  const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  if (!chatId || !token) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const sent = await telegramRequest("sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: [
          "<b>Khmer Vox TTS system test</b>",
          "Telegram alerts are connected.",
          `Time: ${escapeHtml(new Date().toISOString())}`,
        ].join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    return sent ? { sent: true } : { sent: false, reason: "failed" };
  } catch {
    return { sent: false, reason: "failed" };
  }
}
