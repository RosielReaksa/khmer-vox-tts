import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import "server-only";

import type { PaymentOrderRecord } from "@/lib/types";

export type PaywayWebhookPayload = Record<string, unknown>;

export type NormalizedPaywayWebhook = {
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

export type PaywayCheckout = {
  provider: "payway";
  tranId: string;
  payload: string;
  md5: string;
  imageDataUrl: string;
  currency: "USD" | "KHR";
  amount: number;
  amountLabel: string;
  expiresAt: string;
  deeplink: string | null;
  raw: unknown;
};

export type PaywayTransactionVerification =
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

function statusCode(input: unknown): string | null {
  return asString(asRecord(input).code);
}

function statusMessage(input: unknown): string | null {
  return asString(asRecord(input).message);
}

function successFromStatus(code: string | null, status: string | null): boolean {
  const normalizedCode = code?.trim().toLowerCase();
  const normalizedStatus = status?.trim().toLowerCase();
  return (
    normalizedCode === "0" ||
    normalizedCode === "00" ||
    normalizedCode === "success" ||
    normalizedStatus === "0" ||
    normalizedStatus === "00" ||
    normalizedStatus === "success" ||
    normalizedStatus === "approved" ||
    normalizedStatus === "paid"
  );
}

function paywayMerchantId(): string {
  return cleanEnv(process.env.PAYWAY_MERCHANT_ID);
}

function paywayApiKey(): string {
  return cleanEnv(process.env.PAYWAY_API_KEY || process.env.PAYWAY_PUBLIC_KEY);
}

function paywayBaseUrl(): string {
  const explicit = cleanEnv(process.env.PAYWAY_API_BASE_URL);
  if (explicit) return explicit.replace(/\/+$/, "");

  const qrUrl = cleanEnv(process.env.PAYWAY_QR_API_URL);
  if (qrUrl) {
    try {
      const parsed = new URL(qrUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return "https://checkout-sandbox.payway.com.kh";
    }
  }

  const env = cleanEnv(process.env.PAYWAY_ENV).toLowerCase();
  return env === "production" ? "https://checkout.payway.com.kh" : "https://checkout-sandbox.payway.com.kh";
}

function paywayQrUrl(): string {
  return cleanEnv(process.env.PAYWAY_QR_API_URL) || `${paywayBaseUrl()}/api/payment-gateway/v1/payments/generate-qr`;
}

function paywayCheckUrl(): string {
  return cleanEnv(process.env.PAYWAY_CHECK_API_URL) || `${paywayBaseUrl()}/api/payment-gateway/v1/payments/check-transaction-2`;
}

function utcRequestTime(date = new Date()): string {
  return date.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

function hmacSha512Base64(secret: string, values: Array<string | number | null | undefined>): string {
  const message = values
    .filter((value) => value !== null && value !== undefined)
    .map(String)
    .join("");
  return createHmac("sha512", secret).update(message).digest("base64");
}

function base64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

function centsToUsd(totalPriceCents: number): number {
  return Number((totalPriceCents / 100).toFixed(2));
}

function formatPaywayAmount(amount: number, currency: "USD" | "KHR"): string {
  return currency === "USD" ? `$${amount.toFixed(2)}` : `${Math.round(amount).toLocaleString()} KHR`;
}

function paywayCallbackUrl(): string | null {
  const explicit = cleanEnv(process.env.PAYWAY_CALLBACK_URL);
  if (explicit) return explicit;

  const publicUrl = cleanEnv(process.env.APP_PUBLIC_URL);
  if (!publicUrl) return null;
  try {
    const parsed = new URL(publicUrl);
    if (parsed.protocol !== "https:") return null;
    parsed.pathname = "/api/webhooks/payway";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function paywayLifetimeMinutes(): number {
  const configured = Number(cleanEnv(process.env.PAYWAY_QR_LIFETIME_MINUTES));
  if (!Number.isFinite(configured)) return 20;
  return Math.max(1, Math.min(Math.round(configured), 60));
}

function normalizeImageDataUrl(input: unknown): string | null {
  const image = asString(input);
  if (!image) return null;
  return image.startsWith("data:image/") ? image : `data:image/png;base64,${image}`;
}

function jsonBody(input: unknown): string {
  try {
    return JSON.stringify(input);
  } catch {
    return "{}";
  }
}

function paymentStatusFromCheckResponse(raw: unknown): {
  providerStatusCode: string | null;
  providerStatus: string | null;
  providerAmount: number | null;
  providerCurrency: "USD" | "KHR" | null;
  providerApprovalCode: string | null;
  providerReference: string | null;
  paidAt: string | null;
} {
  const root = asRecord(raw);
  const data = asRecord(root.data);

  return {
    providerStatusCode: asString(data.payment_status_code ?? root.payment_status_code ?? statusCode(root.status)),
    providerStatus: asString(data.payment_status ?? root.payment_status ?? root.description ?? statusMessage(root.status)),
    providerAmount: parseAmount(data.original_amount ?? data.payment_amount ?? root.original_amount ?? root.payment_amount),
    providerCurrency: parseCurrency(data.payment_currency ?? data.original_currency ?? root.payment_currency ?? root.original_currency),
    providerApprovalCode: asString(data.apv ?? root.apv),
    providerReference: asString(data.bank_ref ?? root.bank_ref ?? root.reference),
    paidAt: parsePaidAt(data.transaction_date ?? root["transaction date"] ?? root.transaction_date),
  };
}

export function isPaywayQrEnabled(): boolean {
  const mode = cleanEnv(process.env.PAYMENT_CHECKOUT_MODE).toLowerCase();
  if (mode === "local_khqr" || mode === "static_payway_qr") {
    return false;
  }
  if (mode === "payway_qr") {
    return true;
  }
  return cleanEnv(process.env.PAYWAY_QR_ENABLED).toLowerCase() === "true";
}

export function isPaywayQrConfigured(): boolean {
  return Boolean(paywayMerchantId() && paywayApiKey());
}

export function createPaywayOrderId(): string {
  return `VX${Date.now().toString(36).toUpperCase()}${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`.slice(
    0,
    20,
  );
}

export async function createPaywayQrCheckout(input: {
  orderId: string;
  totalPriceCents: number;
  planName: string;
  quantity: number;
  userEmail: string;
}): Promise<PaywayCheckout> {
  const merchantId = paywayMerchantId();
  const apiKey = paywayApiKey();
  if (!merchantId || !apiKey) {
    throw new Error("PAYWAY_QR_NOT_CONFIGURED");
  }

  const amount = centsToUsd(input.totalPriceCents);
  const currency = "USD" as const;
  const reqTime = utcRequestTime();
  const lifetime = paywayLifetimeMinutes();
  const expiresAt = new Date(Date.now() + lifetime * 60 * 1000).toISOString();
  const items = base64(
    JSON.stringify([
      {
        name: input.planName,
        quantity: input.quantity,
        price: amount,
      },
    ]),
  );
  const callbackUrl = paywayCallbackUrl();
  const payload: Record<string, string | number> = {
    req_time: reqTime,
    merchant_id: merchantId,
    tran_id: input.orderId,
    first_name: "Khmer",
    last_name: "Vox",
    email: input.userEmail,
    phone: cleanEnv(process.env.PAYWAY_CUSTOMER_PHONE),
    amount,
    purchase_type: "purchase",
    payment_option: "abapay_khqr",
    items,
    currency,
    return_params: input.orderId,
    lifetime,
    qr_image_template: cleanEnv(process.env.PAYWAY_QR_IMAGE_TEMPLATE) || "template3_color",
  };
  if (callbackUrl) {
    payload.callback_url = base64(callbackUrl);
  }

  payload.hash = hmacSha512Base64(apiKey, [
    payload.req_time,
    payload.merchant_id,
    payload.tran_id,
    payload.amount,
    payload.items,
    payload.first_name,
    payload.last_name,
    payload.email,
    payload.phone,
    payload.purchase_type,
    payload.payment_option,
    payload.callback_url,
    payload.currency,
    payload.return_params,
    payload.lifetime,
    payload.qr_image_template,
  ]);

  const response = await fetch(paywayQrUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Khmer Vox TTS PayWay QR",
    },
    body: JSON.stringify(payload),
  });
  const raw = (await response.json().catch(async () => ({ raw: await response.text() }))) as Record<string, unknown>;
  const code = statusCode(raw.status);
  if (!response.ok || code !== "0") {
    const message = statusMessage(raw.status) ?? `PayWay QR request failed with HTTP ${response.status}.`;
    throw new Error(`PAYWAY_QR_FAILED: ${message}`);
  }

  const qrPayload = asString(raw.qrString ?? raw.qr_string);
  const imageDataUrl = normalizeImageDataUrl(raw.qrImage ?? raw.qr_image);
  if (!qrPayload || !imageDataUrl) {
    throw new Error("PAYWAY_QR_FAILED: PayWay response did not include QR payload and image.");
  }

  const responseAmount = parseAmount(raw.amount) ?? amount;
  const responseCurrency = parseCurrency(raw.currency) ?? currency;
  const reference = asString(asRecord(raw.status).trace_id) ?? input.orderId;

  return {
    provider: "payway",
    tranId: input.orderId,
    payload: qrPayload,
    md5: reference,
    imageDataUrl,
    currency: responseCurrency,
    amount: responseAmount,
    amountLabel: formatPaywayAmount(responseAmount, responseCurrency),
    expiresAt,
    deeplink: asString(raw.abapay_deeplink),
    raw,
  };
}

export async function checkPaywayTransactionById(tranId: string): Promise<PaywayTransactionVerification> {
  const merchantId = paywayMerchantId();
  const apiKey = paywayApiKey();
  if (!merchantId || !apiKey) {
    return {
      status: "not_configured",
      message: "PAYWAY_MERCHANT_ID and PAYWAY_API_KEY are required for PayWay transaction checks.",
    };
  }

  const reqTime = utcRequestTime();
  const payload = {
    req_time: reqTime,
    merchant_id: merchantId,
    tran_id: tranId,
    hash: hmacSha512Base64(apiKey, [reqTime, merchantId, tranId]),
  };

  try {
    const response = await fetch(paywayCheckUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Khmer Vox TTS PayWay Check",
      },
      body: JSON.stringify(payload),
    });
    const raw = (await response.json().catch(async () => ({ raw: await response.text() }))) as Record<string, unknown>;
    const check = paymentStatusFromCheckResponse(raw);
    const success = successFromStatus(check.providerStatusCode, check.providerStatus);
    if (!response.ok || !success) {
      return {
        status: "not_paid",
        message: check.providerStatus ?? statusMessage(raw.status) ?? "PayWay has not approved this transaction yet.",
        raw,
      };
    }
    if (check.providerAmount === null || check.providerCurrency === null) {
      return {
        status: "error",
        message: "PayWay approved the transaction but did not return amount/currency.",
        raw,
      };
    }

    return {
      status: "paid",
      message: "PayWay confirmed this transaction.",
      providerTransactionId: tranId,
      providerReference: check.providerReference,
      providerApprovalCode: check.providerApprovalCode,
      providerStatusCode: check.providerStatusCode,
      providerStatus: check.providerStatus,
      providerAmount: check.providerAmount,
      providerCurrency: check.providerCurrency,
      providerPayload: jsonBody(raw),
      paidAt: check.paidAt,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message.slice(0, 220) : "Could not check PayWay transaction.",
    };
  }
}

export function checkPaywayTransactionForOrder(order: PaymentOrderRecord): Promise<PaywayTransactionVerification> {
  return checkPaywayTransactionById(order.id);
}

export function parsePaywayBody(rawBody: string, contentType: string | null): PaywayWebhookPayload {
  const type = contentType?.toLowerCase() ?? "";
  if (type.includes("application/json")) {
    return JSON.parse(rawBody) as PaywayWebhookPayload;
  }

  if (type.includes("application/x-www-form-urlencoded") || rawBody.includes("=")) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  return JSON.parse(rawBody) as PaywayWebhookPayload;
}

export function normalizePaywayWebhook(payload: PaywayWebhookPayload): NormalizedPaywayWebhook {
  const providerStatusCode = asString(
    payload.payment_status_code ?? payload.status_code ?? payload.response_code ?? payload.status,
  );
  const providerStatus = asString(
    payload.payment_status ?? payload.status_description ?? payload.response_message ?? payload.status,
  );

  return {
    orderId: asString(
      payload.merchant_ref ??
        payload.merchant_ref_no ??
        payload.return_params ??
        payload.return_param ??
        payload.order_id ??
        payload.orderId ??
        payload.tran_id,
    ),
    success: successFromStatus(providerStatusCode, providerStatus),
    providerTransactionId: asString(payload.transaction_id ?? payload.tran_id ?? payload.tranId),
    providerReference: asString(payload.bank_ref ?? payload.reference ?? payload.payment_ref ?? payload.ref),
    providerApprovalCode: asString(payload.apv ?? payload.approval_code ?? payload.approvalCode),
    providerStatusCode,
    providerStatus,
    providerAmount: parseAmount(payload.original_amount ?? payload.payment_amount ?? payload.amount),
    providerCurrency: parseCurrency(payload.original_currency ?? payload.payment_currency ?? payload.currency),
    paidAt: parsePaidAt(payload.transaction_date ?? payload.payment_date ?? payload.req_time ?? payload.created_at),
  };
}

function hmacVariants(secret: string, value: string): string[] {
  const hmac = createHmac("sha512", secret).update(value).digest();
  return [hmac.toString("base64"), hmac.toString("hex")];
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function canonicalSortedValues(payload: PaywayWebhookPayload): string {
  return Object.entries(payload)
    .filter(([key, value]) => key.toLowerCase() !== "hash" && value !== null && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => {
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    })
    .join("");
}

function webhookSecrets(): string[] {
  return Array.from(
    new Set([cleanEnv(process.env.PAYWAY_WEBHOOK_SECRET), paywayApiKey()].filter(Boolean)),
  );
}

export function verifyPaywayWebhookSignature(input: {
  rawBody: string;
  payload: PaywayWebhookPayload;
  headers: Headers;
}): { configured: boolean; valid: boolean; reason?: string } {
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    return {
      configured: false,
      valid: process.env.NODE_ENV !== "production",
      reason: "PAYWAY_WEBHOOK_SECRET or PAYWAY_API_KEY is not configured.",
    };
  }

  const signature =
    input.headers.get("x-payway-hmac-sha512") ??
    input.headers.get("x-payway-signature") ??
    input.headers.get("x-aba-payway-signature") ??
    asString(input.payload.hash);

  if (!signature) {
    return { configured: true, valid: false, reason: "Missing PayWay signature." };
  }

  const candidates = secrets.flatMap((secret) => [
    ...hmacVariants(secret, input.rawBody),
    ...hmacVariants(secret, canonicalSortedValues(input.payload)),
  ]);

  return {
    configured: true,
    valid: candidates.some((candidate) => safeEqual(candidate, signature)),
  };
}
