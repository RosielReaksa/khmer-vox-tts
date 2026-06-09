import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdminEmail } from "@/lib/admin";
import { invalidateDashboardCountCache } from "@/lib/dashboard-count-cache";
import { readSessionFromCookie } from "@/lib/session";
import { approvePaymentOrder } from "@/lib/store";

const actionSchema = z.object({
  adminNote: z.string().max(500).optional(),
});

const reasonMessages: Record<string, string> = {
  ORDER_EXPIRED: "This KHQR order expired. Ask the user to create a new payment order.",
  ORDER_ALREADY_DECIDED: "This payment order is already decided.",
  ORDER_NOT_FOUND: "Payment order not found.",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid approval note." }, { status: 400 });
    }

    const result = await approvePaymentOrder({
      orderId: id,
      adminUserId: session.userId,
      adminNote: parsed.data.adminNote?.trim() || null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: reasonMessages[result.reason ?? ""] ?? "Could not approve order.", order: result.order },
        { status: result.reason === "ORDER_NOT_FOUND" ? 404 : 409 },
      );
    }

    if (result.order) {
      await invalidateDashboardCountCache(result.order.userId, ["api", "billing", "history"]);
    }

    return NextResponse.json({ ok: true, order: result.order });
  } catch {
    return NextResponse.json({ error: "Could not approve order." }, { status: 500 });
  }
}
