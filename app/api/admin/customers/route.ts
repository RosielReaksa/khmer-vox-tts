import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/lib/admin-api";
import { cachedDashboardValue, dashboardCacheKey } from "@/lib/dashboard-count-cache";
import { listCustomersForAdmin } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const payload = await cachedDashboardValue(dashboardCacheKey("admin", "customers"), 15, async () => {
    const customers = await listCustomersForAdmin();
    return {
      customers,
      generatedAt: new Date().toISOString(),
    };
  });
  return NextResponse.json(payload);
}
