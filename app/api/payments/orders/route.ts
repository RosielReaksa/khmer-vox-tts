import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidateDashboardCountCache } from "@/lib/dashboard-count-cache";
import { createKhqrccOrderId, createKhqrccQrCheckout } from "@/lib/khqrcc";
import { PAYMENT_PROOF_MAX_DATA_URL_LENGTH } from "@/lib/payment-proof-constants";
import { findTokenPackPlan } from "@/lib/plans";
import { isJsonRequestError, jsonRequestErrorBody, readJsonRequest } from "@/lib/request-json";
import { readSessionFromCookie } from "@/lib/session";
import { createPaymentOrder, findUserById, listUserPaymentOrders } from "@/lib/store";

const createOrderSchema = z.object({
  planId: z.string().min(1).max(40),
  quantity: z.literal(1),
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

    const planId = parsed.data.planId.trim();
    if (planId === "starter") {
      return NextResponse.json(
        { error: "Starter subscription is no longer available. Choose Creator or a token pack." },
        { status: 400 },
      );
    }

    const plan = findTokenPackPlan(planId);
    if (!plan) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }

    const orderId = createKhqrccOrderId();
    const totalPriceCents = plan.priceCents;
    const checkout = await createKhqrccQrCheckout({
      orderId,
      totalPriceCents,
      planName: plan.name,
      quantity: 1,
      userEmail: session.email,
    });

    const order = await createPaymentOrder({
      id: orderId,
      userId: session.userId,
      planId: plan.id,
      planName: plan.name,
      quantity: 1,
      unitPriceCents: plan.priceCents,
      tokensPerPack: plan.tokens,
      userNote: parsed.data.userNote?.trim() || null,
      paymentReference: checkout.md5,
      proofImageDataUrl: null,
      khqrPayload: checkout.payload,
      khqrMd5: checkout.md5,
      khqrImageDataUrl: checkout.imageDataUrl,
      khqrCurrency: checkout.currency,
      khqrAmount: checkout.amount,
      khqrExpiresAt: checkout.expiresAt,
      paymentProvider: "khqrcc",
    });

    await invalidateDashboardCountCache(session.userId, ["billing"]);

    return NextResponse.json({ ok: true, order, checkout });
  } catch (error) {
    if (isJsonRequestError(error)) {
      return NextResponse.json(jsonRequestErrorBody(error), { status: error.status });
    }
    if (error instanceof Error && error.message === "KHQRCC_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "KHQRcc is not configured. Set KHQRCC_PROFILE_ID and KHQRCC_SECRET_KEY in the server environment." },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message.startsWith("KHQRCC_QR_FAILED")) {
      return NextResponse.json({ error: error.message.replace(/^KHQRCC_QR_FAILED:\s*/, "") }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not create payment order." }, { status: 500 });
  }
}
