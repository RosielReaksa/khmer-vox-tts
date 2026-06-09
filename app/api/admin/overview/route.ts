import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin-api";
import { cachedDashboardValue, dashboardCacheKey } from "@/lib/dashboard-count-cache";
import {
  listCustomersForAdmin,
  listGenerationsForAdmin,
  listPaymentOrdersForAdmin,
  listPaymentSupportTicketsForAdmin,
  listPaymentWebhookEventsForAdmin,
  listTelegramPaymentEventsForAdmin,
} from "@/lib/store";
import { getSystemStatus } from "@/lib/system-status";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const payload = await cachedDashboardValue(dashboardCacheKey("admin", "overview"), 10, async () => {
    const [customers, orders, supportTickets, webhookEvents, telegramEvents, recentGenerations, failedGenerations, systemStatus] =
      await Promise.all([
        listCustomersForAdmin(),
        listPaymentOrdersForAdmin("all"),
        listPaymentSupportTicketsForAdmin("open"),
        listPaymentWebhookEventsForAdmin({ limit: 12, status: "all" }),
        listTelegramPaymentEventsForAdmin({ limit: 12, status: "all" }),
        listGenerationsForAdmin({ limit: 12, status: "all" }),
        listGenerationsForAdmin({ limit: 8, status: "failed" }),
        getSystemStatus(),
      ]);

    return {
      customers,
      orders,
      supportTickets,
      webhookEvents,
      telegramEvents,
      recentGenerations,
      failedGenerations,
      systemStatus,
      generatedAt: new Date().toISOString(),
    };
  });
  return NextResponse.json(payload);
}
