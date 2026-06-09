import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import {
  confirmPaymentOrderPaid,
  getTelegramPaymentEventById,
  updateTelegramPaymentEventDecision,
} from "@/lib/store";

type ActionInput = {
  adminNote: string | null;
  returnTo: string | null;
};

async function readActionInput(request: Request): Promise<ActionInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as {
      adminNote?: unknown;
      returnTo?: unknown;
    };
    return {
      adminNote: typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : null,
      returnTo: typeof body.returnTo === "string" ? body.returnTo : null,
    };
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return { adminNote: null, returnTo: null };
  const adminNote = formData.get("adminNote");
  const returnTo = formData.get("returnTo");
  return {
    adminNote: typeof adminNote === "string" ? adminNote.trim().slice(0, 500) : null,
    returnTo: typeof returnTo === "string" ? returnTo : null,
  };
}

function redirectOrJson(request: Request, input: ActionInput, data: unknown, status = 200) {
  if (input.returnTo?.startsWith("/app/admin/")) {
    const url = new URL(input.returnTo, request.url);
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json(data, { status });
}

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

  const input = await readActionInput(request);
  const { id } = await params;
  const event = await getTelegramPaymentEventById(id);
  if (!event) {
    return redirectOrJson(request, input, { error: "Telegram payment event not found." }, 404);
  }
  if (!event.matchedOrderId) {
    await updateTelegramPaymentEventDecision({
      eventId: event.id,
      decisionStatus: "error",
      decisionReason: "MANUAL_APPROVE_MISSING_ORDER",
    });
    return redirectOrJson(request, input, { error: "This event is not matched to an order." }, 409);
  }
  if (event.parsedAmount === null || !event.parsedCurrency) {
    await updateTelegramPaymentEventDecision({
      eventId: event.id,
      decisionStatus: "error",
      decisionReason: "MANUAL_APPROVE_MISSING_AMOUNT",
    });
    return redirectOrJson(request, input, { error: "This event has no parsed payment amount." }, 409);
  }

  const result = await confirmPaymentOrderPaid({
    orderId: event.matchedOrderId,
    provider: "telegram_payway",
    providerTransactionId: event.parsedTransactionId || `telegram-event:${event.id}`,
    providerReference: event.parsedReference || `telegram-event:${event.id}`,
    providerApprovalCode: null,
    providerStatusCode: "telegram_manual",
    providerStatus: event.parsedStatus || "manual_approved",
    providerAmount: event.parsedAmount,
    providerCurrency: event.parsedCurrency,
    providerPayload: event.rawPayload,
    paidAt: null,
    adminNote: input.adminNote || "Manually approved from Telegram payment monitor.",
    approvedByUserId: session.userId,
  });

  await updateTelegramPaymentEventDecision({
    eventId: event.id,
    decisionStatus: result.ok ? "manual_approved" : "error",
    decisionReason: result.ok ? result.reason ?? "MANUAL_APPROVED_BY_ADMIN" : result.reason ?? "MANUAL_APPROVE_FAILED",
    autoApproveAttempted: false,
  });

  return redirectOrJson(
    request,
    input,
    result.ok
      ? { ok: true, order: result.order }
      : { error: result.reason ?? "Could not approve from Telegram event.", order: result.order },
    result.ok ? 200 : 409,
  );
}
