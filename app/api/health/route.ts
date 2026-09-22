import { NextResponse } from "next/server";

import { getStoreMode } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Health probe used by k8s liveness + readiness and the Docker HEALTHCHECK.
 *
 * Query parameter `?deep=1` runs a real database connectivity check
 * (SELECT 1). Without it, this only confirms the Node process is alive and
 * able to respond — fast and safe for the liveness probe. The readiness
 * probe and any external monitor should pass `?deep=1` so that a
 * database outage removes this pod from service endpoints instead of silently
 * serving 500s.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";

  const checks: Record<string, { status: string; error?: string }> = {
    server: { status: "ok" },
  };

  let overallStatus: "ok" | "degraded" = "ok";

  if (deep) {
    const storeMode = getStoreMode();
    if (storeMode === "postgres") {
      try {
        const { testDatabaseConnectivity } = await import("@/lib/health-check");
        await testDatabaseConnectivity();
        checks.database = { status: "ok" };
      } catch (err) {
        checks.database = {
          status: "error",
          error: err instanceof Error ? err.message : "Database connection failed",
        };
        overallStatus = "degraded";
      }
    } else {
      // Local JSON store — nothing external to probe.
      checks.database = { status: "skipped" };
    }
  }

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      store: getStoreMode(),
      deep,
      checks,
    },
    { status: overallStatus === "ok" ? 200 : 503 },
  );
}
