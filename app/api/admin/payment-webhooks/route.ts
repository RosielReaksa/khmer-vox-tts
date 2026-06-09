import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { listPaymentWebhookEventsForAdmin } from "@/lib/store";
import type { PaymentWebhookEventStatus } from "@/lib/types";

const statuses: Array<PaymentWebhookEventStatus | "all"> = [
  "all",
  "credited",
  "not_credited",
  "invalid",
  "error",
];

export async function GET(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status") ?? "all";
  const status = statuses.includes(requestedStatus as PaymentWebhookEventStatus | "all")
    ? (requestedStatus as PaymentWebhookEventStatus | "all")
    : "all";
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const orderId = url.searchParams.get("orderId");

  const events = await listPaymentWebhookEventsForAdmin({
    status,
    orderId,
    limit: Number.isFinite(limit) ? limit : 100,
  });

  return NextResponse.json({ events });
}
