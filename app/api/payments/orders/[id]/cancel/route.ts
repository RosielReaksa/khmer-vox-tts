import { NextResponse } from "next/server";
import { z } from "zod";

import { invalidateDashboardCountCache } from "@/lib/dashboard-count-cache";
import { readSessionFromCookie } from "@/lib/session";
import { cancelPaymentOrder } from "@/lib/store";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().min(6).max(80).regex(/^[a-z0-9_-]+$/i),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment order id." }, { status: 400 });
  }

  const result = await cancelPaymentOrder({
    orderId: parsed.data.id,
    userId: session.userId,
  });

  if (!result.ok || !result.order) {
    const status = result.reason === "ORDER_NOT_FOUND" ? 404 : 409;
    const message =
      result.reason === "ORDER_ALREADY_APPROVED"
        ? "This payment is already approved and cannot be cancelled."
        : result.reason === "ORDER_EXPIRED"
          ? "This payment order already expired."
          : result.reason === "ORDER_ALREADY_DECIDED"
            ? "This payment order is already closed."
            : "Could not cancel payment order.";
    return NextResponse.json({ error: message, order: result.order }, { status });
  }

  await invalidateDashboardCountCache(session.userId, ["billing"]);

  return NextResponse.json({ ok: true, order: result.order });
}
