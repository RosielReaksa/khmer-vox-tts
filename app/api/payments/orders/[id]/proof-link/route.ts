import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";

import { createPaymentProofToken } from "@/lib/payment-proof-token";
import { readSessionFromCookie } from "@/lib/session";
import { listUserPaymentOrders } from "@/lib/store";

const paramsSchema = z.object({
  id: z.string().min(6).max(80).regex(/^[a-z0-9_-]+$/i),
});

function cleanEnv(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^"|"$/g, "");
}

function publicBaseUrl(request: Request): string {
  const phoneBase = cleanEnv("APP_PHONE_UPLOAD_BASE_URL");
  if (phoneBase) return phoneBase.replace(/\/$/, "");

  const appPublicUrl = cleanEnv("APP_PUBLIC_URL");
  if (appPublicUrl && !appPublicUrl.includes("localhost")) {
    return appPublicUrl.replace(/\/$/, "");
  }

  return new URL(request.url).origin.replace(/\/$/, "");
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid payment order id." }, { status: 400 });
  }

  const orders = await listUserPaymentOrders(session.userId);
  const order = orders.find((item) => item.id === parsedParams.data.id);
  if (!order) {
    return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
  }
  if (order.status !== "pending") {
    return NextResponse.json({ error: "This payment order is already decided." }, { status: 409 });
  }

  const token = await createPaymentProofToken({
    orderId: order.id,
    userId: session.userId,
  });
  const uploadUrl = `${publicBaseUrl(request)}/payment-proof?token=${encodeURIComponent(token)}`;
  const qrDataUrl = await QRCode.toDataURL(uploadUrl, {
    margin: 1,
    width: 360,
    errorCorrectionLevel: "M",
  });

  return NextResponse.json({
    uploadUrl,
    qrDataUrl,
    expiresInSeconds: 60 * 60 * 2,
  });
}

