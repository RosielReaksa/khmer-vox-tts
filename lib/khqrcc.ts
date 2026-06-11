import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import "server-only";

import type { PaymentOrderRecord } from "@/lib/types";

export type KhqrccWebhookPayload = Record<string, unknown>;

export type NormalizedKhqrccWebhook = {
  orderId: string | null;
  success: boolean;
  providerTransactionId: string | null;
  providerReference: string | null;
  providerApprovalCode: string | null;
  providerStatusCode: string | null;
  providerStatus: string | null;
  providerAmount: number | null;
  providerCurrency: "USD" | "KHR" | null;
  paidAt: string | null;
};

export type KhqrccCheckout = {
  provider: "khqrcc";
  transactionId: string;
  payload: string;
  md5: string;
  imageDataUrl: string;
  currency: "USD" | "KHR";
  amount: number;
  amountLabel: string;
  expiresAt: string;
  raw: unknown;
};

export type KhqrccTransactionVerification =
  | {
      status: "paid";
      message: string;
      providerTransactionId: string;
      providerReference: string | null;
      providerApprovalCode: string | null;
      providerStatusCode: string | null;
      providerStatus: string | null;
      providerAmount: number;
      providerCurrency: "USD" | "KHR";
      providerPayload: string;
      paidAt: string | null;
    }
  | { status: "not_paid" | "not_configured" | "error"; message: string; raw?: unknown };

function cleanEnv(input: string | undefined): string {
  return input?.trim().replace(/^"|"$/g, "") ?? "";
}

