import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { readSessionFromCookie } from "@/lib/session";
import { listPaymentOrdersForAdmin } from "@/lib/store";
import type { PaymentOrderStatus } from "@/lib/types";

export async function GET(request: Request) {
  const session = await readSessionFromCookie();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const requestedStatus = url.searchParams.get("status") ?? "pending";
  const status = ["pending", "approved", "rejected", "expired", "cancelled", "all"].includes(requestedStatus)
    ? (requestedStatus as PaymentOrderStatus | "all")
    : "pending";

  const orders = await listPaymentOrdersForAdmin(status);
  return NextResponse.json({ orders });
}
