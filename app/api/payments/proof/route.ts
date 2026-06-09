import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyPaymentProofToken } from "@/lib/payment-proof-token";
import { PAYMENT_PROOF_MAX_DATA_URL_LENGTH } from "@/lib/payment-proof-constants";
import { submitPaymentOrderProof } from "@/lib/store";
import { notifyPaymentProofToTelegram } from "@/lib/telegram";

const bodySchema = z.object({
  token: z.string().min(20),
  paymentReference: z.string().trim().max(200).optional().nullable(),
  userNote: z.string().trim().max(500).optional().nullable(),
  proofImageDataUrl: z
    .string()
    .max(PAYMENT_PROOF_MAX_DATA_URL_LENGTH)
    .regex(/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i)
    .optional()
    .nullable(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment proof." }, { status: 400 });
  }

  const tokenPayload = await verifyPaymentProofToken(parsed.data.token);
  if (!tokenPayload) {
    return NextResponse.json({ error: "Payment upload link is invalid or expired." }, { status: 401 });
  }

  if (!parsed.data.proofImageDataUrl) {
    return NextResponse.json(
      { error: "Attach the ABA receipt screenshot before submitting." },
      { status: 400 },
    );
  }

  const result = await submitPaymentOrderProof({
    orderId: tokenPayload.orderId,
    userId: tokenPayload.userId,
    paymentReference: parsed.data.paymentReference?.trim() || null,
    userNote: parsed.data.userNote?.trim() || null,
    proofImageDataUrl: parsed.data.proofImageDataUrl || null,
  });

  if (!result.ok || !result.order) {
    const status = result.reason === "ORDER_NOT_FOUND" ? 404 : 409;
    const message =
      result.reason === "ORDER_EXPIRED"
        ? "This payment order expired. Create a new order."
        : result.reason === "ORDER_ALREADY_DECIDED"
          ? "This payment order is already decided."
          : "Could not submit payment confirmation.";
    return NextResponse.json({ error: message }, { status });
  }

  const telegram = await notifyPaymentProofToTelegram({
    order: result.order,
    userEmail: "phone proof upload",
  });

  return NextResponse.json({ ok: true, order: result.order, telegram });
}
