import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createKhqrCheckout } from "@/lib/khqr";
import { invalidateDashboardCountCache } from "@/lib/dashboard-count-cache";
import { createPaywayOrderId, createPaywayQrCheckout, isPaywayQrEnabled } from "@/lib/payway";
import { PAYMENT_PROOF_MAX_DATA_URL_LENGTH } from "@/lib/payment-proof-constants";
import { findTokenPackPlan } from "@/lib/plans";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { readSessionFromCookie } from "@/lib/session";
import { createStaticPaywayQrCheckout, isStaticPaywayQrEnabled } from "@/lib/static-payway";
import { createPaymentOrder, findUserById, listUserPaymentOrders } from "@/lib/store";
import { notifyPaymentProofToTelegram } from "@/lib/telegram";

const createOrderSchema = z.object({
  planId: z.enum(["starter", "creator", "pack_5", "pack_10", "pack_15", "pack_20"]),
  quantity: z.number().int().min(1).max(20),
  userNote: z.string().max(500).optional(),
  paymentReference: z.string().max(200).optional(),
  proofImageDataUrl: z
    .string()
    .max(PAYMENT_PROOF_MAX_DATA_URL_LENGTH)
    .regex(/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i)
    .optional()
    .nullable(),
});

export async function GET() {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await listUserPaymentOrders(session.userId);
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await findUserById(session.userId);
  if (!user || user.suspendedAt) {
    return NextResponse.json({ error: "Account is suspended." }, { status: 403 });
  }

  try {
    const body = await readJsonRequest(request);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payment order." }, { status: 400 });
    }

    const plan = findTokenPackPlan(parsed.data.planId);
    if (!plan) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }

    const usePayway = isPaywayQrEnabled();
    const useStaticPayway = isStaticPaywayQrEnabled();
    const orderId = usePayway || useStaticPayway ? createPaywayOrderId() : randomUUID();
    const totalPriceCents = plan.priceCents * parsed.data.quantity;
    const checkout = usePayway
      ? await createPaywayQrCheckout({
          orderId,
          totalPriceCents,
          planName: plan.name,
          quantity: parsed.data.quantity,
          userEmail: session.email,
        })
      : useStaticPayway
        ? createStaticPaywayQrCheckout({
            orderId,
            totalPriceCents,
          })
      : await createKhqrCheckout({
          orderId,
          totalPriceCents,
        });

    const order = await createPaymentOrder({
      id: orderId,
      userId: session.userId,
      planId: plan.id,
      planName: plan.name,
      quantity: parsed.data.quantity,
      unitPriceCents: plan.priceCents,
      tokensPerPack: plan.tokens,
      userNote: parsed.data.userNote?.trim() || null,
      paymentReference: checkout.md5,
      proofImageDataUrl: parsed.data.proofImageDataUrl || null,
      khqrPayload: checkout.payload,
      khqrMd5: checkout.md5,
      khqrImageDataUrl: checkout.imageDataUrl,
      khqrCurrency: checkout.currency,
      khqrAmount: checkout.amount,
      khqrExpiresAt: checkout.expiresAt,
      paymentProvider: usePayway ? "payway" : useStaticPayway ? "static_payway" : null,
    });

    let telegram: { sent: boolean; reason?: "not_configured" | "failed" | "skipped_no_proof" } = {
      sent: false,
      reason: "skipped_no_proof",
    };
    if (order.proofImageDataUrl) {
      const result = await notifyPaymentProofToTelegram({
        order,
        userEmail: session.email,
      });
      telegram = result;
    }
    await invalidateDashboardCountCache(session.userId, ["billing"]);

    return NextResponse.json({ ok: true, order, checkout, telegram });
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status });
    }
    if (error instanceof Error && error.message === "KHQR_ACCOUNT_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "KHQR is not configured. Set KHQR_BAKONG_ACCOUNT_ID or KHQR_ACCOUNT in .env." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "PAYWAY_QR_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "PayWay QR is enabled but PAYWAY_MERCHANT_ID or PAYWAY_API_KEY is missing." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message === "STATIC_PAYWAY_QR_IMAGE_NOT_FOUND") {
      return NextResponse.json(
        {
          error:
            "Static PayWay QR mode is enabled, but the QR image file is missing. Save your working QR image to public/payway-static-qr-code.png or set STATIC_PAYWAY_QR_IMAGE_URL.",
        },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message.startsWith("PAYWAY_QR_FAILED")) {
      return NextResponse.json({ error: error.message.replace(/^PAYWAY_QR_FAILED:\s*/, "") }, { status: 400 });
    }
    if (error instanceof Error && error.message.toLowerCase().includes("bakong account id")) {
      return NextResponse.json(
        { error: `${error.message}. Use your Bakong ID format, usually something like name@abaa.` },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message.toLowerCase().includes("khqr")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not create payment order." }, { status: 500 });
  }
}