function asString(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const value = String(input).trim();
  return value || null;
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function parseAmount(input: unknown): number | null {
  const raw = asString(input);
  if (!raw) return null;
  const amount = Number(raw.replaceAll(",", ""));
  return Number.isFinite(amount) ? amount : null;
}

function parseCurrency(input: unknown): "USD" | "KHR" | null {
  const currency = asString(input)?.toUpperCase();
  if (currency === "USD" || currency === "KHR") return currency;
  return null;
}

function parsePaidAt(input: unknown): string | null {
  const raw = asString(input);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function jsonBody(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return "{}";
  }
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function centsToUsd(totalPriceCents: number): string {
  return (totalPriceCents / 100).toFixed(2);
}

function formatAmount(amount: number, currency: "USD" | "KHR"): string {
  return currency === "USD" ? `$${amount.toFixed(2)}` : `${Math.round(amount).toLocaleString()} KHR`;
}

function khqrccProfileId(): string {
  return cleanEnv(process.env.KHQRCC_PROFILE_ID);
}

function khqrccSecretKey(): string {
  return cleanEnv(process.env.KHQRCC_SECRET_KEY || process.env.KHQRCC_PROFILE_KEY);
}

function khqrccBaseUrl(): string {
  return (cleanEnv(process.env.KHQRCC_API_BASE_URL) || "https://khqr.cc").replace(/\/+$/, "");
}

function khqrccQrApiUrl(): string {
  return `${khqrccBaseUrl()}/api/${encodeURIComponent(khqrccProfileId())}/payment-gateway/v1/payments/qr-api-khqrcc`;
}

function khqrccCheckV2Url(): string {
  return `${khqrccBaseUrl()}/api/${encodeURIComponent(khqrccProfileId())}/payment-gateway/v1/payments/check-transv2-khqrcc`;
}

function khqrccCheckUrl(): string {
  return `${khqrccBaseUrl()}/api/${encodeURIComponent(khqrccProfileId())}/payment-gateway/v1/payments/check-trans`;
}

function khqrccLifetimeMinutes(): number {
  const configured = Number(cleanEnv(process.env.KHQRCC_ORDER_LIFETIME_MINUTES));
  if (!Number.isFinite(configured)) return 5;
  return Math.max(1, Math.min(Math.round(configured), 30));
}

function khqrccSuccessUrl(orderId: string): string {
  const explicit = cleanEnv(process.env.KHQRCC_SUCCESS_URL || process.env.KHQRCC_WEBHOOK_URL);
  if (explicit) return explicit.replaceAll("{orderId}", orderId);

  const publicUrl = cleanEnv(process.env.APP_PUBLIC_URL) || "http://localhost:3000";
  try {
    const parsed = new URL(publicUrl);
    parsed.pathname = "/api/webhooks/khqrcc";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "http://localhost:3000/api/webhooks/khqrcc";
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function responseCode(raw: unknown): number | null {
  const value = asString(asRecord(raw).responseCode);
  if (value === null) return null;
  const code = Number(value);
  return Number.isFinite(code) ? code : null;
}

function responseMessage(raw: unknown): string | null {
  return asString(asRecord(raw).responseMessage);
}

function isSuccessStatus(input: unknown): boolean {
  const status = asString(input)?.toLowerCase();
  return status === "success" || status === "paid" || status === "approved";
}

function paymentDetails(raw: unknown): Record<string, unknown> {
  return asRecord(asRecord(raw).payment_details);
}

function verificationFromRaw(raw: unknown, transactionId: string): KhqrccTransactionVerification {
  const root = asRecord(raw);
  const data = asRecord(root.data);
  const details = paymentDetails(data);
  const status = asString(data.status);
  const code = responseCode(raw);

  if (code !== 0 || !isSuccessStatus(status)) {
    return {
      status: "not_paid",
      message: responseMessage(raw) ?? status ?? "KHQRcc has not confirmed this transaction yet.",
      raw,
    };
  }

  const providerAmount = parseAmount(data.amount ?? details.amount);
  const providerCurrency = parseCurrency(data.currency ?? details.currency) ?? "USD";
  if (providerAmount === null) {
    return {
      status: "error",
      message: "KHQRcc confirmed the transaction but did not return a payment amount.",
      raw,
    };
  }

  const externalRef = asString(details.externalRef ?? details.external_ref);
  const bakongHash = asString(details.bakonghash ?? details.bakongHash);

  return {
    status: "paid",
    message: "KHQRcc confirmed this transaction.",
    providerTransactionId: externalRef ?? asString(data.transaction_id) ?? transactionId,
    providerReference: bakongHash ?? externalRef ?? asString(details.sender),
    providerApprovalCode: externalRef ?? bakongHash,
    providerStatusCode: code === null ? null : String(code),
    providerStatus: status,
    providerAmount,
    providerCurrency,
    providerPayload: jsonBody(raw),
    paidAt: parsePaidAt(data.payment_date ?? details.date),
  };
}

async function postKhqrccForm(url: string, payload: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "Khmer Vox TTS KHQRcc",
    },
    body: new URLSearchParams(payload).toString(),
  });
  const raw = await readJsonResponse(response);
  if (!response.ok) {
    return {
      responseCode: responseCode(raw) ?? 1,
      responseMessage: responseMessage(raw) ?? `KHQRcc request failed with HTTP ${response.status}.`,
      data: asRecord(raw).data,
      raw,
    };
  }
  return raw;
}

export function isKhqrccConfigured(): boolean {
  return Boolean(khqrccProfileId() && khqrccSecretKey());
}

export function khqrccAccountLabel(): string {
  return cleanEnv(process.env.KHQRCC_DISPLAY_NAME) || "KHQRcc ABA Pay";
}

export function createKhqrccOrderId(): string {
  return `VX${Date.now().toString(36).toUpperCase()}${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`.slice(
    0,
    24,
  );
}

export async function createKhqrccQrCheckout(input: {
  orderId: string;
  totalPriceCents: number;
  planName: string;
  quantity: number;
  userEmail: string;
}): Promise<KhqrccCheckout> {
  const profileId = khqrccProfileId();
  const secretKey = khqrccSecretKey();
  if (!profileId || !secretKey) {
    throw new Error("KHQRCC_NOT_CONFIGURED");
  }

  const amount = centsToUsd(input.totalPriceCents);
  const successUrl = khqrccSuccessUrl(input.orderId);
  const remark = `${input.planName} x ${input.quantity} - ${input.userEmail}`.slice(0, 180);
  const hash = sha1(`${secretKey}${input.orderId}${amount}${successUrl}${remark}`);
  const raw = await postKhqrccForm(khqrccQrApiUrl(), {
    transaction_id: input.orderId,
    amount,
    success_url: successUrl,
    remark,
    hash,
  });

  const root = asRecord(raw);
  const code = responseCode(root);
  if (code !== 0) {
    throw new Error(`KHQRCC_QR_FAILED: ${responseMessage(root) ?? "KHQRcc could not create the QR invoice."}`);
  }

  const data = asRecord(root.data);
  const qrPayload = asString(data.qr);
  const qrUrl = asString(data.qr_url ?? data.qrUrl);
  if (!qrPayload || !qrUrl) {
    throw new Error("KHQRCC_QR_FAILED: KHQRcc response did not include a QR payload and QR image URL.");
  }

  const responseAmount = parseAmount(data.amount) ?? Number(amount);
  const responseCurrency = parseCurrency(data.currency) ?? "USD";
  const expiresAt = new Date(Date.now() + khqrccLifetimeMinutes() * 60 * 1000).toISOString();

  return {
    provider: "khqrcc",
    transactionId: input.orderId,
    payload: qrPayload,
    md5: asString(data.md5 ?? data.hash ?? data.transaction_id) ?? input.orderId,
    imageDataUrl: qrUrl,
    currency: responseCurrency,
    amount: responseAmount,
    amountLabel: formatAmount(responseAmount, responseCurrency),
    expiresAt,
    raw,
  };
}

export async function checkKhqrccTransactionById(transactionId: string): Promise<KhqrccTransactionVerification> {
  const profileId = khqrccProfileId();
  const secretKey = khqrccSecretKey();
  if (!profileId || !secretKey) {
    return {
      status: "not_configured",
      message: "KHQRCC_PROFILE_ID and KHQRCC_SECRET_KEY are required for KHQRcc transaction checks.",
    };
  }

  try {
    const hash = sha1(`${secretKey}${transactionId}`);
    const v2Raw = await postKhqrccForm(khqrccCheckV2Url(), {
      transaction_id: transactionId,
      hash,
    });
    const v2Data = asRecord(asRecord(v2Raw).data);
    if (responseCode(v2Raw) !== 0 || !isSuccessStatus(v2Data.status)) {
      return {
        status: "not_paid",
        message: responseMessage(v2Raw) ?? asString(v2Data.status) ?? "KHQRcc has not confirmed this transaction yet.",
        raw: v2Raw,
      };
    }

    const verifyRaw = await postKhqrccForm(khqrccCheckUrl(), {
      transaction_id: transactionId,
      hash,
    });
    const verified = verificationFromRaw(verifyRaw, transactionId);
    if (verified.status !== "paid") {
      return verified;
    }

    return {
      ...verified,
      providerPayload: jsonBody({ v2: v2Raw, verify: verifyRaw }),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message.slice(0, 220) : "Could not check KHQRcc transaction.",
    };
  }
}

export function checkKhqrccTransactionForOrder(order: PaymentOrderRecord): Promise<KhqrccTransactionVerification> {
  return checkKhqrccTransactionById(order.id);
}

export function parseKhqrccWebhookBody(rawBody: string, contentType: string | null): KhqrccWebhookPayload {
  const type = contentType?.toLowerCase() ?? "";
  if (type.includes("application/x-www-form-urlencoded") || rawBody.includes("=")) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }
  return JSON.parse(rawBody) as KhqrccWebhookPayload;
}

