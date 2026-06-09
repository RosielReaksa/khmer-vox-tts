import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidateDashboardCountCache } from "@/lib/dashboard-count-cache";
import { PAYMENT_PROOF_MAX_DATA_URL_LENGTH } from "@/lib/payment-proof-constants";
import { readSessionFromCookie } from "@/lib/session";
import { listUserPaymentOrders, submitPaymentOrderProof } from "@/lib/store";
import { notifyPaymentProofToTelegram } from "@/lib/telegram";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().min(6).max(80).regex(/^[a-z0-9_-]+$/i),
});

const proofSchema = z.object({
  paymentReference: z.string().trim().max(200).optional().nullable(),
  userNote: z.string().trim().max(500).optional().nullable(),
  paymentMethod: z.enum(["ABA", "ACLEDA"]).optional().nullable(),
  proofImageDataUrl: z
    .string()
    .max(PAYMENT_PROOF_MAX_DATA_URL_LENGTH)
    .regex(/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i)
    .optional()
    .nullable(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment order id." }, { status: 400 });
  }

  const orders = await listUserPaymentOrders(session.userId);
  const order = orders.find((item) => item.id === parsed.data.id);
  if (!order) {
    return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
  }

  return NextResponse.json({ order });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid payment order id." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = proofSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid payment confirmation." }, { status: 400 });
  }

  if (!parsedBody.data.proofImageDataUrl) {
    return NextResponse.json(
      { error: "Attach the ABA receipt screenshot before submitting." },
      { status: 400 },
    );
  }

  const result = await submitPaymentOrderProof({
    orderId: parsedParams.data.id,
    userId: session.userId,
    paymentReference: parsedBody.data.paymentReference?.trim() || null,
    userNote: parsedBody.data.userNote?.trim() || null,
    paymentMethod: parsedBody.data.paymentMethod ?? null,
    proofImageDataUrl: parsedBody.data.proofImageDataUrl || null,
  });

  if (!result.ok || !result.order) {
    const status = result.reason === "ORDER_NOT_FOUND" ? 404 : 409;
    const message =
      result.reason === "ORDER_EXPIRED"
        ? "This payment order expired. Create a new order."
        : result.reason === "ORDER_ALREADY_DECIDED"
          ? "This payment order is already decided."
          : "Could not submit payment confirmation.";
    return NextResponse.json({ error: message, order: result.order }, { status });
  }

  const telegram = await notifyPaymentProofToTelegram({
    order: result.order,
    userEmail: session.email,
  });
  await invalidateDashboardCountCache(session.userId, ["billing"]);

  return NextResponse.json({ ok: true, order: result.order, telegram });
}
