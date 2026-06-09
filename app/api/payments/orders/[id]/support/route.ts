import { NextResponse } from "next/server";
import { z } from "zod";

import { readSessionFromCookie } from "@/lib/session";
import { createPaymentSupportTicket, listUserPaymentOrders } from "@/lib/store";
import { notifyPaymentSupportTicketToTelegram } from "@/lib/telegram";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().min(6).max(80).regex(/^[a-z0-9_-]+$/i),
});

const bodySchema = z.object({
  message: z.string().trim().min(5).max(500),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

const reasonMessages: Record<string, string> = {
  ORDER_NOT_FOUND: "Payment order not found.",
  TICKET_ALREADY_OPEN: "A support request is already open for this payment order.",
};

export async function POST(request: Request, context: RouteContext) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid payment order id." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Write a support message between 5 and 500 characters." },
      { status: 400 },
    );
  }

  const result = await createPaymentSupportTicket({
    userId: session.userId,
    paymentOrderId: parsedParams.data.id,
    userMessage: parsedBody.data.message,
  });

  if (!result.ok || !result.ticket) {
    return NextResponse.json(
      { error: reasonMessages[result.reason ?? ""] ?? "Could not create support request." },
      { status: result.reason === "ORDER_NOT_FOUND" ? 404 : 409 },
    );
  }

  let telegram: Awaited<ReturnType<typeof notifyPaymentSupportTicketToTelegram>> = {
    sent: false,
    reason: "not_configured",
  };
  if (result.reason !== "TICKET_ALREADY_OPEN") {
    const orders = await listUserPaymentOrders(session.userId);
    const order = orders.find((item) => item.id === parsedParams.data.id);
    if (order) {
      telegram = await notifyPaymentSupportTicketToTelegram({
        ticket: result.ticket,
        order,
        userEmail: session.email,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ticket: result.ticket,
    telegram,
    message:
      result.reason === "TICKET_ALREADY_OPEN"
        ? reasonMessages.TICKET_ALREADY_OPEN
        : "Support request sent. Admin can now review this payment.",
  });
}
