import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { listPaymentSupportTicketsForAdmin } from "@/lib/store";
import type { PaymentSupportTicketStatus } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status") ?? "open";
  const status = ["open", "resolved", "all"].includes(requestedStatus)
    ? (requestedStatus as PaymentSupportTicketStatus | "all")
    : "open";
  const tickets = await listPaymentSupportTicketsForAdmin(status);

  return NextResponse.json({ tickets });
}
