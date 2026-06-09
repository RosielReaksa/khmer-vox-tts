import { NextResponse } from "next/server";

import {
  checkPaywayTransactionById,
  normalizePaywayWebhook,
  parsePaywayBody,
  verifyPaywayWebhookSignature,
} from "@/lib/payway";
import { confirmPaymentOrderPaid, createPaymentWebhookEvent } from "@/lib/store";
import type {
  PaymentWebhookEventStatus,
  PaymentWebhookProvider,
} from "@/lib/types";

const provider: PaymentWebhookProvider = "payway";
const maxAuditTextLength = 200_000;

function auditText(input: string | null): string | null {
  if (input === null) return null;
  return input.length > maxAuditTextLength ? input.slice(0, maxAuditTextLength) : input;
}

function payloadJson(payload: unknown): string | null {
  try {
    return auditText(JSON.stringify(payload));
  } catch {
    return null;
  }
}

async function recordWebhookEvent(input: {
  rawBody: string;
  payload: unknown | null;
  normalized?: ReturnType<typeof normalizePaywayWebhook> | null;
  signatureConfigured: boolean;
  signatureValid: boolean;
  eventStatus: PaymentWebhookEventStatus;
  reason: string;
  paymentOrderId?: string | null;
}) {
  try {
    await createPaymentWebhookEvent({
      provider,
      orderId: input.normalized?.orderId ?? null,
      paymentOrderId: input.paymentOrderId ?? null,
      eventStatus: input.eventStatus,
      reason: input.reason,
      signatureValid: input.signatureValid,
      signatureConfigured: input.signatureConfigured,
      providerTransactionId: input.normalized?.providerTransactionId ?? null,
      providerReference: input.normalized?.providerReference ?? null,
      providerApprovalCode: input.normalized?.providerApprovalCode ?? null,
      providerStatusCode: input.normalized?.providerStatusCode ?? null,
      providerStatus: input.normalized?.providerStatus ?? null,
      providerAmount: input.normalized?.providerAmount ?? null,
      providerCurrency: input.normalized?.providerCurrency ?? null,
      providerPayload: input.payload ? payloadJson(input.payload) : null,
      rawBody: auditText(input.rawBody),
    });
  } catch (error) {
    console.error("[payway] Could not save webhook audit event", error);
  }
}

function webhookReason(resultReason: string | undefined): string {
  if (resultReason === "ORDER_ALREADY_APPROVED") return "DUPLICATE_ALREADY_APPROVED";
  return resultReason ?? "CREDITED";
}

export async function GET() {
  return NextResponse.json({ ok: true, webhook: "payway" });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload;

  try {
    payload = parsePaywayBody(rawBody, request.headers.get("content-type"));
  } catch {
    await recordWebhookEvent({
      rawBody,
      payload: null,
      signatureConfigured: false,
      signatureValid: false,
      eventStatus: "invalid",
      reason: "INVALID_BODY",
    });
    return NextResponse.json({ ok: false, error: "Invalid PayWay webhook body." }, { status: 400 });
  }

  const signature = verifyPaywayWebhookSignature({
    rawBody,
    payload,
    headers: request.headers,
  });
  if (!signature.valid) {
    await recordWebhookEvent({
      rawBody,
      payload,
      normalized: normalizePaywayWebhook(payload),
      signatureConfigured: signature.configured,
      signatureValid: false,
      eventStatus: "invalid",
      reason: signature.reason ?? "INVALID_SIGNATURE",
    });
    return NextResponse.json(
      { ok: false, error: signature.reason ?? "Invalid PayWay webhook signature." },
      { status: signature.configured ? 401 : 503 },
    );
  }

  const normalized = normalizePaywayWebhook(payload);
  if (!normalized.orderId) {
    await recordWebhookEvent({
      rawBody,
      payload,
      normalized,
      signatureConfigured: signature.configured,
      signatureValid: signature.valid,
      eventStatus: "not_credited",
      reason: "MISSING_ORDER_ID",
    });
    return NextResponse.json({ ok: false, error: "PayWay webhook missing merchant_ref/order id." });
  }

  if (!normalized.success) {
    await recordWebhookEvent({
      rawBody,
      payload,
      normalized,
      signatureConfigured: signature.configured,
      signatureValid: signature.valid,
      eventStatus: "not_credited",
      reason: "PAYMENT_NOT_SUCCESSFUL",
    });
    return NextResponse.json({
      ok: true,
      credited: false,
      orderId: normalized.orderId,
      status: normalized.providerStatus,
      statusCode: normalized.providerStatusCode,
      message: "Payment status is not successful, so no tokens were credited.",
    });
  }

  const checked =
    normalized.providerAmount === null || normalized.providerCurrency === null
      ? await checkPaywayTransactionById(normalized.providerTransactionId ?? normalized.orderId)
      : null;

  if (checked && checked.status !== "paid") {
    await recordWebhookEvent({
      rawBody,
      payload,
      normalized,
      signatureConfigured: signature.configured,
      signatureValid: signature.valid,
      eventStatus: "not_credited",
      reason: checked.status === "not_configured" ? "PAYWAY_CHECK_NOT_CONFIGURED" : "PAYWAY_CHECK_NOT_PAID",
    });
    return NextResponse.json({
      ok: true,
      credited: false,
      orderId: normalized.orderId,
      reason: checked.status,
      message: checked.message,
    });
  }

  const result = await confirmPaymentOrderPaid({
    orderId: normalized.orderId,
    provider: "payway",
    providerTransactionId: checked?.providerTransactionId ?? normalized.providerTransactionId,
    providerReference: checked?.providerReference ?? normalized.providerReference,
    providerApprovalCode: checked?.providerApprovalCode ?? normalized.providerApprovalCode,
    providerStatusCode: checked?.providerStatusCode ?? normalized.providerStatusCode,
    providerStatus: checked?.providerStatus ?? normalized.providerStatus,
    providerAmount: checked?.providerAmount ?? normalized.providerAmount!,
    providerCurrency: checked?.providerCurrency ?? normalized.providerCurrency!,
    providerPayload: checked?.providerPayload ?? JSON.stringify(payload),
    paidAt: checked?.paidAt ?? normalized.paidAt,
  });

  await recordWebhookEvent({
    rawBody,
    payload,
    normalized,
    signatureConfigured: signature.configured,
    signatureValid: signature.valid,
    eventStatus: result.ok && result.reason !== "ORDER_ALREADY_APPROVED" ? "credited" : "not_credited",
    reason: webhookReason(result.reason),
    paymentOrderId: result.order?.id ?? normalized.orderId,
  });

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      credited: false,
      reason: result.reason,
      message:
        result.reason === "ORDER_EXPIRED"
          ? "Payment matched an expired order. Tokens were not credited."
          : "Payment could not be credited automatically.",
      order: result.order,
    });
  }

  return NextResponse.json({
    ok: true,
    credited: result.reason !== "ORDER_ALREADY_APPROVED",
    reason: result.reason,
    order: result.order,
  });
}