export function normalizeKhqrccWebhook(payload: KhqrccWebhookPayload): NormalizedKhqrccWebhook {
  const details = paymentDetails(payload);
  const providerStatus = asString(payload.status);
  const externalRef = asString(details.externalRef ?? details.external_ref);
  const bakongHash = asString(details.bakonghash ?? details.bakongHash);
  const providerCurrency = parseCurrency(payload.currency ?? details.currency) ?? (payload.amount ? "USD" : null);

  return {
    orderId: asString(payload.transaction_id ?? payload.order_id ?? payload.orderId),
    success: providerStatus?.toUpperCase() === "SUCCESS" || isSuccessStatus(providerStatus),
    providerTransactionId: externalRef ?? asString(payload.transaction_id),
    providerReference: bakongHash ?? externalRef ?? asString(details.sender),
    providerApprovalCode: externalRef ?? bakongHash,
    providerStatusCode: asString(payload.responseCode ?? payload.response_code),
    providerStatus,
    providerAmount: parseAmount(payload.amount ?? details.amount),
    providerCurrency,
    paidAt: parsePaidAt(payload.payment_date ?? details.date ?? payload.req_time),
  };
}

function amountCandidates(input: unknown): string[] {
  const raw = asString(input);
  if (!raw) return [];
  const amount = Number(raw.replaceAll(",", ""));
  return Array.from(
    new Set([
      raw,
      Number.isFinite(amount) ? amount.toFixed(2) : null,
      Number.isFinite(amount) ? String(amount) : null,
    ].filter((value): value is string => Boolean(value))),
  );
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left.toLowerCase());
  const b = Buffer.from(right.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyKhqrccWebhookSignature(payload: KhqrccWebhookPayload): {
  configured: boolean;
  valid: boolean;
  reason?: string;
} {
  const secretKey = khqrccSecretKey();
  if (!secretKey) {
    return {
      configured: false,
      valid: process.env.NODE_ENV !== "production",
      reason: "KHQRCC_SECRET_KEY is not configured.",
    };
  }

  const signature = asString(payload.hash);
  if (!signature) return { configured: true, valid: false, reason: "Missing KHQRcc webhook hash." };

  const reqTime = asString(payload.req_time);
  const transactionId = asString(payload.transaction_id);
  const status = asString(payload.status);
  if (!reqTime || !transactionId || !status) {
    return { configured: true, valid: false, reason: "Missing KHQRcc webhook signature fields." };
  }

  const statuses = Array.from(new Set([status, status.toUpperCase()]));
  const candidates = amountCandidates(payload.amount).flatMap((amount) =>
    statuses.map((candidateStatus) => sha256(`${secretKey}${reqTime}${transactionId}${amount}${candidateStatus}`)),
  );

  return {
    configured: true,
    valid: candidates.some((candidate) => safeEqual(candidate, signature)),
  };
}
