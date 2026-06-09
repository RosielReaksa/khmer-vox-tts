import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { listTelegramPaymentEventsForAdmin } from "@/lib/store";
import type { TelegramPaymentEventDecision } from "@/lib/types";

const statuses: Array<TelegramPaymentEventDecision | "all"> = [
  "all",
  "ready_to_approve",
  "auto_approved",
  "manual_approved",
  "needs_review",
  "ignored",
  "duplicate",
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
  const status = statuses.includes(requestedStatus as TelegramPaymentEventDecision | "all")
    ? (requestedStatus as TelegramPaymentEventDecision | "all")
    : "all";
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const orderId = url.searchParams.get("orderId");

  const events = await listTelegramPaymentEventsForAdmin({
    status,
    orderId,
    limit: Number.isFinite(limit) ? limit : 100,
  });

  return NextResponse.json({ events });
}
