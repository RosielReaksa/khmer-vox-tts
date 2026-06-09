import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/admin";
import { getCurrentUser } from "@/lib/current-user";
import { listCustomersForAdmin } from "@/lib/store";

export const runtime = "nodejs";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customers = await listCustomersForAdmin();
  const rows = [
    [
      "id",
      "email",
      "token_balance",
      "total_credits_earned",
      "total_generations",
      "api_requests",
      "payment_orders",
      "active_api_keys",
      "suspended_at",
      "created_at",
      "last_activity_at",
    ],
    ...customers.map((customer) => [
      customer.user.id,
      customer.user.email,
      customer.tokenBalance,
      customer.totalCreditsEarned,
      customer.totalGenerations,
      customer.apiRequests,
      customer.paymentOrders,
      customer.activeApiKeys,
      customer.user.suspendedAt,
      customer.user.createdAt,
      customer.lastActivityAt,
    ]),
  ];
  const csv = `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=customers.csv",
    },
  });
}
